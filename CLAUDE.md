# CLAUDE.md - Project Guidelines for Claude Code

## Project Overview

Xano CLI (`@xano/cli`) is a TypeScript command-line interface for Xano's Metadata API and Run API. It provides commands for managing profiles, workspaces, functions, xano.run projects/sessions, and static hosting - all from the terminal.

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
./bin/dev.js run exec --file script.xs
```

## Project Structure

```
src/
├── base-command.ts              # Base class for all commands (profile flag)
├── help.ts                      # Custom oclif help class
├── index.ts                     # Entry point (re-exports oclif run)
├── commands/
│   ├── profile/                 # Profile management (10 commands)
│   │   ├── wizard.ts            # Interactive profile creation
│   │   ├── create.ts            # Manual profile creation
│   │   ├── list.ts              # List profiles
│   │   ├── get-default.ts       # Get default profile
│   │   ├── set-default.ts       # Set default profile
│   │   ├── edit.ts              # Edit profile
│   │   ├── delete.ts            # Delete profile
│   │   ├── me.ts                # Current user info
│   │   ├── token.ts             # Token management
│   │   └── project.ts           # Project settings
│   ├── workspace/
│   │   └── list.ts              # List workspaces
│   ├── function/                # Function management (4 commands)
│   │   ├── list.ts
│   │   ├── get.ts
│   │   ├── create.ts
│   │   └── edit.ts
│   ├── run/                     # xano.run commands (19 commands)
│   │   ├── exec.ts              # Execute XanoScript
│   │   ├── info.ts              # Get document info
│   │   ├── projects/            # Project CRUD
│   │   ├── sessions/            # Session management
│   │   ├── env/                 # Environment variables
│   │   ├── secrets/             # Secret management
│   │   └── sink/                # Sink data retrieval
│   └── static_host/             # Static hosting (4 commands)
│       ├── list.ts
│       └── build/
└── lib/                         # Shared library code
    ├── base-run-command.ts      # Base class for run commands (auth, HTTP client)
    ├── run-http-client.ts       # HTTP client for Run API
    └── run-types.ts             # TypeScript interfaces for Run API

bin/
├── dev.js                       # Dev entry (ts-node with ESM loader)
└── run.js                       # Production entry (compiled dist/)

examples/
├── ephemeral/                   # XanoScript job/service examples
├── function/                    # Function examples
└── static_host/                 # Static host examples

test/
└── commands/                    # Mocha test files
```

## Coding Conventions

### Command Structure

Every command extends `BaseCommand` (or `BaseRunCommand` for run commands):

```typescript
import {Flags} from '@oclif/core'
import BaseCommand from '../../base-command.js'

export default class MyCommand extends BaseCommand {
  static override description = 'Command description'

  static override examples = [
    '$ xano my-topic my-command --flag value',
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
| `BaseRunCommand` | `src/lib/base-run-command.ts` | Run commands - adds HTTP client, project/profile init, `outputJson()` |

### Flag Patterns

- **Profile flag** (`-p`): Inherited from `BaseCommand.baseFlags`, selects credential profile
- **Output flag** (`-o`): `json` or `summary` format
- **Workspace flag** (`-w`): Workspace ID override
- **Stdin flag**: Accept input from stdin for piping

### HTTP Client

Run commands use `RunHttpClient` from `src/lib/run-http-client.ts`:

```typescript
// URL builders
this.httpClient.buildUrl('/path')                    // Base URL + path
this.httpClient.buildProjectUrl('/path')             // Base URL + /project/:id + path
this.httpClient.buildSessionUrl(sessionId, '/path')  // Base URL + /session/:id + path

// HTTP methods
await this.httpClient.get<T>(url)
await this.httpClient.post<T>(url, body)
await this.httpClient.postXanoScript<T>(url, code)   // Content-Type: text/plain
await this.httpClient.patch<T>(url, body)
await this.httpClient.delete<T>(url, body)
```

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

## Key Types

Types are defined in `src/lib/run-types.ts`:

| Type | Purpose |
|------|---------|
| `ProfileConfig` | Profile credentials (origin, token, workspace, branch, project) |
| `CredentialsFile` | Full credentials YAML structure |
| `Project` | xano.run project (id, name, description, access) |
| `Session` | xano.run session (id, status, uptime, url, doc) |
| `Secret` | Secret (name, type: dockerconfigjson or service-account-token) |
| `EnvVariable` | Environment variable (name, value) |
| `RunResult` | Execution result with timing, response, endpoints |
| `PaginatedResponse<T>` | Generic paginated API response |
| `SinkData` | Tables and logs from completed sessions |

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
    project: <project_id>
    run_base_url: https://app.xano.com/
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
2. Extend `BaseCommand` (or `BaseRunCommand` for run commands)
3. Define static `description`, `examples`, `flags`, `args`
4. Implement `async run()` method
5. Inherit `...BaseCommand.baseFlags` in flags
6. Run `npm run build` to compile

### New Run Subcommand

1. Create file in `src/commands/run/<subtopic>/<command>.ts`
2. Extend `BaseRunCommand`
3. Call `await this.initRunCommand()` or `await this.initRunCommandWithProject()` in `run()`
4. Use `this.httpClient` for API calls
5. Use `this.outputJson()` for formatted output

### New Types

1. Add interfaces to `src/lib/run-types.ts`
2. Follow existing naming conventions (no `I` prefix - plain interface names)

## Lint & Format

- **ESLint 9** flat config (`eslint.config.mjs`) with oclif + Prettier presets
- **Prettier** uses `@oclif/prettier-config`
- Run `npm run lint` to check
