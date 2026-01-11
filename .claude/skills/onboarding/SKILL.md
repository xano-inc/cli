# Onboarding Skill

Use this skill FIRST before starting any development work. This is a mandatory gate.

## When to Use

- At the START of any new conversation about building features
- Before using `xano_execute` or `task_manage` tools
- When setting up a new workspace

## Pre-Development Gate

**ALWAYS run this check before development:**

```bash
npm run onboard:check
```

### If Output Shows "MCP System not found"

Present this to the user:

> "The MCP System is not installed in this workspace. This system provides:
> - **Task Management** - Track tasks, comments, and validations via MCP
> - **Operation Tracing** - Debug API operations with full request/response logs
> - **Dashboard** - Web UI for viewing tasks and traces
>
> Would you like me to install it now?"

**Wait for user confirmation before proceeding.**

### To Install

```bash
npm run onboard:install
```

This creates:
- 7 database tables (`mcp_project`, `mcp_task`, `mcp_trace`, etc.)
- 1 API group (`mcp_system`)
- 24 API endpoints with full XanoScript logic
- All foreign key relationships

## What Gets Installed

### Tables (7 total)

| Table | Purpose |
|-------|---------|
| `mcp_project` | Project grouping for tasks |
| `mcp_task` | Tasks with 3-level hierarchy (epic/task/subtask) |
| `mcp_task_comment` | Comments and activity on tasks |
| `mcp_task_dependency` | Task blocking relationships |
| `mcp_task_validation` | Test results and checklist items |
| `mcp_trace` | MCP operation sessions |
| `mcp_trace_span` | Individual API calls within traces |

### API Endpoints (24 total)

**Health & Dashboard:**
- `GET /health` - System health check
- `GET /dashboard` - Summary statistics

**Tasks:**
- `GET /tasks` - List tasks with filtering
- `POST /tasks` - Create task
- `GET /tasks/{id}` - Get task details
- `PATCH /tasks/{id}` - Update task
- `DELETE /tasks/{id}` - Delete task
- `POST /tasks/{id}/start` - Start task
- `POST /tasks/{id}/complete` - Complete task

**Comments:**
- `GET /tasks/{id}/comments` - List comments
- `POST /tasks/{id}/comments` - Add comment

**Validations:**
- `GET /tasks/{id}/validations` - List validations
- `POST /tasks/{id}/validations` - Add validation
- `PATCH /tasks/{id}/validations/{vid}` - Update validation
- `POST /tasks/{id}/validations/run` - Bulk add test results

**Traces:**
- `GET /traces` - List traces
- `POST /traces` - Create trace
- `GET /traces/{id}` - Get trace with spans
- `PATCH /traces/{id}` - Update trace
- `POST /spans` - Create span
- `PATCH /spans/{id}` - Update span

**Projects:**
- `GET /projects` - List projects
- `POST /projects` - Create project

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run onboard:check` | Check if MCP System is installed |
| `npm run onboard:install` | Install or repair the MCP System |
| `npm run onboard:update-scripts` | Update XanoScript for existing endpoints |

## After Installation

Once installed, use these tools for development:

### `task_manage` - Task Management (Use INSTEAD of TodoWrite)

```
action="create_task", title="Build feature X", priority="high"
action="start_task", task_id=1
action="add_comment", task_id=1, content="Working on..."
action="add_validation", task_id=1, validation_type="test", name="API returns 200"
action="complete_task", task_id=1
action="dashboard"  # View stats
```

### `xano_execute` - Natural Language Xano API

```
"Create a table called 'pokemon' with name, type, and hp columns"
"List all tables"
"Add an API endpoint GET /pokemon"
```

## Troubleshooting

### "MCP System not found"
Run `npm run onboard:install`

### "Health check failed"
1. Verify API URL is correct
2. Run `npm run onboard:update-scripts`

### Endpoints return empty responses
Run `npm run onboard:update-scripts` to deploy XanoScript logic

## Critical Rule

**DO NOT use local `TodoWrite` for task tracking when MCP System is available.**

Use `task_manage` instead - it provides:
- Persistent task storage in Xano
- Comments and validations linked to tasks
- Dashboard visibility
- Resource linking to tables/APIs
