# Xano CLI

Command-line interface for the Xano Metadata API.

[![Version](https://img.shields.io/npm/v/@xano/cli.svg)](https://npmjs.org/package/@xano/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@xano/cli.svg)](https://npmjs.org/package/@xano/cli)

## Installation

```bash
npm install -g @xano/cli
```

## Quick Start

1. Authenticate with Xano:
   ```bash
   xano auth
   ```

2. List your workspaces:
   ```bash
   xano workspace list
   ```

3. Pull a workspace to local files:
   ```bash
   xano workspace pull ./my-workspace
   ```

## Commands

### Authentication

```bash
# Interactive browser-based authentication
xano auth
```

### Profiles

Profiles store your Xano credentials and default workspace settings.

```bash
# Create a profile interactively
xano profile wizard

# Create a profile manually
xano profile create myprofile -i https://instance.xano.com -t <access_token>

# List profiles
xano profile list

# Get/set default profile
xano profile get_default
xano profile set_default myprofile

# Edit a profile
xano profile edit myprofile -w 123

# Get current user info
xano profile me

# Print access token (useful for piping)
xano profile token

# Delete a profile
xano profile delete myprofile
```

### Workspaces

```bash
# List all workspaces
xano workspace list

# Get workspace details
xano workspace get <workspace_id>

# Create a workspace
xano workspace create my-workspace
xano workspace create my-workspace -d "My application workspace"

# Edit a workspace
xano workspace edit <workspace_id> --name "new-name" -d "Updated description"

# Delete a workspace (confirmation required)
xano workspace delete <workspace_id>
xano workspace delete <workspace_id> --force

# Pull workspace to local files
xano workspace pull ./my-workspace
xano workspace pull ./my-workspace -b dev              # Specific branch
xano workspace pull ./my-workspace --env --records      # Include env vars and table records
xano workspace pull ./my-workspace --draft              # Include draft changes

# Push local files to workspace
xano workspace push ./my-workspace
xano workspace push ./my-workspace -b dev
xano workspace push ./my-workspace --no-records         # Schema only
xano workspace push ./my-workspace --no-env             # Skip env vars
xano workspace push ./my-workspace --truncate           # Truncate tables before import
```

### Branches

```bash
# List branches
xano branch list

# Get branch details
xano branch get <branch_id>

# Create a branch
xano branch create --label dev
xano branch create -l feature-auth -s dev -d "Auth feature"

# Edit a branch
xano branch edit <branch_id> --label "new-label"

# Set live branch
xano branch set_live <branch_id>

# Delete a branch
xano branch delete <branch_id>
```

### Functions

```bash
# List functions
xano function list

# Get a function
xano function get <function_id>
xano function get <function_id> -o xs                   # Output as XanoScript

# Create a function from XanoScript
xano function create -f function.xs
cat function.xs | xano function create --stdin

# Edit a function
xano function edit <function_id>                        # Opens in $EDITOR
xano function edit <function_id> -f new.xs              # Update from file
xano function edit <function_id> --publish              # Publish after editing
```

### Releases

```bash
# List releases
xano release list

# Get release details
xano release get <release_id>

# Create a release
xano release create --name "v1.0" --branch main
xano release create --name "v1.1-hotfix" --branch main --hotfix

# Edit a release
xano release edit <release_id> --name "v1.0.1" -d "Updated description"

# Export (download) a release
xano release export <release_id>
xano release export <release_id> --output ./backups/my-release.tar.gz

# Import a release file
xano release import --file ./my-release.tar.gz

# Delete a release (confirmation required)
xano release delete <release_id>
xano release delete <release_id> --force
```

### Platforms

```bash
# List platforms
xano platform list

# Get platform details
xano platform get <platform_id>
```

### Testing

#### Unit Tests

```bash
# List unit tests
xano unit_test list

# Run a single unit test
xano unit_test run <unit_test_id>

# Run all unit tests
xano unit_test run_all
```

#### Workflow Tests

```bash
# List workflow tests
xano workflow_test list

# Get workflow test details
xano workflow_test get <workflow_test_id>

# Run a single workflow test
xano workflow_test run <workflow_test_id>

# Run all workflow tests
xano workflow_test run_all

# Delete a workflow test
xano workflow_test delete <workflow_test_id>
```

### Tenants

Manage tenants, their environment variables, backups, deployments, and clusters.

#### CRUD

```bash
# List tenants
xano tenant list

# Get tenant details
xano tenant get <tenant_name>

# Create a tenant
xano tenant create "My Tenant"
xano tenant create "My Tenant" -d "Description" --cluster_id 1 --platform_id 5

# Edit a tenant
xano tenant edit <tenant_name> --display "New Name" -d "New description"

# Delete a tenant (confirmation required)
xano tenant delete <tenant_name>
xano tenant delete <tenant_name> --force
```

#### Deployments

```bash
# Deploy a platform version
xano tenant deploy_platform <tenant_name> --platform_id 5

# Deploy a release
xano tenant deploy_release <tenant_name> --release_id 10
```

#### Tenant License

```bash
# Get tenant license
xano tenant license get <tenant_name>

# Set tenant license
xano tenant license set <tenant_name> --license tier2
```

#### Tenant Environment Variables

```bash
# List env var keys
xano tenant env list <tenant_name>

# Get a single env var
xano tenant env get <tenant_name> --name DATABASE_URL

# Set an env var
xano tenant env set <tenant_name> --name DATABASE_URL --value postgres://...

# Delete an env var
xano tenant env delete <tenant_name> --name DATABASE_URL

# Export all env vars to YAML
xano tenant env get_all <tenant_name>
xano tenant env get_all <tenant_name> --file ./env.yaml

# Import all env vars from YAML (replaces existing)
xano tenant env set_all <tenant_name>
xano tenant env set_all <tenant_name> --file ./env.yaml --clean
```

#### Backups

```bash
# List backups
xano tenant backup list <tenant_name>

# Create a backup
xano tenant backup create <tenant_name>

# Export (download) a backup
xano tenant backup export <tenant_name> --backup_id 10
xano tenant backup export <tenant_name> --backup_id 10 --output ./backup.tar.gz

# Import a backup file
xano tenant backup import <tenant_name> --file ./backup.tar.gz

# Restore from a backup
xano tenant backup restore <tenant_name> --backup_id 10

# Delete a backup (confirmation required)
xano tenant backup delete <tenant_name> --backup_id 10
xano tenant backup delete <tenant_name> --backup_id 10 --force
```

#### Clusters

```bash
# List clusters
xano tenant cluster list

# Get cluster details
xano tenant cluster get <cluster_id>

# Create a cluster
xano tenant cluster create --name "us-east-1" --credentials_file ./kubeconfig.yaml
xano tenant cluster create --name "eu-west-1" --type run -d "EU run cluster"

# Edit a cluster
xano tenant cluster edit <cluster_id> --name "us-east-1" -d "Updated" --domain "us-east.xano.io"

# Delete a cluster (confirmation required)
xano tenant cluster delete <cluster_id>
xano tenant cluster delete <cluster_id> --force

# Get cluster kubeconfig
xano tenant cluster license get <cluster_id>

# Set cluster kubeconfig
xano tenant cluster license set <cluster_id>
xano tenant cluster license set <cluster_id> --file ./kubeconfig.yaml
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
```

## Global Options

All commands support these options:

| Flag | Description |
|------|-------------|
| `-p, --profile` | Profile to use (or set `XANO_PROFILE` env var) |
| `-w, --workspace` | Workspace ID (overrides profile default) |
| `-o, --output` | Output format: `summary` (default) or `json` |
| `-v, --verbose` | Show detailed request/response information (or set `XANO_VERBOSE` env var) |

### Verbose Mode

Use `-v` or `--verbose` to see detailed HTTP request and response information, useful for debugging:

```bash
xano workspace list -v
```

This will show:
- Request method, URL, and content type
- Request body (truncated if large)
- Response status, timing, and body

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
default: default
```

## Help

```bash
xano --help
xano <command> --help
```
