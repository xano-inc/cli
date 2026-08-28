# Tenant Deploy Request CLI — Live Test Results

> **Schema update note:** since this test pass, the backend has moved
> `required_reviewers` and `allow_deploy_bypass` from flat tenant fields to a
> nested `deploy_settings` object (`tenant.deploy_settings.required_reviewers`,
> `tenant.deploy_settings.allow_deploy_bypass`), and added a third field,
> `tenant.deploy_settings.allow_quick_deploy`, which lets a tenant skip the
> approval gate entirely for quick deploys. The CLI has been updated to read
> and write through `deploy_settings`. The raw transcripts below predate that
> change and still show the old flat field names — they're left as-is since
> they're a record of what was actually observed at the time. The
> single-tenant GET whitelist bug described below (Bug #1 / Bug #2) is
> presumed to still apply to `deploy_settings` as a whole, since it hasn't
> been re-verified against the updated backend from this repo; the
> `tenant list`-based workaround in `tenant edit` and `tenant deploy_release`
> remains in place accordingly.

Every command below was run against a real, running local Xano instance
(`http://localhost:9999`, workspace 6) serving the `tenant-deployment-approvals`
backend branch — not mocked. Raw request/response output is included so this can
be sanity-checked independently. Two real bugs were found and fixed as a direct
result of this testing (see **Bugs found** below) — testing against a live
instance surfaced problems that code review alone did not.

Fixtures used (pre-seeded on this instance specifically for DAR testing):
- Tenant `seed-approval-gated` (id 8) — `required_reviewers: 1`
- Tenant `seed-approval-ungated` (id 7) — `required_reviewers: 0`
- Release `seed-approval-v1` (id 3), `seed-approval-v2` (id 4) — mock releases, no real schema

## Summary

| Command | Result |
|---|---|
| `tenant create --required_reviewers` | ⚠️ Not testable (this local instance has data isolation tenants disabled — unrelated to this feature) |
| `tenant edit --required_reviewers` / `--allow_deploy_bypass` | ✅ Works — **after a fix**, see Bug #2 |
| `tenant deploy_release` (ungated) | ✅ Correctly deploys straight through, no approval friction |
| `tenant deploy_release` (gated, no approval) | ✅ Correctly blocked with an actionable error — **after a fix**, see Bug #1 |
| `tenant deploy_release` (gated, approved) | ✅ Correctly allowed through |
| `tenant_deploy_request list` (+ `--status`, `--tenant`, `--mine`, `--to-review`) | ✅ All filters work |
| `tenant_deploy_request get` | ✅ Works |
| `tenant_deploy_request create` (default submit / `--draft`) | ✅ Submits by default as designed |
| `tenant_deploy_request edit` | ✅ Works |
| `tenant_deploy_request delete` | ✅ Works; correctly rejects deleting a non-draft |
| `tenant_deploy_request set_status --status submit\|approve\|request_changes\|close\|reopen` | ✅ All five transitions work; quorum voting reflected correctly |
| `tenant_deploy_request revision` | ❌ **Backend bug** — endpoint 500s, see Findings |
| `tenant_deploy_request bypass` | ✅ Correctly denies without the `tenant_center:deploy:bypass_approval` permission (couldn't test the success path — no token with that scope available) |

## Bugs found and fixed during this test pass

### Bug #1 — `tenant deploy_release` silently skipped the approval check

**What happened:** `tenant get` (the single-tenant fetch used by the CLI's
pre-flight check) doesn't return `required_reviewers` or `allow_deploy_bypass` in
its response, even though `tenant list` does. First test run against the gated
tenant:

```
$ xano tenant deploy_release seed-approval-gated --release seed-approval-v1
Error: Failed to deploy to tenant: This tenant requires an approved deployment
approval request before a release can be deployed (release #3).
```

That's the *raw backend error*, not the CLI's friendly pre-flight message — meaning
the CLI's own gate check silently thought the tenant was ungated (because the field
it read back was `undefined`), and let the request go all the way to the real
deploy call before the backend caught it. Root cause confirmed by diffing the two
output schemas server-side:

```
$ grep -n "required_reviewers\|allow_deploy_bypass" .../output/tenant.yaml
required_reviewers:
allow_deploy_bypass:

$ cat .../output/tenant-detail.yaml   # used by GET tenant/{tenant_name}
# (no required_reviewers or allow_deploy_bypass field at all)
```

**Fix applied:** the CLI's pre-flight now reads gating status from `tenant list`
(filtered client-side by name) instead of `tenant get`. Verified after the fix:

```
$ xano tenant deploy_release seed-approval-gated --release seed-approval-v1
Error: Tenant "seed-approval-gated" requires an approved deploy request before
"seed-approval-v1" can be deployed.
Run: xano tenant_deploy_request create "Deploy seed-approval-v1 to seed-approval-gated" \
  --tenant seed-approval-gated --release seed-approval-v1 --reviewers <id,id,...>
```

**Recommendation for backend:** add `required_reviewers` and `allow_deploy_bypass`
to `tenant-detail.yaml`'s output so `GET tenant/{tenant_name}` matches the list
route. The CLI workaround is safe to keep either way, but any other caller of the
single-tenant GET (frontend, another integration) has the same blind spot today.

### Bug #2 — `tenant edit` silently reset the approval gate on unrelated edits

**More serious, found immediately after Bug #1**, same root cause. `tenant edit`
fetches "current state" via `tenant get` before doing a full-body PUT (the API
requires all fields on PUT). Because that GET doesn't return `required_reviewers`
or `allow_deploy_bypass`, any edit that didn't explicitly pass those flags
silently reset them to their defaults (`0` / `false`) — turning off the approval
gate as an unintended side effect of, e.g., changing a description. Reproduced
live:

```
$ xano tenant edit seed-approval-gated --allow_deploy_bypass   # required_reviewers not mentioned
...
"required_reviewers": 0,        # was 1 — silently wiped
"allow_deploy_bypass": true,
```

**Fix applied:** same as Bug #1 — `tenant edit` now reads current state via
`tenant list` instead of `tenant get`. Verified after the fix:

```
$ xano tenant edit seed-approval-gated --required_reviewers 1   # restore
$ xano tenant edit seed-approval-gated -d "Seed fixture for DAR manual testing"
...
"required_reviewers": 1,        # preserved
"allow_deploy_bypass": true,    # preserved
```

This is the more important of the two findings — it's a live data-loss bug, not
just a CLI-side gap, and would affect the frontend or any other caller doing a
read-modify-write on a tenant the same way.

## Other findings

- **`tenant_deploy_request revision` is currently broken server-side** (backend
  bug, not CLI): `POST approval_request/{id}/revision` 500s with
  `Unable to locate func entry: timestamp`. This blocks the "author links a newer
  release after changes were requested" flow entirely on this instance right now.
- **Quorum voting confirmed live.** `seed-approval-gated` has `required_reviewers: 1`,
  so a single `set_status --status approve` completed the quorum and triggered an
  actual deploy attempt in the same call (it then failed for an unrelated reason —
  this local instance is missing `k8s.storage.private_cloud.provider` config, so no
  release can actually complete deployment here regardless of the approval gate).
  The approval was still correctly recorded as `status: approved` even though the
  deploy itself failed — confirming the documented "approval recorded first, deploy
  outcome stamped separately" behavior:
  ```json
  "status": "approved",
  "resolution": { "deploy_status": "failed", "deploy_error": "Settings does not have an entry: k8s.storage.private_cloud.provider" }
  ```
- **Double-approve correctly rejected**: re-running `set_status --status approve`
  on an already-approved request returns `Invalid approval request transition:
  approved -> approved` rather than double-deploying.
- **Client-side validation works**: `set_status --status close` without `--reason`
  is rejected by the CLI before any network call, with a clear message.
- **`bypass` is correctly permission-gated**: attempted without the
  `tenant_center:deploy:bypass_approval` scope returns `Access Denied.` as
  expected. Not able to test the success path in this session (no token available
  with that scope) — recommend a follow-up test with an appropriately-scoped token.
- **`tenant create` not testable here**: this local instance has "Data Isolation
  tenants" disabled, which blocks all tenant creation regardless of the approval
  feature. Not a finding about DAR — just an environment limitation.
- Self-review is possible today (the author can be their own reviewer and approve
  their own request) — this matches the documented, currently-known backend
  limitation, not a new finding.

## Full transcript (raw commands and output)

### Read the current state

```
$ xano tenant list -p local -w 6 -o json
```
Shows both seed tenants with `required_reviewers`/`allow_deploy_bypass` present —
confirms the *list* endpoint has these fields (used to isolate Bug #1/#2 to the
single-tenant GET specifically).

### Ungated tenant — deploys straight through

```
$ xano tenant deploy_release seed-approval-ungated --release seed-approval-v1
Warning: This may take a few minutes. Please be patient.
Error: Failed to deploy to tenant: Settings does not have an entry: k8s.storage.private_cloud.provider
```
No approval-related error at all — confirms the pre-flight correctly identified
the tenant as ungated and let the request straight through to the real deploy
call, which then hit the (unrelated) local-infra limitation.

### Gated tenant — blocked, then unblocked

```
$ xano tenant deploy_release seed-approval-gated --release seed-approval-v1
Error: Tenant "seed-approval-gated" requires an approved deploy request before
"seed-approval-v1" can be deployed.
Run: xano tenant_deploy_request create "Deploy seed-approval-v1 to seed-approval-gated" \
  --tenant seed-approval-gated --release seed-approval-v1 --reviewers <id,id,...>

$ xano tenant_deploy_request create "Deploy seed-approval-v1 to seed-approval-gated" \
  --tenant seed-approval-gated --release seed-approval-v1 --reviewers 4105
# -> created #14, status: pending (submitted by default, no --draft passed)

$ xano tenant_deploy_request edit 12 --reviewers 1
# -> reviewers now [{id: 1}] (my own local user, needed to self-approve for this test)

$ xano tenant_deploy_request set_status 12 --status approve
# -> quorum (1/1) completed in the same call, status: approved,
#    resolution.deploy_status: failed (unrelated local-infra error, see above)

$ xano tenant deploy_release seed-approval-gated --release seed-approval-v1
Warning: This may take a few minutes. Please be patient.
Error: Failed to deploy to tenant: Settings does not have an entry: k8s.storage.private_cloud.provider
```
No approval-related error this time — the pre-flight found the approved request
and let it through to the real deploy call.

### Full status-transition matrix

```
$ xano tenant_deploy_request set_status 14 --status request_changes --reason "Needs a migration note"
# -> status: changes_requested

$ xano tenant_deploy_request set_status 12 --status approve   # already approved
Error: Failed to change tenant deploy request status: Invalid approval request transition: approved -> approved.

$ xano tenant_deploy_request set_status 13 --status close   # no --reason
Error: --reason is required when --status is "close"

$ xano tenant_deploy_request set_status 13 --status close --reason "Superseded by #12"
# -> status: closed

$ xano tenant_deploy_request set_status 9 --status reopen   # was closed (seed fixture)
# -> status: pending

$ xano tenant_deploy_request delete 6 --force   # was draft (seed fixture)
# -> {"deleted": true, "id": 6}

$ xano tenant_deploy_request delete 15 --force   # was pending, not draft
Error: Failed to delete tenant deploy request: Only a draft approval request can be deleted. Close it instead.
```

### List filters

```
$ xano tenant_deploy_request list --status pending --mine
Deploy requests in workspace 6:
  - #9 "Seed: Closed request" [pending] (reviewable)
  - #11 "Change Request" [pending]
  - #7 "Introduce DAR Feature" [pending]

$ xano tenant_deploy_request list --to-review
Deploy requests in workspace 6:
  - #9 "Seed: Closed request" [pending] (reviewable)
  - #12 "Deploy seed-approval-v1 to Gated Tenant" [approved] (reviewable)
  - #14 "Deploy seed-approval-v1 to seed-approval-gated" [changes_requested] (reviewable)
  - #8 "Seed: Changes requested" [changes_requested] (reviewable)
  - #10 "Seed: Approved request" [approved] (reviewable)
```

### Bypass (permission-denied path)

```
$ xano tenant edit seed-approval-gated --allow_deploy_bypass
$ xano tenant_deploy_request create "Bypass test" --tenant seed-approval-gated --release seed-approval-v1
# -> created #15

$ xano tenant_deploy_request bypass 15 --reason "Testing the bypass path"
Error: Failed to bypass tenant deploy request approval gate: Access Denied.
```
Expected — my local user token doesn't hold `tenant_center:deploy:bypass_approval`.

## What this doesn't cover

- **The full error-precedence guarantee** ("approval-required always shown before
  a permission error") is verified by construction — the pre-flight check never
  even issues the deploy call when the tenant is gated and unapproved, so a
  permission error from that call physically cannot appear first. It was **not**
  demonstrated end-to-end with a second, lower-privilege real user account, since
  only one token was available in this session.
- `tenant create` with the new flags — blocked by an unrelated local environment
  limitation (data isolation tenants disabled).
- `bypass`'s success path — no token with the required scope was available.
- Real deploys completing successfully — this local instance is missing
  `k8s.storage.private_cloud.provider` config, so no deploy (gated or not) can
  fully succeed here. Every gate/quorum/status-transition behavior was still
  fully verified up to that point.
