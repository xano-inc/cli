# CLAUDE.md - Project Guidelines for Claude Code

## Project Overview

Xano CLI (`@xano/cli`) is a TypeScript command-line interface for Xano's Metadata API. It provides commands for managing profiles, workspaces, branches, functions, releases, tenants, tests, and static hosting - all from the terminal.

**Binary name:** `xano` (invoked as `xano <command>`)

## Tech Stack

- **oclif 4** CLI framework with custom help class
- **TypeScript 5** (strict mode, ES2022 target, Node16 module resolution)
- **Node.js 18+** runtime (ESM-first architecture)
- **inquirer 8** for interactive prompts
- **js-yaml 4** for credentials file parsing
- **Mocha 10 + Chai 4** for testing
- **ESLint 9** with oclif + Prettier configs

## Critical Rules

### 1. Code Quality

- Small, focused modules (200-400 lines typical)
- High cohesion within modules
- Interface-based design for testability
- Meaningful variable and function names

### 2. Error Handling

```typescript
// Always handle errors with context
try {
  await doSomething();
} catch (err) {
  throw new Error(`failed to do something: ${err.message}`);
}
```

### 3. Testing

- TDD: Write tests first
- 80% minimum coverage
- Unit tests for business logic
- Integration tests for API endpoints

### 4. Security

- No hardcoded credentials
- Environment variables for secrets
- Validate all user input
- Audit logging for sensitive operations

### 5. Git Safety

- NEVER run destructive commands (`push --force`, `reset --hard`, `checkout .`) unless explicitly requested
- NEVER skip hooks (`--no-verify`) unless explicitly requested
- NEVER force push to main/master
- Always create NEW commits rather than amending unless explicitly requested

## Commands

```bash
npm run build    # Clean dist/ and compile TypeScript
npm run dev      # Run in dev mode (ts-node, no build needed)
npm run lint     # Run ESLint
npm test         # Run Mocha tests + lint
```

**Running commands in dev:**

```bash
./bin/dev.js profile list
./bin/dev.js workspace list
```

## Project Structure

```
src/
├── base-command.ts              # Base class for all commands (profile flag)
├── help.ts                      # Custom oclif help class
├── index.ts                     # Entry point (re-exports oclif run)
├── commands/
│   ├── auth/                    # Browser-based authentication
│   ├── profile/                 # Profile management (9 commands)
│   │   ├── wizard.ts            # Interactive profile creation
│   │   ├── create.ts            # Manual profile creation
│   │   ├── list.ts              # List profiles
│   │   ├── get-default.ts       # Get default profile
│   │   ├── set-default.ts       # Set default profile
│   │   ├── edit.ts              # Edit profile
│   │   ├── delete.ts            # Delete profile
│   │   ├── me.ts                # Current user info
│   │   └── token.ts             # Token management
│   ├── workspace/               # Workspace management (CRUD, push, pull)
│   ├── branch/                  # Branch management (CRUD, set_live)
│   ├── function/                # Function management (4 commands)
│   │   ├── list.ts
│   │   ├── get.ts
│   │   ├── create.ts
│   │   └── edit.ts
│   ├── release/                 # Release management (CRUD, import, export)
│   ├── tenant/                  # Tenant management (CRUD, deploy, backups)
│   ├── platform/                # Platform management (list, get)
│   ├── unit_test/               # Unit test management (list, run, run_all)
│   ├── workflow_test/           # Workflow test management (list, get, delete, run, run_all)
│   └── static_host/             # Static hosting (4 commands)
│       ├── list.ts
│       └── build/

bin/
├── dev.js                       # Dev entry (ts-node with ESM loader)
└── run.js                       # Production entry (compiled dist/)

examples/
├── function/                    # Function examples
└── static_host/                 # Static host examples

test/
└── commands/                    # Mocha test files
```

## Coding Conventions

### Naming Convention

**Use underscores, not dashes, for all identifiers:** directory names, filenames, variable names, and generated output files. This applies to command directories (e.g., `get_all/`, not `get-all/`) and default output filenames (e.g., `env_my-tenant.yaml`, not `env-my-tenant.yaml`).

### Command Structure

Every command extends `BaseCommand`:

```typescript
import {Flags} from '@oclif/core'
import BaseCommand from '../../base-command.js'

export default class MyCommand extends BaseCommand {
  static override description = 'Command description'

  static override examples = [
    '$ xano my_topic my_command --flag value',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    myFlag: Flags.string({
      char: 'f',
      description: 'Flag description',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MyCommand)
    // Implementation
  }
}
```

### Base Classes

| Class | Location | Purpose |
|-------|----------|---------|
| `BaseCommand` | `src/base-command.ts` | All commands - provides `-p/--profile` flag, credential loading |

### Argument Rules

**Commands MUST have at most one positional argument.** Use flags for any additional named values.

oclif sorts `static args` alphabetically by key name, not by declaration order. This means if you define two args like `tenant_name` and `env_name`, oclif will present them as `ENV_NAME TENANT_NAME` (alphabetically), which confuses users. The fix is to keep only one arg (the primary resource identifier) and move everything else to flags.

```typescript
// WRONG - multiple args will be alphabetically reordered
static override args = {
  tenant_name: Args.string({required: true}),
  env_name: Args.string({required: true}),  // Will appear BEFORE tenant_name!
}

// RIGHT - one arg, rest are flags
static override args = {
  tenant_name: Args.string({required: true}),
}
static override flags = {
  ...BaseCommand.baseFlags,
  name: Flags.string({char: 'n', required: true}),
}
```

### Flag Patterns

- **Profile flag** (`-p`): Inherited from `BaseCommand.baseFlags`, selects credential profile
- **Output flag** (`-o`): `json` or `summary` format
- **Workspace flag** (`-w`): Workspace ID override
- **Stdin flag**: Accept input from stdin for piping

### Error Handling

- Use `this.error('message')` for user-facing errors (oclif standard)
- Use `this.warn('message')` for non-fatal warnings
- Use `this.log('message')` for standard output

### Output Formats

Commands supporting `--output` flag use:

```typescript
protected outputJson(data: unknown): void {
  this.log(JSON.stringify(data, null, 2))
}
```

## Authentication & Profiles

### Credentials File

Location: `~/.xano/credentials.yaml`

```yaml
profiles:
  default:
    account_origin: https://app.xano.com
    instance_origin: https://instance.xano.com
    access_token: <token>
    workspace: <workspace_id>
    branch: <branch_id>
  production:
    instance_origin: https://prod.xano.com
    access_token: <token>
default: default
```

### Profile Selection Priority

1. `-p/--profile` flag
2. `XANO_PROFILE` environment variable
3. Default profile from credentials file

## oclif Configuration

From `package.json`:

```json
{
  "oclif": {
    "bin": "xano",
    "dirname": "xano",
    "commands": "./dist/commands",
    "helpClass": "./dist/help",
    "topicSeparator": " ",
    "plugins": ["@oclif/plugin-help", "@oclif/plugin-plugins"]
  }
}
```

- **Topic separator:** Space (e.g., `xano profile create`, not `xano profile:create`)
- **Custom help class** at `src/help.ts` displays env var info
- **Plugin system** enabled for extensibility

## Testing

- **Framework:** Mocha 10 + Chai 4 + @oclif/test 4
- **Timeout:** 60 seconds per test
- **Config:** `.mocharc.json` with ts-node ESM loader
- **Run:** `npm test` (runs tests then lint)

```typescript
import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('command-name', () => {
  it('runs successfully', async () => {
    const {stdout} = await runCommand('profile list')
    expect(stdout).to.contain('expected output')
  })
})
```

## Adding New Features

### New Command

1. Create file in `src/commands/<topic>/<command>.ts`
2. Extend `BaseCommand`
3. Define static `description`, `examples`, `flags`, `args`
4. Implement `async run()` method
5. Inherit `...BaseCommand.baseFlags` in flags
6. Run `npm run build` to compile

## Lint & Format

- **ESLint 9** flat config (`eslint.config.mjs`) with oclif + Prettier presets
- **Prettier** uses `@oclif/prettier-config`
- Run `npm run lint` to check
