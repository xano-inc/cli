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
   xano profile:wizard
   ```

2. List your workspaces:
   ```bash
   xano workspace:list
   ```

3. Execute XanoScript code:
   ```bash
   xano run exec script.xs
   ```

## Commands

### Profile Management

Profiles store your Xano credentials and default workspace/project settings.

```bash
# Create a profile interactively (auto-fetches run projects)
xano profile:wizard

# Create a profile manually
xano profile:create myprofile -i https://instance.xano.com -t <access_token>

# Create a profile with workspace and project
xano profile:create myprofile -i https://instance.xano.com -t <access_token> -w my-workspace -j my-project

# List profiles
xano profile:list
xano profile:list --details

# Set default profile
xano profile:set-default myprofile

# Edit a profile
xano profile:edit myprofile -w 123              # Set default workspace
xano profile:edit myprofile -j my-project       # Set default project

# Delete a profile
xano profile:delete myprofile
```

The `profile:wizard` command automatically fetches your run projects and sets the first one as the default for `xano run` commands.

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

### Xano Run

Execute XanoScript code and manage projects, sessions, environment variables, and secrets.

#### Executing Code

```bash
# Execute XanoScript (job or service)
xano run exec script.xs                          # Single file
xano run exec ./my-workspace                     # Directory (multidoc from .xs files)
xano run exec https://example.com/script.xs     # From URL
xano run exec script.xs -a args.json             # With input arguments (file)
xano run exec script.xs -a https://ex.com/args.json  # With input arguments (URL)
xano run exec script.xs --edit                   # Edit in $EDITOR first
xano run exec script.xs --env API_KEY=secret     # With env overrides
cat script.xs | xano run exec --stdin            # From stdin

# Get document info (type, inputs, env vars)
xano run info -f script.xs
```

When a directory is provided, all `.xs` files are collected recursively and combined into a multidoc (joined with `---` separators), similar to `xano workspace push`.

#### Projects

```bash
# List projects
xano run projects list

# Create a project
xano run projects create -n "My Project"
xano run projects create -n "My Project" -d "Description"

# Update a project
xano run projects update <project-id> -n "New Name"
xano run projects update <project-id> -d "New description"

# Delete a project
xano run projects delete <project-id>
xano run projects delete <project-id> --force    # Skip confirmation
```

#### Sessions

```bash
# List sessions
xano run sessions list

# Get session details
xano run sessions get <session-id>

# Start/stop a session
xano run sessions start <session-id>
xano run sessions stop <session-id>

# Delete a session
xano run sessions delete <session-id>
xano run sessions delete <session-id> --force    # Skip confirmation

# Get sink data for a completed session
xano run sink get <session-id>
```

#### Environment Variables

```bash
# List environment variable keys
xano run env list

# Set an environment variable
xano run env set API_KEY my-secret-key

# Get an environment variable value
xano run env get API_KEY

# Delete an environment variable
xano run env delete API_KEY
xano run env delete API_KEY --force              # Skip confirmation
```

#### Secrets

```bash
# List secrets
xano run secrets list

# Set a secret
xano run secrets set docker-registry -t dockerconfigjson -v '{"auths":{...}}' -r ghcr.io
xano run secrets set service-key -t service-account-token -v 'token-value'

# Get a secret value
xano run secrets get docker-registry

# Delete a secret
xano run secrets delete docker-registry
xano run secrets delete docker-registry --force  # Skip confirmation
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

Profiles are stored in `~/.xano/credentials.yaml`:

```yaml
profiles:
  default:
    account_origin: https://app.xano.com
    instance_origin: https://instance.xano.com
    access_token: <token>
    workspace: <workspace_id>
    branch: <branch_id>
    project: <project_id>
default: default
```

## Help

```bash
xano --help
xano <command> --help
```
