# Xano CLI

Command-line interface for the Xano Metadata API.

[![Version](https://img.shields.io/npm/v/@xano/cli.svg)](https://npmjs.org/package/@xano/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@xano/cli.svg)](https://npmjs.org/package/@xano/cli)

## Installation

```bash
npm install -g @xano/cli
```

## Quick Start

1. **Create a profile with the wizard** (interactive setup):
   ```bash
   xano profile wizard
   ```
   The wizard will prompt you to:
   - Enter your access token
   - Select an instance
   - Select a workspace (saved to profile - no `-w` flags needed later!)
   - Optionally select a branch and project

2. **Start using the CLI** (workspace is already set):
   ```bash
   xano table list              # List tables in your workspace
   xano function list           # List functions
   xano api list <group_id>     # List APIs in a group
   ```

3. **View documentation**:
   ```bash
   xano docs list
   xano docs getting-started
   ```

## Commands

### Profile Management

Profiles store your Xano credentials and default workspace settings in `~/.xano/credentials.yaml`.

```bash
# Create a profile interactively (recommended)
xano profile wizard

# Create a profile manually
xano profile create myprofile -i https://instance.xano.com -t <access_token>

# List profiles
xano profile list
xano profile list --details

# Get/set default profile
xano profile get-default
xano profile set-default myprofile

# View current profile and user info
xano profile me

# Edit a profile
xano profile edit -w <workspace_id>     # Set/change default workspace
xano profile edit -b <branch_id>        # Set default branch
xano profile edit -j <project_id>       # Set default project

# Delete a profile
xano profile delete myprofile

# Get access token
xano profile token

# Set project scope for profile
xano profile project myprofile --project <project_id>
```

### Workspace Context

After running the wizard, your workspace is saved to your profile. You can:

```bash
# List available workspaces (to find IDs)
xano workspace list

# Change your default workspace
xano profile edit -w <workspace_id>

# Override workspace for a single command
xano table list -w <different_workspace_id>
```

**Tip:** Add `-w <id>` to any command to override the profile's workspace for that command.

### Workspaces

```bash
# List all workspaces
xano workspace list
xano workspace list -o json

# Get workspace details
xano workspace get
xano workspace context

# Export/Import workspace
xano workspace export -f workspace.zip
xano workspace import -f workspace.zip

# Export/Import schema only
xano workspace export-schema -f schema.zip
xano workspace import-schema -f schema.zip

# Get OpenAPI spec
xano workspace openapi
```

### Database Tables

Manage database tables in your workspace.

```bash
# List tables
xano table list
xano table list -o json

# Get a specific table
xano table get 123
xano table get 123 -o xs  # Output as XanoScript

# Create a table
xano table create --name users --description "User accounts"
xano table create -f table.xs   # From XanoScript file

# Edit a table
xano table edit 123             # Opens in $EDITOR
xano table edit 123 -f table.xs # Update from file
xano table edit 123 --name new_name

# Delete a table
xano table delete 123
xano table delete 123 --force   # Skip confirmation
```

#### Table Content (Data Operations)

```bash
# List records
xano table content list 123
xano table content list 123 --page 1 --per_page 50

# Get a single record
xano table content get 123 456  # Table 123, record ID 456

# Search records
xano table content search 123 --query "name=John"

# Create a record
xano table content create 123 --data '{"name":"John","email":"john@example.com"}'

# Edit a record
xano table content edit 123 456 --data '{"name":"Jane"}'

# Delete a record
xano table content delete 123 456

# Truncate table (delete all records)
xano table content truncate 123 --force

# Bulk operations
xano table content bulk-create 123 -f records.json
xano table content bulk-patch 123 -f updates.json
xano table content bulk-delete 123 --ids 1,2,3
```

#### Table Schema

```bash
# Get table schema
xano table schema get 123
xano table schema get 123 -o json

# Replace entire schema
xano table schema replace 123 -f schema.json

# Column operations
xano table schema column get 123 name
xano table schema column add 123 --name email --type text
xano table schema column rename 123 --from old_name --to new_name
xano table schema column delete 123 email
```

#### Table Indexes

```bash
# List indexes
xano table index list 123

# Create indexes
xano table index create btree 123 --column email
xano table index create unique 123 --column email
xano table index create search 123 --column description --language english
xano table index create spatial 123 --column location
xano table index create vector 123 --column embedding --dimensions 1536

# Replace all indexes
xano table index replace 123 -f indexes.json

# Delete an index
xano table index delete 123 idx_email
```

#### Table Triggers

```bash
# List triggers
xano table trigger list 123

# Get a trigger
xano table trigger get 123 456
xano table trigger get 123 456 -o xs

# Create a trigger
xano table trigger create 123 --name on_insert --event insert
xano table trigger create 123 -f trigger.xs

# Edit a trigger
xano table trigger edit 123 456
xano table trigger edit 123 456 -f trigger.xs

# Delete a trigger
xano table trigger delete 123 456

# Manage trigger security
xano table trigger security 123 456
```

### API Groups

Manage API groups (collections of API endpoints).

```bash
# List API groups
xano apigroup list
xano apigroup list -o json

# Get a specific API group
xano apigroup get 5
xano apigroup get 5 -o xs  # Output as XanoScript

# Create an API group
xano apigroup create --name user --description "User APIs" --swagger
xano apigroup create -f apigroup.xs

# Edit an API group
xano apigroup edit 5
xano apigroup edit 5 --name new_name --no-swagger

# Delete an API group
xano apigroup delete 5
xano apigroup delete 5 --force
```

### API Endpoints

Manage individual API endpoints within API groups.

```bash
# List APIs in a group
xano api list 5              # List APIs in group 5
xano api list 5 -o json --include_draft

# Get a specific API
xano api get 5 123           # Get API 123 in group 5
xano api get 5 123 -o xs     # Output as XanoScript

# Create an API endpoint
xano api create 5 --name user --verb GET --description "Get user"
xano api create 5 -f endpoint.xs
cat endpoint.xs | xano api create 5 --stdin

# Edit an API endpoint
xano api edit 5 123          # Opens in $EDITOR
xano api edit 5 123 -f new.xs
xano api edit 5 123 --publish

# Delete an API endpoint
xano api delete 5 123
xano api delete 5 123 --force
```

### Functions

```bash
# List functions
xano function list
xano function list -o json

# Get a specific function
xano function get 145
xano function get 145 -o xs  # Output as XanoScript

# Create a function from XanoScript
xano function create -f function.xs
cat function.xs | xano function create --stdin

# Edit a function
xano function edit 145           # Opens in $EDITOR
xano function edit 145 -f new.xs # Update from file
xano function edit 145 --publish # Publish after editing

# Delete a function
xano function delete 145
xano function delete 145 --force

# Manage function security
xano function security 145
```

### Middleware

```bash
# List middleware
xano middleware list

# Get a middleware
xano middleware get 123
xano middleware get 123 -o xs

# Create middleware
xano middleware create --name auth_check
xano middleware create -f middleware.xs

# Edit middleware
xano middleware edit 123
xano middleware edit 123 -f middleware.xs

# Delete middleware
xano middleware delete 123
xano middleware delete 123 --force

# Manage middleware security
xano middleware security 123
```

### Tasks (Scheduled Jobs)

```bash
# List tasks
xano task list

# Get a task
xano task get 123
xano task get 123 -o xs

# Create a task
xano task create --name daily_cleanup --schedule "0 0 * * *"
xano task create -f task.xs

# Edit a task
xano task edit 123
xano task edit 123 -f task.xs

# Delete a task
xano task delete 123
xano task delete 123 --force

# Manage task security
xano task security 123
```

### Addons

```bash
# List addons
xano addon list

# Get an addon
xano addon get 123
xano addon get 123 -o xs

# Create an addon
xano addon create --name my_addon
xano addon create -f addon.xs

# Edit an addon
xano addon edit 123
xano addon edit 123 -f addon.xs

# Delete an addon
xano addon delete 123
xano addon delete 123 --force

# Manage addon security
xano addon security 123
```

### Datasources

```bash
# List datasources
xano datasource list

# Create a datasource
xano datasource create --name external_db --type postgres
xano datasource create -f datasource.json

# Edit a datasource
xano datasource edit 123

# Delete a datasource
xano datasource delete 123
xano datasource delete 123 --force
```

### Triggers (Workspace-Level)

```bash
# List triggers
xano trigger list

# Get a trigger
xano trigger get 123
xano trigger get 123 -o xs

# Create a trigger
xano trigger create --name on_startup --event startup
xano trigger create -f trigger.xs

# Edit a trigger
xano trigger edit 123
xano trigger edit 123 -f trigger.xs

# Delete a trigger
xano trigger delete 123
xano trigger delete 123 --force

# Manage trigger security
xano trigger security 123
```

### Agents

```bash
# List agents
xano agent list

# Get an agent
xano agent get 123
xano agent get 123 -o xs

# Create an agent
xano agent create --name my_agent
xano agent create -f agent.xs

# Edit an agent
xano agent edit 123
xano agent edit 123 -f agent.xs

# Delete an agent
xano agent delete 123
xano agent delete 123 --force
```

#### Agent Triggers

```bash
# List agent triggers
xano agent trigger list 123

# Get an agent trigger
xano agent trigger get 123 456

# Create an agent trigger
xano agent trigger create 123 --name on_message
xano agent trigger create 123 -f trigger.xs

# Edit an agent trigger
xano agent trigger edit 123 456

# Delete an agent trigger
xano agent trigger delete 123 456

# Manage agent trigger security
xano agent trigger security 123 456
```

### MCP Servers

```bash
# List MCP servers
xano mcp-server list

# Get an MCP server
xano mcp-server get 123
xano mcp-server get 123 -o xs

# Create an MCP server
xano mcp-server create --name my_mcp
xano mcp-server create -f mcp.xs

# Edit an MCP server
xano mcp-server edit 123
xano mcp-server edit 123 -f mcp.xs

# Delete an MCP server
xano mcp-server delete 123
xano mcp-server delete 123 --force
```

#### MCP Server Triggers

```bash
# List MCP server triggers
xano mcp-server trigger list 123

# Get an MCP server trigger
xano mcp-server trigger get 123 456

# Create an MCP server trigger
xano mcp-server trigger create 123 --name on_connect
xano mcp-server trigger create 123 -f trigger.xs

# Edit an MCP server trigger
xano mcp-server trigger edit 123 456

# Delete an MCP server trigger
xano mcp-server trigger delete 123 456

# Manage MCP server trigger security
xano mcp-server trigger security 123 456
```

### Realtime

```bash
# Get realtime configuration
xano realtime get

# Edit realtime configuration
xano realtime edit
```

#### Realtime Channels

```bash
# List channels
xano realtime channel list

# Get a channel
xano realtime channel get 123
xano realtime channel get 123 -o xs

# Create a channel
xano realtime channel create --name notifications
xano realtime channel create -f channel.xs

# Edit a channel
xano realtime channel edit 123

# Delete a channel
xano realtime channel delete 123
```

#### Realtime Channel Triggers

```bash
# List channel triggers
xano realtime channel trigger list 123

# Get a channel trigger
xano realtime channel trigger get 123 456

# Create a channel trigger
xano realtime channel trigger create 123 --name on_subscribe

# Edit a channel trigger
xano realtime channel trigger edit 123 456

# Delete a channel trigger
xano realtime channel trigger delete 123 456

# Manage channel trigger security
xano realtime channel trigger security 123 456
```

### Tools

```bash
# List tools
xano tool list

# Get a tool
xano tool get 123
xano tool get 123 -o xs

# Create a tool
xano tool create --name my_tool
xano tool create -f tool.xs

# Edit a tool
xano tool edit 123
xano tool edit 123 -f tool.xs

# Delete a tool
xano tool delete 123
xano tool delete 123 --force

# Manage tool security
xano tool security 123
```

### Workflow Tests

```bash
# List workflow tests
xano workflow-test list

# Get a workflow test
xano workflow-test get 123
xano workflow-test get 123 -o xs

# Create a workflow test
xano workflow-test create --name api_test
xano workflow-test create -f test.xs

# Edit a workflow test
xano workflow-test edit 123
xano workflow-test edit 123 -f test.xs

# Delete a workflow test
xano workflow-test delete 123

# Manage workflow test security
xano workflow-test security 123
```

### Ephemeral Jobs & Services

Run XanoScript code without creating permanent resources.

```bash
# Run a job (executes and returns result)
xano run job -f script.xs
xano run job -f script.xs -a args.json  # With input arguments
xano run job -f script.xs --edit        # Edit in $EDITOR first

# Run a service (starts API endpoints)
xano run service -f service.xs
```

### Branches

```bash
# List branches
xano branch list

# Delete a branch
xano branch delete my_branch
xano branch delete my_branch --force
```

### Files

```bash
# List files
xano file list
xano file list --path /uploads

# Upload a file
xano file upload -f ./image.png
xano file upload -f ./document.pdf --path /documents

# Delete a file
xano file delete --path /uploads/image.png

# Bulk delete files
xano file bulk-delete --paths "/uploads/a.png,/uploads/b.png"
```

### Audit Logs

```bash
# List audit logs for a workspace
xano audit-log list
xano audit-log list --page 1 --per_page 50

# Search audit logs
xano audit-log search --action create --resource table

# List global audit logs (all workspaces)
xano audit-log global-list

# Search global audit logs
xano audit-log global-search --action delete
```

### Execution History

View execution history for various resource types.

```bash
# Request history
xano history request list
xano history request search --status error

# Function history
xano history function list
xano history function search --function_id 123

# Middleware history
xano history middleware list
xano history middleware search --status success

# Task history
xano history task list
xano history task search --task_id 123

# Trigger history
xano history trigger list
xano history trigger search --trigger_id 123

# Tool history
xano history tool list
xano history tool search --tool_id 123
```

### Static Hosts

```bash
# List static hosts
xano static_host list

# Create a build
xano static_host build create default -f ./build.zip -n "v1.0.0"

# List builds
xano static_host build list default

# Get build details
xano static_host build get default 52

# Delete a build
xano static_host build delete default 52

# Get build environment
xano static_host build env default
```

### Documentation

Access built-in documentation and guides.

```bash
# List available documentation topics
xano docs list

# View a specific topic
xano docs getting-started
xano docs table
xano docs api
xano docs function
```

## Global Options

All commands support these options:

| Flag | Description |
|------|-------------|
| `-p, --profile` | Profile to use (or set `XANO_PROFILE` env var) |
| `-w, --workspace` | Workspace ID (optional if set in profile, overrides profile default) |
| `-o, --output` | Output format: `summary` (default), `json`, or `xs` (XanoScript) |

## Output Formats

Most commands support multiple output formats:

- **summary** (default): Human-readable summary
- **json**: Full JSON response
- **xs**: XanoScript format (where applicable)

```bash
xano table get 123 -o json
xano function get 145 -o xs
```

## Configuration

Profiles are stored in `~/.xano/credentials.yaml`.

## Help

```bash
xano --help
xano <command> --help
xano docs <topic>
```
