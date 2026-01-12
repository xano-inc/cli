---
name: xano-cli
description: Use this skill when working with the Xano CLI to manage workspaces, tables, APIs, functions, and other Xano resources from the command line.
---

# Xano CLI Usage Guide

The Xano CLI (`@xano/cli`) provides command-line access to Xano's Metadata API for managing workspaces, tables, APIs, functions, tasks, and more.

## Core Concepts

### Profiles & Workspace Setup

Profiles store credentials and default settings. The wizard is the easiest way to get started.

```bash
# Interactive setup (recommended) - selects instance, workspace, branch
xano profile wizard

# View current profile settings
xano profile me

# List available workspaces
xano workspace list
```

**After running the wizard, your workspace is saved to the profile.** You won't need `-w` flags for subsequent commands.

### Manual Profile Management

```bash
# Create profile manually
xano profile create myprofile -i https://instance.xano.com -t <token>

# Set default workspace (use ID from 'workspace list')
xano profile edit -w <workspace_id>

# Set default profile
xano profile set-default myprofile

# Change workspace later
xano profile edit -w <new_workspace_id>
```

### Workspace Context

Most commands require a workspace. Resolution order:
1. `-w` flag if provided
2. Profile's saved workspace
3. Error with instructions

```bash
# Uses profile's saved workspace
xano table list

# Override with specific workspace
xano table list -w <workspace_id>
```

### Output Formats

Commands support three output formats via `-o`:
- `summary` - Human-readable (default)
- `json` - Full JSON response
- `xs` - XanoScript format (for scriptable resources)

---

## Command Reference by Resource

> **Note:** Examples below omit `-w` assuming workspace is set in profile. Add `-w <id>` if needed.

### Tables

| Action | Command |
|--------|---------|
| List tables | `xano table list` |
| Get table | `xano table get <table_id>` |
| Create table | `xano table create --name users` |
| Create from XS | `xano table create -f table.xs` |
| Edit table | `xano table edit <table_id>` |
| Delete table | `xano table delete <table_id> --force` |

#### Table Content (Data)

| Action | Command |
|--------|---------|
| List records | `xano table content list <table_id>` |
| Get record | `xano table content get <table_id> <record_id>` |
| Create record | `xano table content create <table_id> --data '{"name":"John"}'` |
| Edit record | `xano table content edit <table_id> <record_id> --data '{"name":"Jane"}'` |
| Delete record | `xano table content delete <table_id> <record_id>` |
| Search | `xano table content search <table_id> --query "name=John"` |
| Truncate | `xano table content truncate <table_id> --force` |
| Bulk create | `xano table content bulk-create <table_id> -f records.json` |

#### Table Schema

| Action | Command |
|--------|---------|
| Get schema | `xano table schema get <table_id>` |
| Replace schema | `xano table schema replace <table_id> -f schema.json` |
| Get column | `xano table schema column get <table_id> <column_name>` |
| Add column | `xano table schema column add <table_id> --name email --type text` |
| Delete column | `xano table schema column delete <table_id> <column_name>` |

#### Table Indexes

| Action | Command |
|--------|---------|
| List indexes | `xano table index list <table_id>` |
| Create btree | `xano table index create btree <table_id> --column email` |
| Create unique | `xano table index create unique <table_id> --column email` |
| Create search | `xano table index create search <table_id> --column desc --language english` |
| Delete index | `xano table index delete <table_id> <index_name>` |

#### Table Triggers

| Action | Command |
|--------|---------|
| List triggers | `xano table trigger list <table_id>` |
| Get trigger | `xano table trigger get <table_id> <trigger_id>` |
| Create trigger | `xano table trigger create <table_id> --name on_insert --event insert` |
| Delete trigger | `xano table trigger delete <table_id> <trigger_id>` |

---

### API Groups & Endpoints

#### API Groups

| Action | Command |
|--------|---------|
| List groups | `xano apigroup list` |
| Get group | `xano apigroup get <group_id>` |
| Create group | `xano apigroup create --name user --swagger` |
| Edit group | `xano apigroup edit <group_id> --name new_name` |
| Delete group | `xano apigroup delete <group_id> --force` |

#### API Endpoints

| Action | Command |
|--------|---------|
| List APIs | `xano api list <group_id>` |
| Get API | `xano api get <group_id> <api_id>` |
| Get as XS | `xano api get <group_id> <api_id> -o xs` |
| Create API | `xano api create <group_id> --name user --verb GET` |
| Create from XS | `xano api create <group_id> -f endpoint.xs` |
| Edit API | `xano api edit <group_id> <api_id>` |
| Publish | `xano api edit <group_id> <api_id> --publish` |
| Delete API | `xano api delete <group_id> <api_id> --force` |

---

### Functions

| Action | Command |
|--------|---------|
| List functions | `xano function list` |
| Get function | `xano function get <function_id>` |
| Get as XS | `xano function get <function_id> -o xs` |
| Create from XS | `xano function create -f function.xs` |
| Edit function | `xano function edit <function_id>` |
| Publish | `xano function edit <function_id> --publish` |
| Delete function | `xano function delete <function_id> --force` |
| Security settings | `xano function security <function_id>` |

---

### Middleware

| Action | Command |
|--------|---------|
| List | `xano middleware list` |
| Get | `xano middleware get <middleware_id>` |
| Create | `xano middleware create --name auth_check` |
| Create from XS | `xano middleware create -f middleware.xs` |
| Edit | `xano middleware edit <middleware_id>` |
| Delete | `xano middleware delete <middleware_id> --force` |

---

### Tasks (Scheduled Jobs)

| Action | Command |
|--------|---------|
| List | `xano task list` |
| Get | `xano task get <task_id>` |
| Get as XS | `xano task get <task_id> -o xs` |
| Create | `xano task create --name cleanup --schedule "0 0 * * *"` |
| Create from XS | `xano task create -f task.xs` |
| Edit | `xano task edit <task_id>` |
| Delete | `xano task delete <task_id> --force` |

---

### Addons

| Action | Command |
|--------|---------|
| List | `xano addon list` |
| Get | `xano addon get <addon_id>` |
| Create | `xano addon create --name my_addon` |
| Edit | `xano addon edit <addon_id>` |
| Delete | `xano addon delete <addon_id> --force` |

---

### Workspace Operations

| Action | Command |
|--------|---------|
| List workspaces | `xano workspace list` |
| Get workspace | `xano workspace get` |
| Get context | `xano workspace context` |
| Export workspace | `xano workspace export -f workspace.zip` |
| Import workspace | `xano workspace import -f workspace.zip` |
| Export schema | `xano workspace export-schema -f schema.zip` |
| Import schema | `xano workspace import-schema -f schema.zip` |
| Get OpenAPI | `xano workspace openapi` |

---

### Ephemeral Execution

Run XanoScript without creating permanent resources.

```bash
# Run a job (executes once, returns result)
xano run job -f script.xs
xano run job -f script.xs -a args.json  # With arguments

# Run a service (starts temporary API endpoints)
xano run service -f service.xs
```

---

## Common Workflows

### Create a Table with API CRUD

```bash
# 1. Create the table
xano table create --name products --description "Product catalog"

# 2. Get the new table ID from output, then add columns
xano table schema column add <table_id> --name name --type text
xano table schema column add <table_id> --name price --type decimal
xano table schema column add <table_id> --name category --type text

# 3. Add indexes
xano table index create btree <table_id> --column category
xano table index create unique <table_id> --column name

# 4. Create API group
xano apigroup create --name products --swagger

# 5. Create endpoints from XanoScript files
xano api create <group_id> -f apis/products/list.xs
xano api create <group_id> -f apis/products/get.xs
xano api create <group_id> -f apis/products/create.xs
```

### Export and Edit a Resource

```bash
# Export as XanoScript
xano function get <function_id> -o xs > my_function.xs

# Edit the file
$EDITOR my_function.xs

# Update the function
xano function edit <function_id> -f my_function.xs --publish
```

### Bulk Data Operations

```bash
# Create records from JSON file
xano table content bulk-create <table_id> -f records.json

# Patch multiple records
xano table content bulk-patch <table_id> -f updates.json

# Delete multiple records
xano table content bulk-delete <table_id> --ids 1,2,3,4,5
```

---

## Tips

1. **Run wizard first** - `xano profile wizard` sets up everything interactively
2. **Use `-o json` for scripting** - Parse JSON output with `jq` for automation
3. **Use `-o xs` for version control** - Export resources as XanoScript for git
4. **Use `--force` to skip confirmations** - Useful for CI/CD pipelines
5. **Pipe XanoScript** - `cat file.xs | xano api create <group_id> --stdin`

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `XANO_PROFILE` | Default profile to use |
| `XANO_TEST_PROFILE` | Profile for running tests |
| `EDITOR` | Editor for `edit` commands |

---

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Profile not found" | Missing profile | Run `xano profile wizard` |
| "Workspace ID required" | No workspace in profile | Run `xano profile edit -w <id>` |
| "Unauthorized" | Invalid/expired token | Refresh token with `xano profile token` |
| "Not found" | Invalid resource ID | Check ID with `list` command |
