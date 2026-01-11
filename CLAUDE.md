# Xano CLI Project Guide

## Project Overview

This is the Xano CLI (`@xano/cli`), a command-line interface for Xano's Metadata API. Built with oclif (TypeScript CLI framework).

## Key Directories

```
src/
  commands/           # CLI commands (oclif structure)
  lib/
    api-client.ts     # XanoApiClient - shared API client
    types.ts          # TypeScript interfaces
  base-command.ts     # Base command class with shared flags

test/
  integration/        # Real API integration tests
    real-api.test.ts  # Main test file with report generation

metadata-api-docs/    # OpenAPI specs for all Metadata API endpoints
xanoscript-docs/      # XanoScript documentation and examples
```

## Implementation Patterns

### Adding a New Command

1. **Add types** to `src/lib/types.ts`
2. **Add API methods** to `src/lib/api-client.ts`
3. **Create command** at `src/commands/{resource}/{action}/index.ts`
4. **Update topics** in `package.json` under `oclif.topics`
5. **Add tests** to `test/integration/`

### Command Structure

```typescript
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class ResourceAction extends BaseCommand {
  static override description = 'Description here'
  static override examples = ['$ xano resource action ...']
  static override args = { ... }
  static override flags = {
    ...BaseCommand.baseFlags,
    // additional flags
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ResourceAction)
    const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
    const workspaceId = client.getWorkspaceId(flags.workspace)
    // implementation
  }
}
```

### Output Formats

Commands support multiple output formats:
- `json` - Full JSON response
- `summary` - Human-readable summary (default)
- `xs` - XanoScript format (where applicable)

### Test Pattern

Tests follow create -> list -> get -> edit -> delete flow:
- All tests use `runTrackedCommand()` for report generation
- Tests output to `test-report.md`
- Use unique suffixes to avoid conflicts: `` `_test_${Date.now()}` ``

## XanoScript Documentation

Reference `xanoscript-docs/xanoscript-ai-documentation-main/` for:

| Resource | Files |
|----------|-------|
| API | `api_query_guideline.md`, `api_query_examples.md` |
| Table | `table_guideline.md`, `table_examples.md` |
| Function | `function_guideline.md`, `function_examples.md`, `functions.md` |
| Task | `task_guideline.md`, `task_examples.md` |
| Agent | `agent_guideline.md`, `agent_examples.md` |
| MCP Server | `mcp_server_guideline.md`, `mcp_server_examples.md` |
| Tool | `tool_guideline.md`, `tool_examples.md` |
| Testing | `unit_testing_guideline.md` |

## API Documentation

OpenAPI specs in `metadata-api-docs/`:
- `table.json` - Tables, triggers, content, schema, indexes
- `api-group-api.json` - API groups and endpoints
- `function.json` - Functions
- `task.json` - Scheduled tasks
- `middleware.json` - Middleware
- `agent.json` - Agents and triggers
- `mcp-server.json` - MCP servers and triggers
- `realtime.json` - Realtime channels and triggers
- `workspace.json` - Workspace, tools, workflow tests
- And more...

## Commands

```bash
npm run build      # Build TypeScript
npm test           # Run integration tests (generates test-report.md)
npm run dev        # Run dev CLI
```

## Current Implementation Status

See `IMPLEMENTATION_PLAN.md` for full status and roadmap.

### Implemented
- profile, api, apigroup, table (full CRUD)
- function (missing delete)
- workspace (list only)
- static_host (partial)

### In Progress
- Phase 1: Complete existing resources
- Phase 2-6: See implementation plan

## Testing Configuration

- Profile: `mcp-server` (or set via `XANO_TEST_PROFILE`)
- Workspace: `40`
- Tests create resources, validate, then clean up
