# Xano CLI

Command-line interface for the Xano Metadata API.

[![Version](https://img.shields.io/npm/v/@xano/cli.svg)](https://npmjs.org/package/@xano/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@xano/cli.svg)](https://npmjs.org/package/@xano/cli)

## Installation

```bash
npm install -g @xano/cli
```

## Quick Start

1. Create a profile with the wizard:
   ```bash
   xano profile wizard
   ```

2. List your workspaces:
   ```bash
   xano workspace list
   ```

3. List database tables:
   ```bash
   xano table list -w <workspace_id>
   ```

4. List API groups:
   ```bash
   xano apigroup list -w <workspace_id>
   ```

## Commands

### Profile Management

Profiles store your Xano credentials and default workspace settings.

```bash
# Create a profile interactively
xano profile:wizard

# Create a profile manually
xano profile:create myprofile -i https://instance.xano.com -t <access_token>

# List profiles
xano profile:list
xano profile:list --details

# Set default profile
xano profile:set-default myprofile

# Edit a profile
xano profile:edit myprofile -w 123  # Set default workspace

# Delete a profile
xano profile:delete myprofile
```

### Workspaces

```bash
# List all workspaces
xano workspace:list
xano workspace:list -o json
```

### Functions

```bash
# List functions in a workspace
xano function:list -w 40
xano function:list -o json

# Get a specific function
xano function:get 145
xano function:get 145 -o xs  # Output as XanoScript

# Create a function from XanoScript
xano function:create -f function.xs
cat function.xs | xano function:create --stdin

# Edit a function
xano function:edit 145           # Opens in $EDITOR
xano function:edit 145 -f new.xs # Update from file
xano function:edit 145 --publish # Publish after editing
```

### Ephemeral Jobs & Services

Run XanoScript code without creating permanent resources.

```bash
# Run a job (executes and returns result)
xano ephemeral:run:job -f script.xs
xano ephemeral:run:job -f script.xs -a args.json  # With input arguments
xano ephemeral:run:job -f script.xs --edit        # Edit in $EDITOR first

# Run a service (starts API endpoints)
xano ephemeral:run:service -f service.xs
```

### Database Tables

Manage database tables in your workspace.

```bash
# List tables in a workspace
xano table list -w 40
xano table list -o json

# Get a specific table
xano table get 123 -w 40
xano table get 123 -o xs  # Output as XanoScript

# Create a table
xano table create -w 40 --name users --description "User accounts"
xano table create -w 40 -f table.xs   # From XanoScript file
xano table create -w 40 -f table.json # From JSON file

# Edit a table
xano table edit 123 -w 40             # Opens in $EDITOR
xano table edit 123 -w 40 -f table.xs # Update from file
xano table edit 123 -w 40 --name new_name

# Delete a table
xano table delete 123 -w 40
xano table delete 123 -w 40 --force   # Skip confirmation
```

### API Groups

Manage API groups (collections of API endpoints).

```bash
# List API groups
xano apigroup list -w 40
xano apigroup list -o json

# Get a specific API group
xano apigroup get 5 -w 40
xano apigroup get 5 -o xs  # Output as XanoScript

# Create an API group
xano apigroup create -w 40 --name user --description "User APIs" --swagger
xano apigroup create -w 40 -f apigroup.xs

# Edit an API group
xano apigroup edit 5 -w 40
xano apigroup edit 5 -w 40 --name new_name --no-swagger

# Delete an API group
xano apigroup delete 5 -w 40
xano apigroup delete 5 -w 40 --force
```

### API Endpoints

Manage individual API endpoints within API groups.

```bash
# List APIs in a group
xano api list 5 -w 40              # List APIs in group 5
xano api list 5 -o json --include_draft

# Get a specific API
xano api get 5 123 -w 40           # Get API 123 in group 5
xano api get 5 123 -o xs           # Output as XanoScript

# Create an API endpoint
xano api create 5 -w 40 --name user --verb GET --description "Get user"
xano api create 5 -w 40 -f endpoint.xs
cat endpoint.xs | xano api create 5 -w 40 --stdin

# Edit an API endpoint
xano api edit 5 123 -w 40          # Opens in $EDITOR
xano api edit 5 123 -w 40 -f new.xs
xano api edit 5 123 -w 40 --publish

# Delete an API endpoint
xano api delete 5 123 -w 40
xano api delete 5 123 -w 40 --force
```

### Static Hosts

```bash
# List static hosts
xano static_host:list

# Create a build
xano static_host:build:create default -f ./build.zip -n "v1.0.0"

# List builds
xano static_host:build:list default

# Get build details
xano static_host:build:get default 52
```

## Global Options

All commands support these options:

| Flag | Description |
|------|-------------|
| `-p, --profile` | Profile to use (or set `XANO_PROFILE` env var) |
| `-w, --workspace` | Workspace ID (overrides profile default) |
| `-o, --output` | Output format: `summary` (default) or `json` |

## Configuration

Profiles are stored in `~/.xano/credentials.yaml`.

## Help

```bash
xano --help
xano <command> --help
```
