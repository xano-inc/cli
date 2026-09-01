# Xano CLI

Command-line interface for the Xano Metadata API.

[![Version](https://img.shields.io/npm/v/@xano/cli.svg)](https://npmjs.org/package/@xano/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@xano/cli.svg)](https://npmjs.org/package/@xano/cli)

## Installation

```bash
npm install -g @xano/cli
```

## Quick Start

1. Authenticate with Xano:
   ```bash
   xano auth
   ```

2. List your workspaces:
   ```bash
   xano workspace list
   ```

3. Pull a workspace to local files:
   ```bash
   xano workspace pull
   ```

## Commands

### Safety warnings in command help

Destructive commands include imperative safety prefixes in their help text and flag descriptions so automated agents (e.g. Claude Code, Cursor) pause before running them in auto-accept mode:

- **`[CRITICAL]`** — Agents must STOP and confirm with the user before running. Used for irreversible or high-blast-radius operations, including (but not limited to) `--force` deletions, `workspace edit --allow-push`, `workspace push --records`, `workspace/sandbox push --truncate`, `--no-transaction`, `--sync --delete`, backup restore/delete, cluster delete, `env set_all`, `sandbox reset`, `sandbox delete`, `profile delete`, and tenant deploys.
- **`[IMPORTANT]`** — Agents should confirm with the user (and prefer `--dry-run` previews where applicable). Used for base `workspace push` and `sandbox push`, `branch set_live`, `release import`, `release push`, `release deploy`, and single-variable env / workflow-test deletes.

These warnings are layer 1 of broader push-safety work; ephemeral sandbox environments and push preview remain the structural safeguards.

### Paging on list commands

The Metadata API pages unevenly, so `list` commands differ in what they expose. Every command reports only what its endpoint actually returns — the CLI never guesses whether more results exist.

| Commands | Flags | Footer |
|---|---|---|
| `function list`, `unit_test list`, `workflow_test list` (plus `sandbox` / `tenant` variants) | `--page`, `--per_page` | `Page 2 · 50 shown · next: --page 3` |
| `static_host list`, `static_host build list` (plus `ephemeral` variants) | `--page` only | `Page 2 · 100 shown · 340 total` |
| `branch list`, `workspace list`, `tenant snapshot list`, `sandbox env list`, `tenant env list` | none | `12 branches` |
| `tenant list`, `release list`, `platform list`, `tenant cluster list`, `ephemeral list` | none | none |
| `tenant backup list` | `--page` only (pre-existing) | none |

Notes:

- **`--per_page` is only offered where the endpoint accepts it.** Static-host endpoints hardcode 100 items per page server-side, so those commands take `--page` alone. `xano static_host list --per_page 10` previously parsed but did nothing; it is now rejected rather than silently ignored.
- **All paged commands default `--per_page` to 50.** The test-list commands previously requested 10000 internally so nothing was ever cut off; now that the footer and the JSON envelope both report position, a page that stops at 50 is visible rather than silent. Raise it (up to 10000) when you want everything in one call.
- **The last group has no CLI paging.** Those endpoints page server-side but return a plain array with no page or total metadata, so the CLI cannot tell you where you are. Rather than show a page number with no context — or infer "more available" from a full page, which is wrong exactly when the result count is a multiple of the page size — these commands are left as-is. **They return at most 25–50 items** (50 for tenants and ephemerals, 25 for releases, platforms, and tenant backups). If you have more than that, query the Metadata API directly until those endpoints return paging metadata.
- **`--output json` returns an envelope, not a bare array.** Every list command emits `{items, ...}` using the Metadata API's own field names — `curPage`, `nextPage`, `prevPage`, `itemsTotal` — each included only when the endpoint actually reports it. `perPage` is the one field the CLI adds, since the API never echoes it back and it is otherwise invisible at its default. This is a **breaking change** for scripts that parsed the previous bare array — read `.items` instead.

  ```jsonc
  // xano function list -o json
  {
    "curPage": 2,
    "perPage": 50,      // injected by the CLI; everything else mirrors the API
    "nextPage": 3,      // absent on the last page — never inferred
    "prevPage": 1,
    "items": [ /* ... */ ]
  }
  ```

  The point of the envelope is that a script gets the same honest stop condition a human gets from the footer, in the same shape the raw Metadata API returns. Without it the only signal available is `items.length < perPage`, which is wrong exactly when the result count is a multiple of the page size. Absence of `nextPage` means the server said there is no next page; it is never omitted as a guess.

### Authentication

```bash
# Interactive browser-based authentication
xano auth
xano auth --origin https://custom.xano.com
xano auth --insecure                         # Skip TLS verification (self-signed certs)
xano auth --no-browser                       # Headless login (no local callback server)

# Pre-select instance/workspace/branch and profile name (skips the pickers)
xano auth -i my-instance -w 5 -b dev -p staging
xano auth --instance my-instance --workspace "My Workspace" --branch dev --profile staging

# Pass "" to take a picker's default: skip workspace, use live branch, default profile name
xano auth -i my-instance -w 5 -b "" -p ""
```

The default flow starts a temporary callback server on `127.0.0.1` and waits
for the browser to redirect back to it. On remote/SSH sessions, Docker
containers, or locked-down networks where the browser can't reach the CLI's
loopback address, use `--no-browser`: the CLI prints a login URL, you open it
in any browser, and paste back the code it displays. No local server required.

Each picker can be pre-answered with a flag: `-i/--instance` (instance name, or numeric instance ID),
`-w/--workspace` (workspace ID or name), `-b/--branch` (branch label), and
`-p/--profile` (profile name to save). An empty value (`""`) takes the
picker's default answer: `-w ""` skips workspace selection, `-b ""` skips and
uses the live branch, and `-p ""` uses the default profile name. With all four
set alongside `--no-browser`, the only input is pasting the code from the
browser — useful for scripted or remote setups.

When stdin is piped (not a TTY), `--no-browser` reads the code directly from
stdin instead of prompting, so scripts and AI agents can complete the flow
without an interactive terminal:

```bash
echo "$CODE" | xano auth --no-browser -i my-instance -w 5 -b dev -p staging
```

If you can't run `xano auth` at all, you can always create a profile manually
with a Metadata API token from the Xano dashboard — see
[Profiles](#profiles) below.

### Profiles

Profiles store your Xano credentials and default workspace settings.

> **Juggling multiple workspaces?** Pin a project to a specific profile with a
> project-local `profile.yaml` so commands can't accidentally target the wrong
> workspace when you forget `-p`. See
> [Project-local profile](#project-local-profile-profileyaml).

```bash
# Create a profile interactively
xano profile wizard

# Create a profile manually
xano profile create myprofile -i https://instance.xano.com -t <access_token>
xano profile create myprofile -i https://self-signed.example.com -t <token> --insecure

# List profiles
xano profile list
xano profile list --details                  # Show masked tokens and settings

# Get/set default profile
xano profile get
xano profile set myprofile

# Edit a profile
xano profile edit myprofile -w 123
xano profile edit myprofile -b dev           # Set branch
xano profile edit myprofile --insecure       # Enable insecure mode (self-signed certs)
xano profile edit myprofile --remove-insecure # Disable insecure mode
xano profile edit myprofile --remove-branch  # Remove branch from profile
xano profile edit myprofile --remove-workspace # Remove workspace from profile

# Get current user info
xano profile me

# Print access token (useful for piping)
xano profile token

# Print workspace ID (useful for piping)
xano profile workspace

# Interactively change the workspace on a profile
xano profile workspace set
xano profile workspace set -p production

# Pin a profile for the current project (writes ./profile.yaml)
xano profile use staging
xano profile use staging -w 110       # pin and override the workspace
xano profile use staging --gitignore  # also add profile.yaml to .gitignore

# Delete a profile
xano profile delete myprofile
xano profile delete myprofile --force
```

### Workspaces

```bash
# List all workspaces
xano workspace list

# Get workspace details
xano workspace get -w <workspace_id>

# Create a workspace
xano workspace create my-workspace
xano workspace create my-workspace -d "My application workspace"

# Edit a workspace
xano workspace edit -w <workspace_id> --name "new-name" -d "Updated description"
xano workspace edit -w <workspace_id> --swagger          # Enable swagger docs
xano workspace edit -w <workspace_id> --no-swagger       # Disable swagger docs
xano workspace edit -w <workspace_id> --require-token    # Require token for docs

# Delete a workspace (confirmation required)
xano workspace delete -w <workspace_id>
xano workspace delete -w <workspace_id> --force

# Pull workspace to local files (defaults to current directory)
xano workspace pull
xano workspace pull -d ./my-workspace                    # Specify output directory
xano workspace pull -b dev                               # Specific branch
xano workspace pull --env --records                      # Include env vars and table records
xano workspace pull --draft                              # Include draft changes

# Push local files to workspace (defaults to current directory, only changed files)
xano workspace push
xano workspace push -d ./my-workspace                    # Push from a specific directory
xano workspace push -b dev
xano workspace push --sync                               # Full push — send all files, not just changed ones
xano workspace push --sync --delete                      # Full push + delete remote objects not included
xano workspace push --dry-run                            # Preview changes without pushing
xano workspace push --records                            # Include table records
xano workspace push --env                                # Include environment variables
xano workspace push --truncate                           # Truncate tables before import
xano workspace push --no-transaction                     # Disable database transaction wrapping
xano workspace push --no-guids                           # Skip writing GUIDs back to local files
xano workspace push --force                              # Skip preview and confirmation (for CI/CD)
xano workspace push -i "function/*"                      # Push only matching files
xano workspace push -e "table/*"                         # Push all files except tables
xano workspace push -i "function/*" -e "**/test*"        # Include functions, exclude tests

# Pull from a git repository to local files (defaults to current directory)
xano workspace git pull -r https://github.com/owner/repo
xano workspace git pull -d ./output -r https://github.com/owner/repo
xano workspace git pull -r https://github.com/owner/repo -b main
xano workspace git pull -r https://github.com/owner/repo/tree/main/path/to/dir
xano workspace git pull -r https://github.com/owner/repo/blob/main/file.xs
xano workspace git pull -r git@github.com:owner/repo.git
xano workspace git pull -r https://gitlab.com/owner/repo/-/tree/master/path
xano workspace git pull -r https://github.com/owner/private-repo -t ghp_xxx
xano workspace git pull -r https://github.com/owner/repo --path subdir
```

### Knowledge

Knowledge items are user-authored docs and skills (e.g. `CLAUDE.md`, `AGENTS.md`, runbooks)
attached to a workspace. Each knowledge item's **name is a path** (e.g. `some/thing/CLAUDE.md`):
`pull` writes its content to that path under the output directory, and `push` turns each local
file into a knowledge item named by its relative path.

Push matches local files to remote items by name. Existing items are updated (content only —
description, mode, tags, and other metadata are preserved); new files are created. The
knowledge type for new items is inferred from the filename: `AGENTS.md` → `agents.md`,
`SKILL.md` → `skill`, everything else → `doc`. Hidden files (dotfiles) and `node_modules`
are skipped.

```bash
# Pull knowledge files to local paths (defaults to current directory)
xano knowledge pull
xano knowledge pull -d ./knowledge                       # Specify output directory
xano knowledge pull -b dev                               # Specific branch

# Push local files as knowledge (defaults to current directory, only changed files)
xano knowledge push
xano knowledge push -d ./knowledge                       # Push from a specific directory
xano knowledge push --dry-run                            # Preview changes without pushing
xano knowledge push --sync --delete                      # Full push + delete remote knowledge not included
xano knowledge push --force                              # Skip preview and confirmation (for CI/CD)
xano knowledge push -i "guides/*"                        # Push only matching files
xano knowledge push -e "**/README.md"                    # Push all files except READMEs
```

### Branches

All branch commands use **branch labels** (e.g., `v1`, `dev`), not IDs.

The `v1` branch is the default branch and always exists. It cannot be created, edited, or deleted.

```bash
# List branches (backup branches are hidden by default)
xano branch list
xano branch list -w <workspace_id>
xano branch list --backups        # include backup branches

# Get branch details
xano branch get <branch_label>

# Create a branch
xano branch create dev
xano branch create feature-auth -s dev -d "Auth feature"
xano branch create staging --color "#ebc346"

# Edit a branch
xano branch edit <branch_label> --label "new-label"
xano branch edit <branch_label> --color "#ff0000"

# Set live branch
xano branch set_live <branch_label>
xano branch set_live <branch_label> --force

# Delete a branch
xano branch delete <branch_label>
xano branch delete <branch_label> --force
```

### Functions

```bash
# List functions
xano function list
xano function list --include_draft --include_xanoscript
xano function list --sort created_at --order desc --page 1 --per_page 50

# Get a function
xano function get <function_id>
xano function get <function_id> -o xs                   # Output as XanoScript
xano function get <function_id> -o json
xano function get <function_id> --include_draft         # Include draft version

# Create a function from XanoScript
xano function create -f function.xs
xano function create -f function.xs --edit              # Open in $EDITOR before creating
cat function.xs | xano function create --stdin

# Edit a function
xano function edit <function_id>                        # Opens in $EDITOR
xano function edit <function_id> -f new.xs              # Update from file
xano function edit <function_id> -f new.xs --edit       # Open in $EDITOR before updating
cat function.xs | xano function edit <function_id> --stdin  # Update from stdin
xano function edit <function_id> --no-publish           # Edit without publishing

# Run (execute) a function by name
xano function run <name>                                # Prompts for declared inputs (on a TTY)
xano function run <name> --data email=jo@x.com --data age:=30 --data active:=true
xano function run <name> --json @payload.json --data env=staging   # base payload + override
echo '{"email":"jo@x.com"}' | xano function run <name> --stdin -o json | jq .result
xano function run <name> --branch dev --logs            # run on a branch, show execution logs
xano function run <name> --datasource test              # run against the 'test' data source
```

Input flexibility for `function run` (assembled into one JSON `input` object):

| Form | Meaning |
| --- | --- |
| `--data key=value` | string field |
| `--data key:=<json>` | raw JSON field (`age:=30`, `active:=true`, `tags:='["a","b"]'`) |
| `--data key@file` | field value read from a file |
| `--json '<inline>'` / `--json @file.json` / `--json -` | a base JSON object (stdin with `-`) |
| `--stdin` | read the JSON object from stdin (same as `--json -`) |

`--datasource <label>` runs the function against a non-live data source by sending the
`X-Data-Source` header, so table reads and writes hit that data source's tables. Omit it
to run against `live`; an unknown label is rejected by the server with
`Invalid data source.`

Merge order is JSON base first, then `--data` overrides. Missing required inputs are
prompted for on an interactive terminal; in a non-TTY (CI) context the command fails
listing them. Output defaults to the raw `result` (`-o json`); the exit code is non-zero
when the function returns an error status.

> **Permissions:** running a function requires **Function** (read) plus the **run/debug**
> action on your workspace role. If your access token's role lacks run/debug, the call is
> denied with an access error — grant run/debug to the role (or use a token whose role has
> it). `function list`/`get`/`create`/`edit` only need the Function permission.

### Knowledge

```bash
# List all enabled knowledge as markdown (always-on items show full content, on-demand show name + description)
xano knowledge list -w 40

# List as JSON
xano knowledge list -w 40 --output json

# Filter by knowledge type (skill, doc, agents.md)
xano knowledge list -w 40 --type skill

# Include disabled items
xano knowledge list --no-enabled-only

# Get a specific knowledge item's content by name
xano knowledge get "deploy-runbook" -w 40

# Get as JSON (includes all metadata)
xano knowledge get "deploy-runbook" -w 40 --output json

# Get a reference file attached to a knowledge item
xano knowledge get "deploy-runbook" -w 40 --file checklist.md
```

### Releases

All release commands use **release names** (e.g., `v1.0`), not IDs.

```bash
# List releases
xano release list

# Get release details
xano release get <release_name>

# Create a release
xano release create "v1.0" --branch main
xano release create "v1.1-hotfix" --branch main --hotfix
xano release create "v1.0" --branch main --table-ids 1,2,3

# Edit a release
xano release edit <release_name> --name "v1.0-final" -d "Updated description"

# Export (download) a release
xano release export <release_name>
xano release export <release_name> --output ./backups/my-release.tar.gz

# Import a release file
xano release import --file ./my-release.tar.gz

# Delete a release (confirmation required)
xano release delete <release_name>
xano release delete <release_name> --force

# Pull release to local files (defaults to current directory)
xano release pull -r v1.0
xano release pull -d ./my-release -r v1.0
xano release pull -r v1.0 --env --records

# Push local files as a new release (defaults to current directory)
xano release push -n "v2.0"
xano release push -d ./my-release -n "v2.0"
xano release push -n "v2.0" --hotfix --description "Critical fix"
xano release push -n "v2.0" --no-records --no-env

# Deploy a release to its workspace as a new branch (confirmation required)
xano release deploy "v1.0"
xano release deploy "v1.0" --force
xano release deploy "v1.0" --branch "restore-v1" --no-set_live
xano release deploy "v1.0" -w 40 -o json --force
```

### Platforms

```bash
# List platforms
xano platform list

# Get platform details
xano platform get <platform_id>
```

### Testing

#### Unit Tests

```bash
# List unit tests (returns all tests by default; --per_page narrows the page)
xano unit_test list
xano unit_test list --branch dev --obj-type function
xano unit_test list --page 2 --per_page 25

# Run a single unit test
xano unit_test run <unit_test_id>
xano unit_test run <unit_test_id> --branch dev   # run the test from a specific branch

# Run all unit tests
xano unit_test run_all
xano unit_test run_all --branch dev --obj-type function
```

#### Workflow Tests

```bash
# List workflow tests (returns all tests by default; --per_page narrows the page)
xano workflow_test list
xano workflow_test list --branch dev
xano workflow_test list --page 2 --per_page 25

# Get workflow test details
xano workflow_test get <workflow_test_id>
xano workflow_test get <workflow_test_id> -o xs          # Output as XanoScript
xano workflow_test get <workflow_test_id> --include-draft

# Run a single workflow test
xano workflow_test run <workflow_test_id>

# Run all workflow tests
xano workflow_test run_all
xano workflow_test run_all --branch dev

# Run tests in parallel (default is 1 — sequential)
xano unit_test run_all --concurrency 4
xano workflow_test run_all --concurrency 4

# Sandbox and tenant variants take the same paging flags
xano sandbox unit_test list --page 2 --per_page 25
xano sandbox workflow_test list --page 2 --per_page 25
xano tenant unit_test list my-tenant --page 2 --per_page 25
xano tenant workflow_test list my-tenant --page 2 --per_page 25

# Delete a workflow test
xano workflow_test delete <workflow_test_id>
```

#### Running tests in parallel

Every `run_all` command takes `--concurrency` (default `1`):

```bash
xano unit_test run_all --concurrency 4
xano tenant unit_test run_all --tenant my-tenant --concurrency 8
```

Output stays in test order regardless of concurrency, so a parallel run is still diffable against a sequential one, and the JSON `results` array keeps a stable order.

`run_all` discovers the test list by paging at 100 per request rather than asking for the whole suite in one response, and stops when the API reports no next page.

**The default is 1 on purpose.** These tests execute against a shared workspace database, so tests that touch the same tables or records can interfere with each other when run at the same time — producing failures that look like flakiness rather than a real regression. Raise `--concurrency` once you know your tests are independent.

#### Exit codes

Every `run` and `run_all` command — on all four surfaces (`unit_test`, `workflow_test`, `sandbox`, `tenant`) — uses the same exit codes:

| Code | Meaning |
|------|---------|
| `0` | All tests passed, **or** there were no tests to run |
| `1` | At least one test failed |
| `2` | The command could not run the tests at all — bad workspace, auth failure, unreadable profile, or the test-list request failed |

**This is identical for `-o json` and summary output.** Adding `-o json` to get machine-readable output does not change the exit code, so a CI job can rely on it in either mode.

```bash
xano workflow_test run_all -o json || echo "tests failed or the command errored"
```

**One asymmetry worth knowing about.** In `run`, a non-2xx response from the run endpoint is a CLI error and exits `2`. In `run_all`, a non-2xx response for an *individual* test is recorded as a failed test result with an `API error <status>` message and contributes to exit `1` — because `run_all`'s job is to finish the batch and report a roll-up rather than abort on one test's transport error. Exit `2` in `run_all` is reserved for failures that stop the batch from starting at all.

If you need to tell a backend outage apart from a genuine assertion failure, the exit code alone will not do it — inspect `results[].message` for the `API error` prefix:

```bash
xano workflow_test run_all -o json | jq '[.results[] | select(.message // "" | startswith("API error"))] | length'
```

#### JSON output

`run` returns the API's result object unchanged. Treat **any** `status` other than `"ok"` as a failure — several distinct non-`ok` values are returned in practice, so match on "not `ok`" rather than enumerating known failure values:

```json
{ "status": "exception", "timing": 0.02, "message": "Precondition failed." }
```

`run_all` returns a roll-up. A branch with no tests is a normal state — freshly created branches routinely have none — and still emits valid JSON rather than plain text, so `JSON.parse` is always safe:

```json
{ "passed": 0, "failed": 0, "results": [], "total_timing": 0 }
```

The `total_timing` field is currently emitted by `workflow_test run_all` only; the `unit_test`, `tenant`, and `sandbox` variants omit it. The empty-suite envelope always carries the same keys as that command's populated envelope.

> **Changed in this release:** a failing `run` in summary mode previously exited `2` and printed a spurious `EEXIT: 1` line; it now exits `1` with clean output. A failing `run` with `-o json` previously exited `0`, which silently hid failures from CI. If you match on exit code `2` specifically to detect test failures, switch to a non-zero check.

### Tenants

Manage tenants, their environment variables, backups, deployments, and clusters.

#### CRUD

```bash
# List tenants
xano tenant list

# Get tenant details
xano tenant get <tenant_name>

# Create a tenant
xano tenant create "My Tenant"
xano tenant create "My Tenant" -d "Description" --type tier2 --cluster_id 1 --platform_id 5
xano tenant create "My Tenant" --type tier2 --cluster_id 1 --license ./license.yaml

# Edit a tenant
xano tenant edit <tenant_name> --display "New Name" -d "New description"

# Delete a tenant (confirmation required)
xano tenant delete <tenant_name>
xano tenant delete <tenant_name> --force
```

#### Impersonate

```bash
# Open a tenant in the browser
xano tenant impersonate <tenant_name>

# Print the URL without opening the browser
xano tenant impersonate <tenant_name> --url-only

# Output credentials as JSON
xano tenant impersonate <tenant_name> -o json
```

#### Pull / Push

```bash
# Pull tenant to local files (defaults to current directory)
xano tenant pull -t <tenant_name>
xano tenant pull -d ./my-tenant -t <tenant_name>
xano tenant pull -t <tenant_name> --env --records
xano tenant pull -t <tenant_name> --draft

# Push local files to tenant (defaults to current directory)
xano tenant push -t <tenant_name>
xano tenant push -d ./my-tenant -t <tenant_name>
xano tenant push -t <tenant_name> --records                    # Include table records
xano tenant push -t <tenant_name> --env                        # Include environment variables
xano tenant push -t <tenant_name> --truncate
xano tenant push -t <tenant_name> --no-transaction             # Disable transaction wrapping
```

#### Deployments

```bash
# Deploy a platform version
xano tenant deploy_platform <tenant_name> --platform_id 5

# Deploy a release by name
xano tenant deploy_release <tenant_name> --release v1.0

# Deploy with a license override file (deploy_platform only)
xano tenant deploy_platform <tenant_name> --platform_id 5 --license ./license.yaml
```

#### Tenant License

```bash
# Get tenant license
xano tenant license get <tenant_name>

# Set tenant license
xano tenant license set <tenant_name> --license tier2
```

#### Tenant Environment Variables

```bash
# List env var keys
xano tenant env list <tenant_name>

# Get a single env var
xano tenant env get <tenant_name> --name DATABASE_URL

# Set an env var
xano tenant env set <tenant_name> --name DATABASE_URL --value postgres://...

# Delete an env var
xano tenant env delete <tenant_name> --name DATABASE_URL

# Export all env vars to YAML
xano tenant env get_all <tenant_name>
xano tenant env get_all <tenant_name> --file ./env.yaml

# Import all env vars from YAML (replaces existing)
xano tenant env set_all <tenant_name>
xano tenant env set_all <tenant_name> --file ./env.yaml --clean
```

#### Backups

```bash
# List backups
xano tenant backup list <tenant_name>

# Create a backup
xano tenant backup create <tenant_name>

# Export (download) a backup
xano tenant backup export <tenant_name> --backup_id 10
xano tenant backup export <tenant_name> --backup_id 10 --output ./backup.tar.gz

# Import a backup file
xano tenant backup import <tenant_name> --file ./backup.tar.gz

# Restore from a backup
xano tenant backup restore <tenant_name> --backup_id 10

# Delete a backup (confirmation required)
xano tenant backup delete <tenant_name> --backup_id 10
xano tenant backup delete <tenant_name> --backup_id 10 --force
```

#### Clusters

```bash
# List clusters
xano tenant cluster list

# Get cluster details
xano tenant cluster get <cluster_id>

# Create a cluster
xano tenant cluster create --name "us-east-1" --credentials_file ./kubeconfig.yaml
xano tenant cluster create --name "eu-west-1" --type run -d "EU run cluster"

# Edit a cluster
xano tenant cluster edit <cluster_id> --name "us-east-1" -d "Updated" --domain "us-east.xano.io"

# Delete a cluster (confirmation required)
xano tenant cluster delete <cluster_id>
xano tenant cluster delete <cluster_id> --force

# Get cluster kubeconfig
xano tenant cluster license get <cluster_id>

# Set cluster kubeconfig
xano tenant cluster license set <cluster_id>
xano tenant cluster license set <cluster_id> --file ./kubeconfig.yaml
```

### Ephemeral Tenants

Manage ephemeral tenants — short-lived, auto-expiring tenants scoped to a workspace (default TTL 1h, max 72h). Unlike a sandbox, an ephemeral tenant requires a workspace.

```bash
# List ephemeral tenants in the current workspace
xano ephemeral list
xano ephemeral list -w 5

# List ephemeral tenants across every workspace you can access
xano ephemeral list --global

# Create an ephemeral tenant (workspace required)
xano ephemeral create "PR preview"
xano ephemeral create "Demo" --expires-hours 24 -w 5
xano ephemeral create "Load test" -d "48h soak" --expires-hours 48

# Get / edit / delete
xano ephemeral get <tenant_name>
xano ephemeral edit <tenant_name> --display "New Name" -d "New description"
xano ephemeral delete <tenant_name> --force

# Pull to / push from local files (multidoc)
xano ephemeral pull <tenant_name> -d ./my-ephemeral
xano ephemeral push <tenant_name> -d ./my-ephemeral --dry-run   # preview first
xano ephemeral push <tenant_name> -d ./my-ephemeral

# Open in the browser (or print the URL)
xano ephemeral impersonate <tenant_name>
xano ephemeral impersonate <tenant_name> --url-only
xano ephemeral impersonate <tenant_name> --guest       # read-only session (browse only)
```

#### Static hosting for an ephemeral tenant

An ephemeral tenant can host static sites, scoped to that tenant. These commands mirror
`xano static_host *` but take the tenant name as the first argument (the tenant's static
hosting is isolated inside the tenant's own database).

```bash
# List / create / inspect a tenant's static hosts
xano ephemeral static_host list <tenant_name>
xano ephemeral static_host create <tenant_name> --name marketing --description "Marketing site"
xano ephemeral static_host get <tenant_name> -H marketing
xano ephemeral static_host edit <tenant_name> -H marketing --description "Updated"

# Builds: push a directory, list, inspect, deploy to an env, pull, delete
xano ephemeral static_host build push <tenant_name> -H default -f ./site
xano ephemeral static_host build list <tenant_name> -H default
xano ephemeral static_host build get <tenant_name> -H default --build_id 52
xano ephemeral static_host deploy <tenant_name> -H default --build_id 52 --env prod
xano ephemeral static_host build pull <tenant_name> -H default --latest
xano ephemeral static_host build delete <tenant_name> -H default --build_id 52
```

> Static hosting is currently available for **local** tenants. Remote (tier2/tier3)
> tenants are not yet supported and will return an error.

### Sandbox

Manage your sandbox tenant. Each user has a single sandbox tenant that is auto-provisioned on first use.

```bash
# Get your sandbox tenant (creates if needed)
xano sandbox get
xano sandbox get -o json

# Pull sandbox to local files (defaults to current directory)
xano sandbox pull
xano sandbox pull -d ./my-sandbox
xano sandbox pull --env --records

# Push local files to sandbox (defaults to current directory, only changed files)
xano sandbox push
xano sandbox push -d ./my-workspace                      # Push from a specific directory
xano sandbox push --sync                                 # Full push — send all files
xano sandbox push --sync --delete                        # Full push + delete remote objects not included
xano sandbox push --dry-run                              # Preview changes without pushing
xano sandbox push --records --env                        # Include records and environment variables
xano sandbox push --truncate                             # Truncate tables before import
xano sandbox push --no-guids                             # Skip writing GUIDs back to local files
xano sandbox push --force                                # Skip preview and confirmation
xano sandbox push --review                               # Push and open sandbox review in the browser

# Review (open in browser)
xano sandbox review
xano sandbox review --url-only                           # Print the URL without opening the browser
xano sandbox review --insecure                           # Skip TLS verification (self-signed certs)

# Impersonate (open in browser)
xano sandbox impersonate

# Reset all workspace data
xano sandbox reset
xano sandbox reset --force
```

### Static Hosts

```bash
# List static hosts. Page size is fixed at 100 by the API, so there is no
# --per_page flag; the footer reports the true total.
xano static_host list
xano static_host list --page 2

# Create / get / edit a static host
xano static_host create marketing --description "Marketing site"
xano static_host get marketing
xano static_host edit marketing --name marketing-v2 --description "Updated"

# List builds (--page only; page size is fixed at 100 by the API)
xano static_host build list default
xano static_host build list default --page 2

# Get build details
xano static_host build get default --build_id 52

# Pull a build to disk. Defaults to the original uploaded source
# (including package.json). Use --source built for the compiled/served output.
xano static_host build pull default --build_id 52    # By build ID (original source)
xano static_host build pull default --build_id 52 --source built   # Compiled output
xano static_host build pull default --latest         # Latest build
xano static_host build pull default --env dev        # Build currently deployed to dev
xano static_host build pull default --env prod -d ./prod-release

# Push a build (name optional — auto-generated from the timestamp if omitted).
# Accepts a directory (-d) or a zip file (-f). Defaults to the current directory.
# When pushing a directory, files matched by its .gitignore are skipped by default
# (the .git/ folder is always excluded); use --no-gitignore to push everything.
# For package.json builds, the CLI waits for the build to finish (--no-wait to skip).
xano static_host build push default -d ./dist -n "v1.0.0"
xano static_host build push default                          # current dir, auto-name
xano static_host build push default -f ./build.zip -n "v1.0.0"  # from zip file
xano static_host build push default -n "release" --description "Production build"
xano static_host build push default -d ./static --no-gitignore  # push gitignored files too

# Delete a build (prompts for confirmation; --force to skip)
xano static_host build delete default --build_id 52
xano static_host build delete default --build_id 52 --force

# Deploy a build to an environment
xano static_host deploy default --build_id 52 --env dev
xano static_host deploy default --build_id 52 --env prod

# Migrate a host to instance-managed (v2) hosting
xano static_host migrate newsite                 # one host (both envs)
xano static_host migrate newsite --env dev        # one env
xano static_host migrate --all                    # every v1 host in the workspace
xano static_host migrate --all --dry-run          # preview without changing anything
```

## Global Options

All commands support these options:

| Flag | Description |
|------|-------------|
| `-c, --config` | Path to credentials file (or set `XANO_CONFIG` env var). Default: `~/.xano/credentials.yaml` |
| `-p, --profile` | Profile to use (or set `XANO_PROFILE` env var) |
| `-w, --workspace` | Workspace ID (overrides profile default) |
| `-o, --output` | Output format: `summary` (default) or `json` |
| `-v, --verbose` | Show detailed request/response information (or set `XANO_VERBOSE` env var) |

### Verbose Mode

Use `-v` or `--verbose` to see detailed HTTP request and response information, useful for debugging:

```bash
xano workspace list -v
```

This will show:
- Request method, URL, and content type
- Request body (truncated if large)
- Response status, timing, and body

## Configuration

Profiles are stored in `~/.xano/credentials.yaml` by default. You can use a different credentials file with:

```bash
# Via flag
xano profile list -c /path/to/other-credentials.yaml

# Via environment variable
export XANO_CONFIG=/path/to/other-credentials.yaml
xano workspace list
```

### Credentials File Format

```yaml
profiles:
  default:
    account_origin: https://app.xano.com
    instance_origin: https://instance.xano.com
    access_token: <token>
    workspace: <workspace_id>
    branch: <branch_id>
  self-hosted:
    instance_origin: https://self-signed.example.com
    access_token: <token>
    insecure: true
default: default
```

### Project-local profile (`profile.yaml`)

To avoid accidentally targeting the wrong workspace, pin a project to a profile
by adding a `profile.yaml` file at the project root. The CLI searches the
current directory and walks up parent directories (like `.git`) to find it.

`profile.yaml` contains **no secrets** — it references a profile by name; the
access token always comes from `~/.xano/credentials.yaml`. An `access_token`
key is rejected.

```yaml
# ./profile.yaml
profile: staging          # which credentials.yaml profile to use
workspace: 110            # optional override
instance_origin: https://your-instance.xano.io        # optional override
account_origin: https://app.xano.com                  # optional override
branch: main              # optional override
```

When a `profile.yaml` is in effect, every command prints the active target,
e.g. `Using profile 'staging' (workspace 110) · profile.yaml` (suppressed for
`--output json`).

Generate one with `xano profile use`. It writes a self-documenting
`profile.yaml` (every overridable field is included as a commented example, so
you can edit it without consulting the docs) and offers to add it to
`.gitignore` — skipping that prompt when it is already ignored:

```bash
xano profile use staging -w 110     # writes ./profile.yaml; prompts to .gitignore
xano profile use staging --no-gitignore
```

The generated file looks like:

```yaml
# Xano project-local profile — pins this project to a profile in ~/.xano/credentials.yaml.
# No secrets here: the access token always comes from credentials.yaml.
# Precedence: an explicit -p/--profile or XANO_PROFILE overrides this file entirely.

# Profile to use (a profile name from ~/.xano/credentials.yaml):
profile: staging

# Optional per-project overrides — uncomment and edit any you need:
workspace: 110
# instance_origin: https://your-instance.xano.io
# account_origin: https://app.xano.com
# branch: main
```

**Profile selection precedence:**

1. `-p/--profile` flag
2. `XANO_PROFILE` environment variable
3. `profile.yaml` (`profile:` field, plus field overrides)
4. Default profile from the credentials file

An explicit `-p/--profile` or `XANO_PROFILE` ignores `profile.yaml` entirely.

#### `xano profile use <name>`

Pin a profile for the current project by writing a local `profile.yaml`.

```bash
xano profile use staging              # pin profile 'staging' for this project
xano profile use staging -w 110       # pin and override the workspace
xano profile use staging --gitignore  # also add profile.yaml to .gitignore
```

| Flag | Description |
|------|-------------|
| `-w, --workspace` | Override workspace for this project |
| `-b, --branch` | Override branch for this project |
| `-i, --instance_origin` | Override instance origin |
| `-a, --account_origin` | Override account origin |
| `--gitignore` / `--no-gitignore` | Add (or skip adding) `profile.yaml` to `.gitignore` without prompting |

### Self-Signed Certificates

For environments using self-signed TLS certificates, use the `--insecure` (`-k`) flag to skip certificate verification:

```bash
# During authentication
xano auth --insecure

# When creating a profile
xano profile create myprofile -i https://self-signed.example.com -t <token> -k

# Add to an existing profile
xano profile edit myprofile --insecure
```

When a profile has `insecure: true`, all commands using that profile will automatically skip TLS certificate verification. A warning is displayed when insecure mode is active.

### Update

```bash
# Update the CLI to the latest version
xano update

# Check for updates without installing
xano update --check

# Update to the latest beta version
xano update --beta

# Check for beta updates without installing
xano update --beta --check
```

## Scripts

### Bump Version

```bash
./scripts/bump-version.sh           # patch: 0.0.38 -> 0.0.39
./scripts/bump-version.sh minor     # minor: 0.0.38 -> 0.1.0
./scripts/bump-version.sh major     # major: 0.0.38 -> 1.0.0
```

## Help

```bash
xano --help
xano <command> --help
```
