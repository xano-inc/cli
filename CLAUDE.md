# Xano Development Expert Guide

You are an expert Xano backend developer. You build backends using the Xano CLI and XanoScript.

## Skills

| Skill | When to Use |
|-------|-------------|
| `/xano-cli` | CLI commands for managing workspaces, tables, APIs, functions, tasks |
| `/xanoscript-authoring` | Writing XanoScript code - syntax, patterns, and reference file navigation |
| `/cli-improvements` | Document bugs, unexpected behavior, or improvement opportunities |

---

## CLI Improvement Tracking

This CLI is actively being developed. When you encounter bugs, unexpected results, or opportunities for improvement:

1. **Document it** in `.claude/cli-issues.md`
2. **Use the skill** `/cli-improvements` for the proper format
3. **Categories:** `[BUG]`, `[UX]`, `[FEATURE]`, `[DOCS]`, `[PERF]`

This helps us track and prioritize fixes for the CLI.

---

## Quick Start

```bash
# Setup profile (interactive - selects instance, workspace, branch)
xano profile wizard

# After wizard, workspace is saved - no -w flag needed!
xano table list                    # List tables in your workspace
xano api get 5 123 -o xs          # Export endpoint as XanoScript
xano function create -f func.xs   # Create from XanoScript file
xano run job -f script.xs         # Test script without deploying
```

### Profile & Workspace Setup

The wizard saves your workspace to `~/.xano/credentials.yaml`. After setup, you don't need `-w` flags.

```bash
# Interactive setup (recommended)
xano profile wizard

# Manual workspace change
xano profile edit -w <workspace_id>

# View current profile
xano profile me

# List workspaces to find IDs
xano workspace list
```

**Note:** Examples in docs may show `-w 40` - this is just a placeholder. Your workspace ID will be different and is saved in your profile.

---

## Reference Documentation

All XanoScript reference files are in `.claude/reference/xanoscript-ai-documentation/`

### Finding What You Need

| Looking For | Read This File |
|-------------|----------------|
| **Function syntax** (var, db.query, array.filter, etc.) | `functions.md` |
| **Database operations** (query, add, edit, patch, delete) | `db_query_guideline.md` |
| **Query where clause operators** (==, contains, overlaps) | `query_filter.md` |
| **Expression filters/pipes** (\|trim, \|to_lower, \|first) | `expression_guideline.md` |
| **Input types and validation** | `input_guideline.md` |
| **API endpoint structure** | `api_query_guideline.md` + `api_query_examples.md` |
| **Function structure** | `function_guideline.md` + `function_examples.md` |
| **Table schema** | `table_guideline.md` + `table_examples.md` |
| **Scheduled tasks** | `task_guideline.md` + `task_examples.md` |
| **AI Agents** | `agent_guideline.md` + `agent_examples.md` |
| **MCP Servers** | `mcp_server_guideline.md` + `mcp_server_examples.md` |
| **AI Tools** | `tool_guideline.md` + `tool_examples.md` |
| **Unit testing** | `unit_testing_guideline.md` |
| **Advanced patterns** | `tips_and_tricks.md` |

### Search Strategy

1. **Function syntax** → Search `functions.md` for `# <function_name>`
2. **Real examples** → Check the `*_examples.md` files
3. **Structure/format** → Read the `*_guideline.md` files

---

## XanoScript Resources

| Resource | File Location | Purpose |
|----------|---------------|---------|
| `table` | `tables/*.xs` | Database schema |
| `query` | `apis/<group>/*.xs` | API endpoints |
| `function` | `functions/*.xs` | Reusable logic |
| `task` | `tasks/*.xs` | Scheduled jobs |
| `addon` | `addons/*.xs` | Optimized sub-queries for db.query |
| `middleware` | `middleware/*.xs` | Request interceptors |
| `agent` | `agents/*.xs` | AI agents |
| `mcp_server` | `mcp_servers/*.xs` | MCP server definitions |
| `tool` | `tools/*.xs` | AI tools |

---

## Project Structure

```
src/
  commands/           # CLI commands (oclif)
  lib/
    api-client.ts     # XanoApiClient
    types.ts          # TypeScript types

.claude/
  reference/xanoscript-ai-documentation/   # XanoScript docs
  skills/                                   # Claude Code skills

metadata-api-docs/    # OpenAPI specs for Metadata API
```

---

## Development Commands

```bash
npm run build      # Build TypeScript
npm test           # Run integration tests
npm run dev        # Run dev CLI
```
