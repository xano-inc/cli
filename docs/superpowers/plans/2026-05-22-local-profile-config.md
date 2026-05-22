# Project-local `profile.yaml` Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project pin its Xano target via a no-secrets `profile.yaml` so commands hit the right workspace automatically, instead of silently falling back to the global default profile.

**Architecture:** A new pure-function module `src/utils/local-config.ts` discovers (walk-up) and parses `profile.yaml`, and computes profile selection/overrides. `BaseCommand` wires this into `init()` (banner) and `resolveProfile()` (merge overrides into the returned `ProfileConfig`), so the ~40 existing commands need no changes. A new `xano profile use` command generates the file.

**Tech Stack:** TypeScript 5 (ESM, Node16), oclif 4, js-yaml 4, inquirer 8, Mocha 10 + Chai 4.

---

## File Structure

- **Create** `src/utils/local-config.ts` — discovery, parsing, validation, override merge, selection logic, banner formatting. All pure/easily-tested functions.
- **Create** `test/utils/local-config.test.ts` — unit tests for the module.
- **Modify** `src/base-command.ts` — call into the module from `init()` (banner + insecure) and `resolveProfile()` (merge). Export one argv helper for testing.
- **Create** `src/commands/profile/use/index.ts` — `xano profile use <name>` generator command.
- **Create** `test/commands/profile/use.test.ts` — unit tests for the gitignore helper used by the command.
- **Modify** `README.md` — new section, command reference, precedence table.
- **Modify** `CLAUDE.md` — Profile Selection Priority section.

---

## Task 1: `local-config.ts` — discovery, parsing, override merge

**Files:**
- Create: `src/utils/local-config.ts`
- Test: `test/utils/local-config.test.ts`

- [ ] **Step 1: Write failing tests for `parseLocalProfile` and `applyLocalOverrides`**

Create `test/utils/local-config.test.ts`:

```typescript
/* eslint-disable camelcase */
import {expect} from 'chai'

import {
  applyLocalOverrides,
  parseLocalProfile,
} from '../../src/utils/local-config.js'

describe('local-config', () => {
  describe('parseLocalProfile', () => {
    it('parses a profile name and recognized override fields', () => {
      const raw = [
        'profile: brice-dev',
        'workspace: 110',
        'instance_origin: https://x62j.dev.xano.io',
        'account_origin: https://app.dev.xano.com',
        'branch: dev-feature',
      ].join('\n')
      expect(parseLocalProfile(raw)).to.deep.equal({
        account_origin: 'https://app.dev.xano.com',
        branch: 'dev-feature',
        instance_origin: 'https://x62j.dev.xano.io',
        profile: 'brice-dev',
        workspace: '110',
      })
    })

    it('coerces a numeric workspace to a string', () => {
      const result = parseLocalProfile('workspace: 110')
      expect(result).to.deep.equal({workspace: '110'})
    })

    it('throws when access_token is present', () => {
      expect(() => parseLocalProfile('access_token: secret123')).to.throw(/access_token/)
    })

    it('returns null for a file with no recognized keys', () => {
      expect(parseLocalProfile('something_else: true')).to.equal(null)
    })

    it('returns null for non-object yaml', () => {
      expect(parseLocalProfile('just a string')).to.equal(null)
    })

    it('ignores unknown keys but keeps recognized ones', () => {
      expect(parseLocalProfile('profile: dev\nunknown: x')).to.deep.equal({profile: 'dev'})
    })
  })

  describe('applyLocalOverrides', () => {
    const base = {
      access_token: 'tok',
      account_origin: 'https://app.xano.com',
      instance_origin: 'https://base.xano.io',
      workspace: '118',
    }

    it('overrides only the fields present in the local config', () => {
      const result = applyLocalOverrides(base, {workspace: '110'})
      expect(result).to.deep.equal({
        access_token: 'tok',
        account_origin: 'https://app.xano.com',
        instance_origin: 'https://base.xano.io',
        workspace: '110',
      })
    })

    it('never copies the profile name or access_token into the result', () => {
      const result = applyLocalOverrides(base, {profile: 'other', workspace: '110'})
      expect(result.access_token).to.equal('tok')
      expect((result as Record<string, unknown>).profile).to.equal(undefined)
    })

    it('returns an equivalent profile when no overrides are set', () => {
      expect(applyLocalOverrides(base, {profile: 'dev'})).to.deep.equal(base)
    })

    it('does not mutate the base profile', () => {
      applyLocalOverrides(base, {workspace: '999'})
      expect(base.workspace).to.equal('118')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx mocha --spec test/utils/local-config.test.ts`
Expected: FAIL — `Cannot find module '../../src/utils/local-config.js'`.

- [ ] **Step 3: Implement `parseLocalProfile` and `applyLocalOverrides`**

Create `src/utils/local-config.ts`:

```typescript
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'

import type {ProfileConfig} from '../base-command.js'

export const LOCAL_PROFILE_FILENAME = 'profile.yaml'

/** Fields a project-local profile.yaml may set. No secrets allowed. */
export interface LocalProfileConfig {
  account_origin?: string
  branch?: string
  instance_origin?: string
  profile?: string
  workspace?: string
}

const RECOGNIZED_KEYS = ['profile', 'workspace', 'instance_origin', 'account_origin', 'branch'] as const

/** Fields that may be layered onto a resolved profile (everything except the profile pointer). */
const OVERRIDE_KEYS = ['workspace', 'instance_origin', 'account_origin', 'branch'] as const

/**
 * Parse the raw contents of a profile.yaml.
 * - Throws if `access_token` is present (secrets belong in credentials.yaml).
 * - Returns null if the content is not an object or has no recognized keys
 *   (so an unrelated profile.yaml from another tool is ignored, not hijacked).
 */
export function parseLocalProfile(raw: string): LocalProfileConfig | null {
  const parsed = yaml.load(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const obj = parsed as Record<string, unknown>

  if ('access_token' in obj) {
    throw new Error(
      `profile.yaml must not contain access_token. ` +
        `Tokens belong in credentials.yaml — reference a profile by name instead.`,
    )
  }

  const config: LocalProfileConfig = {}
  for (const key of RECOGNIZED_KEYS) {
    if (obj[key] !== undefined && obj[key] !== null) {
      config[key] = String(obj[key])
    }
  }

  if (Object.keys(config).length === 0) {
    return null
  }

  return config
}

/**
 * Return a new profile with the local override fields applied.
 * The `profile` pointer is never copied; secrets are preserved from the base.
 */
export function applyLocalOverrides(base: ProfileConfig, local: LocalProfileConfig): ProfileConfig {
  const result: ProfileConfig = {...base}
  for (const key of OVERRIDE_KEYS) {
    if (local[key] !== undefined) {
      result[key] = local[key] as string
    }
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx mocha --spec test/utils/local-config.test.ts`
Expected: PASS (10 passing).

- [ ] **Step 5: Add failing tests for `findLocalProfilePath`**

Append to `test/utils/local-config.test.ts` (add `findLocalProfilePath` to the import, and `import * as fs`, `import * as os`, `import * as path`, `import {LOCAL_PROFILE_FILENAME}` at the top of the file):

```typescript
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
// add findLocalProfilePath and LOCAL_PROFILE_FILENAME to the existing import block

describe('findLocalProfilePath', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xano-localcfg-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, {force: true, recursive: true})
  })

  it('finds profile.yaml in the start directory', () => {
    const file = path.join(tmp, LOCAL_PROFILE_FILENAME)
    fs.writeFileSync(file, 'profile: dev')
    expect(findLocalProfilePath(tmp)).to.equal(file)
  })

  it('walks up to find profile.yaml in a parent directory', () => {
    const file = path.join(tmp, LOCAL_PROFILE_FILENAME)
    fs.writeFileSync(file, 'profile: dev')
    const nested = path.join(tmp, 'a', 'b')
    fs.mkdirSync(nested, {recursive: true})
    expect(findLocalProfilePath(nested)).to.equal(file)
  })

  it('returns null when no profile.yaml exists up the tree', () => {
    const nested = path.join(tmp, 'a', 'b')
    fs.mkdirSync(nested, {recursive: true})
    expect(findLocalProfilePath(nested)).to.equal(null)
  })

  it('returns the nearest profile.yaml when several exist', () => {
    fs.writeFileSync(path.join(tmp, LOCAL_PROFILE_FILENAME), 'profile: root')
    const nested = path.join(tmp, 'child')
    fs.mkdirSync(nested)
    const near = path.join(nested, LOCAL_PROFILE_FILENAME)
    fs.writeFileSync(near, 'profile: child')
    expect(findLocalProfilePath(nested)).to.equal(near)
  })
})
```

- [ ] **Step 6: Run the new tests to verify they fail**

Run: `npx mocha --spec test/utils/local-config.test.ts`
Expected: FAIL — `findLocalProfilePath is not a function`.

- [ ] **Step 7: Implement `findLocalProfilePath`**

Append to `src/utils/local-config.ts`:

```typescript
/**
 * Walk up from `startDir` to the filesystem root, returning the path of the
 * first profile.yaml found, or null if none exists.
 */
export function findLocalProfilePath(startDir: string): string | null {
  let dir = path.resolve(startDir)

  while (true) {
    const candidate = path.join(dir, LOCAL_PROFILE_FILENAME)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate
    }

    const parent = path.dirname(dir)
    if (parent === dir) {
      return null
    }

    dir = parent
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx mocha --spec test/utils/local-config.test.ts`
Expected: PASS (14 passing).

- [ ] **Step 9: Build to confirm no type errors**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 10: Commit**

```bash
git add src/utils/local-config.ts test/utils/local-config.test.ts
git commit -m "feat: local-config discovery, parsing, and override merge"
```

---

## Task 2: `local-config.ts` — selection logic and banner formatting

**Files:**
- Modify: `src/utils/local-config.ts`
- Test: `test/utils/local-config.test.ts`

- [ ] **Step 1: Write failing tests for `resolveProfileSelection` and `formatLocalProfileBanner`**

Add `resolveProfileSelection` and `formatLocalProfileBanner` to the import block in `test/utils/local-config.test.ts`, then append:

```typescript
describe('resolveProfileSelection', () => {
  it('uses the explicit profile and skips local overrides when -p/env is set', () => {
    const result = resolveProfileSelection({
      defaultProfile: 'default',
      explicitProfile: 'heimstaden',
      hasLocal: true,
      localProfileName: 'brice-dev',
    })
    expect(result).to.deep.equal({applyLocal: false, profileName: 'heimstaden'})
  })

  it('uses the local profile name and applies overrides when no explicit profile', () => {
    const result = resolveProfileSelection({
      defaultProfile: 'default',
      hasLocal: true,
      localProfileName: 'brice-dev',
    })
    expect(result).to.deep.equal({applyLocal: true, profileName: 'brice-dev'})
  })

  it('falls back to the default profile but still applies overrides when local omits a name', () => {
    const result = resolveProfileSelection({
      defaultProfile: 'default',
      hasLocal: true,
    })
    expect(result).to.deep.equal({applyLocal: true, profileName: 'default'})
  })

  it('uses the default profile when there is no local file', () => {
    const result = resolveProfileSelection({
      defaultProfile: 'default',
      hasLocal: false,
    })
    expect(result).to.deep.equal({applyLocal: false, profileName: 'default'})
  })
})

describe('formatLocalProfileBanner', () => {
  it('includes the workspace when one is given', () => {
    expect(formatLocalProfileBanner('brice-dev', '110', 'profile.yaml')).to.equal(
      "Using profile 'brice-dev' (workspace 110) · profile.yaml",
    )
  })

  it('omits the workspace clause when not given', () => {
    expect(formatLocalProfileBanner('brice-dev', undefined, 'profile.yaml')).to.equal(
      "Using profile 'brice-dev' · profile.yaml",
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx mocha --spec test/utils/local-config.test.ts`
Expected: FAIL — `resolveProfileSelection is not a function`.

- [ ] **Step 3: Implement `resolveProfileSelection` and `formatLocalProfileBanner`**

Append to `src/utils/local-config.ts`:

```typescript
/**
 * Decide which profile name to use and whether local overrides apply.
 * Precedence: explicit -p/XANO_PROFILE > local profile.yaml > credentials default.
 * An explicit profile disables the local file entirely (name and overrides).
 */
export function resolveProfileSelection(params: {
  defaultProfile: string
  explicitProfile?: string
  hasLocal: boolean
  localProfileName?: string
}): {applyLocal: boolean; profileName: string} {
  if (params.explicitProfile) {
    return {applyLocal: false, profileName: params.explicitProfile}
  }

  if (params.hasLocal) {
    return {applyLocal: true, profileName: params.localProfileName ?? params.defaultProfile}
  }

  return {applyLocal: false, profileName: params.defaultProfile}
}

/** Format the one-line banner shown when a local profile.yaml is in effect. */
export function formatLocalProfileBanner(
  profileName: string,
  workspace: string | undefined,
  relativePath: string,
): string {
  const workspaceClause = workspace ? ` (workspace ${workspace})` : ''
  return `Using profile '${profileName}'${workspaceClause} · ${relativePath}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx mocha --spec test/utils/local-config.test.ts`
Expected: PASS (20 passing).

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add src/utils/local-config.ts test/utils/local-config.test.ts
git commit -m "feat: local-config profile selection and banner formatting"
```

---

## Task 3: Wire local config into `BaseCommand`

**Files:**
- Modify: `src/base-command.ts`
- Test: `test/utils/base-command.test.ts` (create)

- [ ] **Step 1: Write a failing test for the argv profile-flag detector**

Create `test/utils/base-command.test.ts`:

```typescript
import {expect} from 'chai'

import {argvHasProfileFlag} from '../../src/base-command.js'

describe('argvHasProfileFlag', () => {
  it('detects -p', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'workspace', 'push', '-p', 'prod'], {})).to.equal(true)
  })

  it('detects --profile', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push', '--profile', 'prod'], {})).to.equal(true)
  })

  it('detects --profile=value', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push', '--profile=prod'], {})).to.equal(true)
  })

  it('detects the XANO_PROFILE env var', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push'], {XANO_PROFILE: 'prod'})).to.equal(true)
  })

  it('returns false when neither flag nor env is present', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push'], {})).to.equal(false)
  })

  it('ignores an empty XANO_PROFILE', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push'], {XANO_PROFILE: ''})).to.equal(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx mocha --spec test/utils/base-command.test.ts`
Expected: FAIL — `argvHasProfileFlag is not a function`.

- [ ] **Step 3: Add and export `argvHasProfileFlag` in `base-command.ts`**

Add this exported function near the top of `src/base-command.ts` (after `resolveCredentialsPath`):

```typescript
/**
 * Detect whether an explicit profile was requested via -p/--profile or the
 * XANO_PROFILE env var. Used at init() time, before flags are parsed, to decide
 * whether the project-local profile.yaml should be ignored (explicit wins).
 */
export function argvHasProfileFlag(argv: string[], env: NodeJS.ProcessEnv): boolean {
  if (env.XANO_PROFILE) {
    return true
  }

  for (const arg of argv) {
    if (arg === '-p' || arg === '--profile' || arg.startsWith('--profile=') || arg.startsWith('-p=')) {
      return true
    }
  }

  return false
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx mocha --spec test/utils/base-command.test.ts`
Expected: PASS (6 passing).

- [ ] **Step 5: Add the local-config import and a cached field to `BaseCommand`**

At the top of `src/base-command.ts`, add to the imports:

```typescript
import {
  applyLocalOverrides,
  findLocalProfilePath,
  formatLocalProfileBanner,
  type LocalProfileConfig,
  parseLocalProfile,
  resolveProfileSelection,
} from './utils/local-config.js'
```

Inside the `BaseCommand` class, add a cached field next to `updateNotice`:

```typescript
  protected localProfile: {config: LocalProfileConfig; path: string} | null = null
```

- [ ] **Step 6: Load the local profile and print the banner in `init()`**

Replace the existing `init()` body in `src/base-command.ts` with:

```typescript
  async init(): Promise<void> {
    await super.init()
    this.localProfile = this.loadLocalProfile()
    this.applyInsecureFromProfile()
    this.maybePrintLocalProfileBanner()

    const forceUpdateCheck = process.env.XANO_FORCE_UPDATE_CHECK === '1'
    this.updateNotice = checkForUpdate(this.config.version, forceUpdateCheck)
  }

  /**
   * Find and parse the nearest project-local profile.yaml, unless an explicit
   * -p/XANO_PROFILE was given (in which case the local file is ignored).
   */
  private loadLocalProfile(): {config: LocalProfileConfig; path: string} | null {
    if (argvHasProfileFlag(process.argv, process.env)) {
      return null
    }

    const filePath = findLocalProfilePath(process.cwd())
    if (!filePath) {
      return null
    }

    let config: LocalProfileConfig | null
    try {
      config = parseLocalProfile(fs.readFileSync(filePath, 'utf8'))
    } catch (error) {
      this.error(`${filePath}: ${(error as Error).message}`)
    }

    if (!config) {
      this.warn(`Ignoring ${filePath}: no recognized profile keys found.`)
      return null
    }

    return {config, path: filePath}
  }

  /** Print the one-line target banner when a local profile.yaml is in effect. */
  private maybePrintLocalProfileBanner(): void {
    if (!this.localProfile || this.isJsonOutput()) {
      return
    }

    const {config, path: filePath} = this.localProfile
    const profileName = config.profile ?? this.getDefaultProfile()
    const relativePath = path.relative(process.cwd(), filePath) || path.basename(filePath)
    this.log(formatLocalProfileBanner(profileName, config.workspace, relativePath))
  }
```

- [ ] **Step 7: Merge overrides in `resolveProfile()`**

Replace the existing `resolveProfile()` method in `src/base-command.ts` with:

```typescript
  /**
   * Resolve the profile from flags and any project-local profile.yaml,
   * validating instance_origin and access_token exist.
   * Precedence: -p/XANO_PROFILE > profile.yaml > credentials default.
   */
  protected resolveProfile(flags: {profile?: string}): {profile: ProfileConfig; profileName: string} {
    const credentials = this.loadCredentialsFile()
    const {applyLocal, profileName} = resolveProfileSelection({
      defaultProfile: this.getDefaultProfile(),
      explicitProfile: flags.profile,
      hasLocal: Boolean(this.localProfile),
      localProfileName: this.localProfile?.config.profile,
    })

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\n` + `Create a profile using 'xano profile create'`)
    }

    let profile = credentials.profiles[profileName]

    if (applyLocal && this.localProfile) {
      profile = applyLocalOverrides(profile, this.localProfile.config)
    }

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    return {profile, profileName}
  }
```

- [ ] **Step 8: Update `applyInsecureFromProfile()` to respect the local profile name**

In `src/base-command.ts`, change the `profileName` line inside `applyInsecureFromProfile()` from:

```typescript
      const profileName = (this as any).flags?.profile || this.getDefaultProfile()
```

to:

```typescript
      const profileName =
        (this as any).flags?.profile || this.localProfile?.config.profile || this.getDefaultProfile()
```

- [ ] **Step 9: Build to confirm the integration type-checks**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 10: Manual smoke test of the banner and override**

Run:

```bash
mkdir -p /tmp/xano-smoke && cd /tmp/xano-smoke && printf 'profile: default\nworkspace: 999\n' > profile.yaml
node /Users/brice/Code/cli/bin/dev.js workspace push --dry-run 2>&1 | head -5
cd - && rm -rf /tmp/xano-smoke
```

Expected: the first output line is `Using profile 'default' (workspace 999) · profile.yaml` (the push itself may then error on credentials/network — that is fine; we are only verifying the banner and that workspace 999 is targeted).

- [ ] **Step 11: Run the full test + lint suite**

Run: `npm test`
Expected: all tests pass, lint clean.

- [ ] **Step 12: Commit**

```bash
git add src/base-command.ts test/utils/base-command.test.ts
git commit -m "feat: resolve project-local profile.yaml in BaseCommand"
```

---

## Task 4: `xano profile use` generator command

**Files:**
- Create: `src/commands/profile/use/index.ts`
- Test: `test/commands/profile/use.test.ts`

- [ ] **Step 1: Write a failing test for the `.gitignore` helper**

Create `test/commands/profile/use.test.ts`:

```typescript
import {expect} from 'chai'

import {ensureGitignoreEntry} from '../../../src/commands/profile/use/index.js'

describe('ensureGitignoreEntry', () => {
  it('appends the entry to existing content that lacks it', () => {
    const result = ensureGitignoreEntry('node_modules\ndist\n', 'profile.yaml')
    expect(result).to.deep.equal({changed: true, content: 'node_modules\ndist\nprofile.yaml\n'})
  })

  it('adds a trailing newline before appending when missing', () => {
    const result = ensureGitignoreEntry('node_modules', 'profile.yaml')
    expect(result).to.deep.equal({changed: true, content: 'node_modules\nprofile.yaml\n'})
  })

  it('creates content from null', () => {
    const result = ensureGitignoreEntry(null, 'profile.yaml')
    expect(result).to.deep.equal({changed: true, content: 'profile.yaml\n'})
  })

  it('does not duplicate an entry already present as a line', () => {
    const result = ensureGitignoreEntry('dist\nprofile.yaml\n', 'profile.yaml')
    expect(result).to.deep.equal({changed: false, content: 'dist\nprofile.yaml\n'})
  })

  it('does not treat a substring match as present', () => {
    const result = ensureGitignoreEntry('my-profile.yaml.bak\n', 'profile.yaml')
    expect(result.changed).to.equal(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx mocha --spec test/commands/profile/use.test.ts`
Expected: FAIL — cannot find module `.../profile/use/index.js`.

- [ ] **Step 3: Implement the command and the exported helper**

Create `src/commands/profile/use/index.ts`:

```typescript
import {Args, Command, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {resolveCredentialsPath} from '../../../base-command.js'
import {LOCAL_PROFILE_FILENAME, type LocalProfileConfig} from '../../../utils/local-config.js'

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: unknown
  }
}

/**
 * Ensure `entry` exists as its own line in a .gitignore.
 * Returns the (possibly unchanged) content and whether a write is needed.
 */
export function ensureGitignoreEntry(
  existing: string | null,
  entry: string,
): {changed: boolean; content: string} {
  const lines = existing ? existing.split('\n').map((line) => line.trim()) : []
  if (lines.includes(entry)) {
    return {changed: false, content: existing ?? ''}
  }

  const base = existing && !existing.endsWith('\n') ? existing + '\n' : existing ?? ''
  return {changed: true, content: `${base}${entry}\n`}
}

export default class ProfileUse extends Command {
  static args = {
    name: Args.string({
      description: 'Profile name (from credentials.yaml) to pin for this project',
      required: true,
    }),
  }

  static description =
    'Pin a profile for the current project by writing a local profile.yaml. ' +
    'When present, the CLI uses this profile (and any overrides) instead of the default, ' +
    'unless -p/--profile or XANO_PROFILE is set.'

  static examples = [
    `$ xano profile use brice-dev
Wrote profile.yaml pinning profile 'brice-dev'
`,
    `$ xano profile use brice-dev -w 110
Wrote profile.yaml pinning profile 'brice-dev' (workspace 110)
`,
    `$ xano profile use brice-dev -w 110 --gitignore
Wrote profile.yaml and added it to .gitignore
`,
  ]

  static override flags = {
    account_origin: Flags.string({
      char: 'a',
      description: 'Override account origin for this project',
      required: false,
    }),
    branch: Flags.string({
      char: 'b',
      description: 'Override branch for this project',
      required: false,
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to credentials file (default: ~/.xano/credentials.yaml)',
      env: 'XANO_CONFIG',
      required: false,
    }),
    gitignore: Flags.boolean({
      allowNo: true,
      description: 'Add (or skip adding) profile.yaml to .gitignore without prompting',
      required: false,
    }),
    instance_origin: Flags.string({
      char: 'i',
      description: 'Override instance origin for this project',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Override workspace for this project',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfileUse)

    this.assertProfileExists(args.name, flags.config)

    const config: LocalProfileConfig = {profile: args.name}
    if (flags.workspace) config.workspace = flags.workspace
    if (flags.instance_origin) config.instance_origin = flags.instance_origin
    if (flags.account_origin) config.account_origin = flags.account_origin
    if (flags.branch) config.branch = flags.branch

    const filePath = path.resolve(process.cwd(), LOCAL_PROFILE_FILENAME)
    if (fs.existsSync(filePath)) {
      this.warn(`Overwriting existing ${LOCAL_PROFILE_FILENAME}`)
    }

    fs.writeFileSync(filePath, yaml.dump(config, {indent: 2, lineWidth: -1, noRefs: true}), 'utf8')
    const workspaceNote = flags.workspace ? ` (workspace ${flags.workspace})` : ''
    this.log(`Wrote ${LOCAL_PROFILE_FILENAME} pinning profile '${args.name}'${workspaceNote}`)

    await this.handleGitignore(flags.gitignore)
  }

  private assertProfileExists(name: string, configPath?: string): void {
    const credentialsPath = resolveCredentialsPath(configPath)
    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}. Create a profile first using 'xano auth'.`)
    }

    const parsed = yaml.load(fs.readFileSync(credentialsPath, 'utf8')) as CredentialsFile
    if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
      this.error('Credentials file has invalid format.')
    }

    if (!(name in parsed.profiles)) {
      this.error(`Profile '${name}' not found. Available profiles: ${Object.keys(parsed.profiles).join(', ')}`)
    }
  }

  private async handleGitignore(flag: boolean | undefined): Promise<void> {
    let shouldAdd = flag
    if (shouldAdd === undefined) {
      const {add} = await inquirer.prompt([
        {
          default: false,
          message: `Add ${LOCAL_PROFILE_FILENAME} to .gitignore?`,
          name: 'add',
          type: 'confirm',
        },
      ])
      shouldAdd = add
    }

    if (!shouldAdd) {
      return
    }

    const gitignorePath = path.resolve(process.cwd(), '.gitignore')
    const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : null
    const {changed, content} = ensureGitignoreEntry(existing, LOCAL_PROFILE_FILENAME)
    if (changed) {
      fs.writeFileSync(gitignorePath, content, 'utf8')
      this.log(`Added ${LOCAL_PROFILE_FILENAME} to .gitignore`)
    } else {
      this.log(`${LOCAL_PROFILE_FILENAME} is already in .gitignore`)
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx mocha --spec test/commands/profile/use.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 5: Build to confirm the command compiles and registers**

Run: `npm run build && node /Users/brice/Code/cli/bin/run.js profile use --help`
Expected: help output for `xano profile use` listing the `-w`, `-b`, `-i`, `-a`, `--gitignore` flags.

- [ ] **Step 6: Manual smoke test of the generator**

Run:

```bash
mkdir -p /tmp/xano-use && cd /tmp/xano-use
node /Users/brice/Code/cli/bin/dev.js profile use default -w 123 --no-gitignore 2>&1
cat profile.yaml
cd - && rm -rf /tmp/xano-use
```

Expected: `profile.yaml` contains `profile: default` and `workspace: '123'` (or `123`); output reports it wrote the file. (Uses the real `default` profile from `~/.xano/credentials.yaml`; if no such profile exists, run with a profile name that does.)

- [ ] **Step 7: Run the full test + lint suite**

Run: `npm test`
Expected: all pass, lint clean.

- [ ] **Step 8: Commit**

```bash
git add src/commands/profile/use/index.ts test/commands/profile/use.test.ts
git commit -m "feat: add 'xano profile use' to pin a project-local profile.yaml"
```

---

## Task 5: Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a "Project-local profile" section to `README.md`**

In `README.md`, just after the profile/credentials documentation block (around the lines describing `~/.xano/credentials.yaml` and the `XANO_CONFIG` env var, near line 550–570), insert:

````markdown
### Project-local profile (`profile.yaml`)

To avoid accidentally targeting the wrong workspace, pin a project to a profile
by adding a `profile.yaml` file at the project root. The CLI searches the
current directory and walks up parent directories (like `.git`) to find it.

`profile.yaml` contains **no secrets** — it references a profile by name; the
access token always comes from `~/.xano/credentials.yaml`. An `access_token`
key is rejected.

```yaml
# ./profile.yaml
profile: brice-dev        # which credentials.yaml profile to use
workspace: 110            # optional override
instance_origin: https://x62j-rlqn-vpsk.dev.xano.io   # optional override
account_origin: https://app.dev.xano.com              # optional override
branch: dev-feature       # optional override
```

When a `profile.yaml` is in effect, every command prints the active target,
e.g. `Using profile 'brice-dev' (workspace 110) · profile.yaml` (suppressed for
`--output json`).

Generate one with `xano profile use`:

```bash
xano profile use brice-dev -w 110     # writes ./profile.yaml; prompts to .gitignore
xano profile use brice-dev --no-gitignore
```

**Profile selection precedence:**

1. `-p/--profile` flag
2. `XANO_PROFILE` environment variable
3. `profile.yaml` (`profile:` field, plus field overrides)
4. Default profile from the credentials file

An explicit `-p/--profile` or `XANO_PROFILE` ignores `profile.yaml` entirely.
````

- [ ] **Step 2: Add `xano profile use` to the profile command reference in `README.md`**

Find the section listing profile commands (where `profile create`, `profile list`, `profile set` are documented) and add an entry:

````markdown
#### `xano profile use <name>`

Pin a profile for the current project by writing a local `profile.yaml`.

```bash
xano profile use brice-dev              # pin profile 'brice-dev' for this project
xano profile use brice-dev -w 110       # pin and override the workspace
xano profile use brice-dev --gitignore  # also add profile.yaml to .gitignore
```

| Flag | Description |
|------|-------------|
| `-w, --workspace` | Override workspace for this project |
| `-b, --branch` | Override branch for this project |
| `-i, --instance_origin` | Override instance origin |
| `-a, --account_origin` | Override account origin |
| `--gitignore` / `--no-gitignore` | Add (or skip adding) `profile.yaml` to `.gitignore` without prompting |
````

- [ ] **Step 3: Update the Profile Selection Priority section in `CLAUDE.md`**

In `CLAUDE.md`, replace the "Profile Selection Priority" list with:

```markdown
## Profile Selection Priority

1. `-p/--profile` flag
2. `XANO_PROFILE` environment variable
3. Project-local `profile.yaml` (`profile:` field + field overrides; found by walking up from the working directory)
4. Default profile from credentials file

An explicit `-p/--profile` or `XANO_PROFILE` ignores `profile.yaml` entirely.
`profile.yaml` never contains secrets — it references a profile by name; tokens
stay in `~/.xano/credentials.yaml`. Generated by `xano profile use <name>`.
```

- [ ] **Step 4: Verify the docs build/links and run the suite once more**

Run: `npm test`
Expected: all pass, lint clean. (No code changed, but confirms the tree is green.)

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document project-local profile.yaml and 'xano profile use'"
```

---

## Self-Review Notes

- **Spec coverage:** local file shape + forbidden token (Task 1), discovery walk-up (Task 1), precedence + merge + explicit-wins (Task 2 + Task 3), always-on banner with json suppression (Task 3), `xano profile use` with overrides + gitignore prompt/flag + overwrite warning (Task 4), docs incl. README + CLAUDE.md (Task 5). All spec sections map to a task.
- **Type consistency:** `LocalProfileConfig`, `findLocalProfilePath`, `parseLocalProfile`, `applyLocalOverrides`, `resolveProfileSelection`, `formatLocalProfileBanner`, `argvHasProfileFlag`, `ensureGitignoreEntry` are defined once and referenced with identical signatures everywhere.
- **No placeholders:** every code/test step contains complete content and exact run commands with expected output.
