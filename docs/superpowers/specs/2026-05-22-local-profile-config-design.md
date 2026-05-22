# Project-local `profile.yaml` override — Design

**Date:** 2026-05-22
**Status:** Approved (pending implementation plan)

## Problem

Xano CLI stores multiple connection profiles in `~/.xano/credentials.yaml`. The
`default` profile is used for every command unless `-p/--profile` (or
`XANO_PROFILE`) is supplied. With many workspaces this is a footgun: if you
forget `--profile`, a destructive operation (e.g. `workspace push`) can target
the wrong workspace.

This is not hypothetical. In a representative credentials file, the `default`,
`brice-dev`, and `attendly` profiles share the **same instance and access
token**, differing only by `workspace` (118 vs 110 vs 118). From any project on
that shared instance, `default` silently targets workspace 118 even when the
project really lives in workspace 110.

## Goal

Add a complementary, project-level config file that pins which
profile/workspace/origins a project targets, so that *being in a project
directory* automatically selects the right target — without moving any secrets
into the repo.

## Non-goals

- Storing access tokens in the project. Tokens stay in `~/.xano/credentials.yaml`.
- Changing the existing global credentials format or the `-p`/`XANO_CONFIG`
  behavior.
- Per-command refactoring. The change funnels through one resolution chokepoint.

## The local file: `profile.yaml`

A `profile.yaml` at (or above) the working directory. Contains **no secrets**.

```yaml
profile: brice-dev        # references a profile in ~/.xano/credentials.yaml
                          # (optional; falls back to the credentials' default)
workspace: 110            # optional override
instance_origin: https://x62j-rlqn-vpsk.dev.xano.io   # optional override
account_origin: https://app.dev.xano.com              # optional override
branch: dev-feature       # optional override
```

### Overridable fields

`workspace`, `account_origin`, `instance_origin`, `branch`.

### Forbidden field

`access_token` is **rejected** with a clear error:

> tokens belong in credentials.yaml; reference a profile by name instead

Rationale: the local file references a profile *by name*, so the token always
comes from `credentials.yaml`. A different token means a different profile —
just point `profile:` at it. Allowing a token field would reintroduce the
secret-leak risk for no real gain.

## Discovery

Walk up from `process.cwd()` to the filesystem root (git-style). The **first**
`profile.yaml` found wins. If the file exists but does not parse to an object
containing at least one recognized key (`profile`, `workspace`,
`instance_origin`, `account_origin`, `branch`), warn and ignore it — this avoids
hijacking an unrelated `profile.yaml` belonging to another tool.

## Resolution & precedence

Profile-name resolution order:

```
-p/--profile  >  XANO_PROFILE env  >  profile.yaml `profile:`  >  credentials default
```

- If `-p`/`XANO_PROFILE` is explicitly set, `profile.yaml` is **ignored
  entirely** (both the profile name and the field overrides). Explicit wins.
- Otherwise: resolve the base profile name (local `profile:` or credentials
  default), load it from `credentials.yaml`, then layer the local overrides into
  the returned `ProfileConfig`.

Because the override is merged into the returned `profile` object
(`profile.workspace`, `profile.branch`, etc.), the existing per-command
precedence — e.g. `flags.workspace || profile.workspace` — continues to work
unchanged. An explicit `-w` flag still beats the local override, exactly as it
beats a credentials value today. **No changes to the ~40 individual commands.**

### Integration point (Approach A)

The merge happens inside `BaseCommand.resolveProfile()`, the single method every
target-consuming command already calls. `resolveProfile()` reads the actual
parsed `flags.profile` (authoritative for the explicit-wins rule), and applies
local overrides only when `flags.profile` is unset.

## Banner

When a `profile.yaml` is in effect, every `BaseCommand` prints one line:

```
Using profile 'brice-dev' (workspace 110) · ./profile.yaml
```

- Emitted from `BaseCommand.init()` so it covers all commands.
- Suppressed when `--output json` (reuse existing `isJsonOutput()`).
- `init()` detects an explicit `-p`/`XANO_PROFILE` via the same `process.argv`
  scan already used by `getCredentialsPath()`; when the local file is being
  overridden by an explicit flag/env, the banner is skipped.

## Generator command: `xano profile use <name>`

Writes `profile.yaml` in the current working directory.

- Positional arg: `<name>` — the profile to reference. Validated against
  `credentials.yaml`; errors if it does not exist.
- Flags (all optional, written as overrides):
  - `-w/--workspace`
  - `-b/--branch`
  - `-i/--instance_origin`
  - `-a/--account_origin`
- `.gitignore` handling: interactively prompts *"Add profile.yaml to
  .gitignore?"*; on yes, creates or appends to `.gitignore`. Flags
  `--gitignore` / `--no-gitignore` skip the prompt for non-interactive/CI use.
- If `profile.yaml` already exists, warn and overwrite.

This complements (does not replace) `xano profile set-default`, which sets the
*global* default. `use` sets the *project-local* pin.

## New module: `src/utils/local-config.ts`

Keeps `base-command.ts` focused, per project conventions (small, focused
utilities under `src/utils/`).

Exports:

- `LOCAL_PROFILE_FILENAME = 'profile.yaml'`
- `interface LocalProfileConfig { profile?: string; workspace?: string; instance_origin?: string; account_origin?: string; branch?: string }`
- `findLocalProfile(startDir?: string): { path: string; config: LocalProfileConfig } | null`
  - Walks up to filesystem root; validates shape; **throws** if `access_token`
    is present; returns `null` (with a warning) for an unrecognized shape.
- `applyLocalOverrides(base: ProfileConfig, local: LocalProfileConfig): ProfileConfig`
  - Returns a new profile with defined override fields applied.

## Testing (TDD, Mocha + Chai)

- `local-config`:
  - finds `profile.yaml` in cwd
  - finds it in a parent directory (walk-up)
  - returns `null` when none exists
  - throws when `access_token` is present
  - warns and ignores an unrecognized shape
  - `applyLocalOverrides` merges only defined fields
- `base-command` resolution:
  - precedence matrix: flag > env > local > default
  - overrides applied only when no `-p`/env
  - explicit `-p` ignores the local file entirely
- `profile use`:
  - writes the file with the expected fields
  - validates the referenced profile exists
  - `.gitignore` prompt + `--gitignore`/`--no-gitignore` flags
  - overwrite behavior when the file already exists
- banner: shown when local file in effect; suppressed for `--output json`.

## Documentation

- **README.md:** new "Project-local profile (`profile.yaml`)" section; `xano
  profile use` reference; updated profile-selection precedence table; banner
  note.
- **CLAUDE.md:** update the Profile Selection Priority section to include the
  local file.
