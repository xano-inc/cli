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
   xano workspace pull
   ```

## Commands

### Authentication

```bash
# Interactive browser-based authentication
xano auth
xano auth --origin https://custom.xano.com
xano auth --insecure                         # Skip TLS verification (self-signed certs)
```

### Profiles

Profiles store your Xano credentials and default workspace settings.

```bash
# Create a profile interactively
xano profile wizard

# Create a profile manually
xano profile create myprofile -i https://instance.xano.com -t <access_token>
xano profile create myprofile -i https://self-signed.example.com -t <token> --insecure

# List profiles
xano profile list
xano profile list --details                  # Show masked tokens and settings

# Get/set default profile
xano profile get
xano profile set myprofile

# Edit a profile
xano profile edit myprofile -w 123
xano profile edit myprofile -b dev           # Set branch
xano profile edit myprofile --insecure       # Enable insecure mode (self-signed certs)
xano profile edit myprofile --remove-insecure # Disable insecure mode
xano profile edit myprofile --remove-branch  # Remove branch from profile
xano profile edit myprofile --remove-workspace # Remove workspace from profile

# Get current user info
xano profile me

# Print access token (useful for piping)
xano profile token

# Print workspace ID (useful for piping)
xano profile workspace

# Interactively change the workspace on a profile
xano profile workspace set
xano profile workspace set -p production

# Delete a profile
xano profile delete myprofile
xano profile delete myprofile --force
```

### Workspaces

```bash
# List all workspaces
xano workspace list

# Get workspace details
xano workspace get -w <workspace_id>

# Create a workspace
xano workspace create my-workspace
xano workspace create my-workspace -d "My application workspace"

# Edit a workspace
xano workspace edit -w <workspace_id> --name "new-name" -d "Updated description"
xano workspace edit -w <workspace_id> --swagger          # Enable swagger docs
xano workspace edit -w <workspace_id> --no-swagger       # Disable swagger docs
xano workspace edit -w <workspace_id> --require-token    # Require token for docs

# Delete a workspace (confirmation required)
xano workspace delete -w <workspace_id>
xano workspace delete -w <workspace_id> --force

# Pull workspace to local files (defaults to current directory)
xano workspace pull
xano workspace pull -d ./my-workspace                    # Specify output directory
xano workspace pull -b dev                               # Specific branch
xano workspace pull --env --records                      # Include env vars and table records
xano workspace pull --draft                              # Include draft changes

# Push local files to workspace (defaults to current directory, only changed files)
xano workspace push
xano workspace push -d ./my-workspace                    # Push from a specific directory
xano workspace push -b dev
xano workspace push --sync                               # Full push — send all files, not just changed ones
xano workspace push --sync --delete                      # Full push + delete remote objects not included
xano workspace push --dry-run                            # Preview changes without pushing
xano workspace push --records                            # Include table records
xano workspace push --env                                # Include environment variables
xano workspace push --truncate                           # Truncate tables before import
xano workspace push --no-transaction                     # Disable database transaction wrapping
xano workspace push --no-guids                           # Skip writing GUIDs back to local files
xano workspace push --force                              # Skip preview and confirmation (for CI/CD)
xano workspace push -i "function/*"                      # Push only matching files
xano workspace push -e "table/*"                         # Push all files except tables
xano workspace push -i "function/*" -e "**/test*"        # Include functions, exclude tests

# Pull from a git repository to local files (defaults to current directory)
xano workspace git pull -r https://github.com/owner/repo
xano workspace git pull -d ./output -r https://github.com/owner/repo
xano workspace git pull -r https://github.com/owner/repo -b main
xano workspace git pull -r https://github.com/owner/repo/tree/main/path/to/dir
xano workspace git pull -r https://github.com/owner/repo/blob/main/file.xs
xano workspace git pull -r git@github.com:owner/repo.git
xano workspace git pull -r https://gitlab.com/owner/repo/-/tree/master/path
xano workspace git pull -r https://github.com/owner/private-repo -t ghp_xxx
xano workspace git pull -r https://github.com/owner/repo --path subdir
```

### Branches

All branch commands use **branch labels** (e.g., `v1`, `dev`), not IDs.

The `v1` branch is the default branch and always exists. It cannot be created, edited, or deleted.

```bash
# List branches (backup branches are hidden by default)
xano branch list
xano branch list -w <workspace_id>
xano branch list --backups        # include backup branches

# Get branch details
xano branch get <branch_label>

# Create a branch
xano branch create dev
xano branch create feature-auth -s dev -d "Auth feature"
xano branch create staging --color "#ebc346"

# Edit a branch
xano branch edit <branch_label> --label "new-label"
xano branch edit <branch_label> --color "#ff0000"

# Set live branch
xano branch set_live <branch_label>
xano branch set_live <branch_label> --force

# Delete a branch
xano branch delete <branch_label>
xano branch delete <branch_label> --force
```

### Functions

```bash
# List functions
xano function list
xano function list --include_draft --include_xanoscript
xano function list --sort created_at --order desc --page 1 --per_page 50

# Get a function
xano function get <function_id>
xano function get <function_id> -o xs                   # Output as XanoScript
xano function get <function_id> -o json
xano function get <function_id> --include_draft         # Include draft version

# Create a function from XanoScript
xano function create -f function.xs
xano function create -f function.xs --edit              # Open in $EDITOR before creating
cat function.xs | xano function create --stdin

# Edit a function
xano function edit <function_id>                        # Opens in $EDITOR
xano function edit <function_id> -f new.xs              # Update from file
xano function edit <function_id> -f new.xs --edit       # Open in $EDITOR before updating
cat function.xs | xano function edit <function_id> --stdin  # Update from stdin
xano function edit <function_id> --no-publish           # Edit without publishing
```

### Releases

All release commands use **release names** (e.g., `v1.0`), not IDs.

```bash
# List releases
xano release list

# Get release details
xano release get <release_name>

# Create a release
xano release create "v1.0" --branch main
xano release create "v1.1-hotfix" --branch main --hotfix
xano release create "v1.0" --branch main --table-ids 1,2,3

# Edit a release
xano release edit <release_name> --name "v1.0-final" -d "Updated description"

# Export (download) a release
xano release export <release_name>
xano release export <release_name> --output ./backups/my-release.tar.gz

# Import a release file
xano release import --file ./my-release.tar.gz

# Delete a release (confirmation required)
xano release delete <release_name>
xano release delete <release_name> --force

# Pull release to local files (defaults to current directory)
xano release pull -r v1.0
xano release pull -d ./my-release -r v1.0
xano release pull -r v1.0 --env --records

# Push local files as a new release (defaults to current directory)
xano release push -n "v2.0"
xano release push -d ./my-release -n "v2.0"
xano release push -n "v2.0" --hotfix --description "Critical fix"
xano release push -n "v2.0" --no-records --no-env

# Deploy a release to its workspace as a new branch (confirmation required)
xano release deploy "v1.0"
xano release deploy "v1.0" --force
xano release deploy "v1.0" --branch "restore-v1" --no-set_live
xano release deploy "v1.0" -w 40 -o json --force
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
xano unit_test list --branch dev --obj-type function

# Run a single unit test
xano unit_test run <unit_test_id>

# Run all unit tests
xano unit_test run_all
xano unit_test run_all --branch dev --obj-type function
```

#### Workflow Tests

```bash
# List workflow tests
xano workflow_test list
xano workflow_test list --branch dev

# Get workflow test details
xano workflow_test get <workflow_test_id>
xano workflow_test get <workflow_test_id> -o xs          # Output as XanoScript
xano workflow_test get <workflow_test_id> --include-draft

# Run a single workflow test
xano workflow_test run <workflow_test_id>

# Run all workflow tests
xano workflow_test run_all
xano workflow_test run_all --branch dev

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
xano tenant create "My Tenant" -d "Description" --type tier2 --cluster_id 1 --platform_id 5
xano tenant create "My Tenant" --type tier2 --cluster_id 1 --license ./license.yaml

# Edit a tenant
xano tenant edit <tenant_name> --display "New Name" -d "New description"

# Delete a tenant (confirmation required)
xano tenant delete <tenant_name>
xano tenant delete <tenant_name> --force
```

#### Impersonate

```bash
# Open a tenant in the browser
xano tenant impersonate <tenant_name>

# Print the URL without opening the browser
xano tenant impersonate <tenant_name> --url-only

# Output credentials as JSON
xano tenant impersonate <tenant_name> -o json
```

#### Pull / Push

```bash
# Pull tenant to local files (defaults to current directory)
xano tenant pull -t <tenant_name>
xano tenant pull -d ./my-tenant -t <tenant_name>
xano tenant pull -t <tenant_name> --env --records
xano tenant pull -t <tenant_name> --draft

# Push local files to tenant (defaults to current directory)
xano tenant push -t <tenant_name>
xano tenant push -d ./my-tenant -t <tenant_name>
xano tenant push -t <tenant_name> --records                    # Include table records
xano tenant push -t <tenant_name> --env                        # Include environment variables
xano tenant push -t <tenant_name> --truncate
xano tenant push -t <tenant_name> --no-transaction             # Disable transaction wrapping
```

#### Deployments

```bash
# Deploy a platform version
xano tenant deploy_platform <tenant_name> --platform_id 5

# Deploy a release by name
xano tenant deploy_release <tenant_name> --release v1.0

# Deploy with a license override file (deploy_platform only)
xano tenant deploy_platform <tenant_name> --platform_id 5 --license ./license.yaml
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

### Sandbox

Manage your sandbox tenant. Each user has a single sandbox tenant that is auto-provisioned on first use.

```bash
# Get your sandbox tenant (creates if needed)
xano sandbox get
xano sandbox get -o json

# Pull sandbox to local files (defaults to current directory)
xano sandbox pull
xano sandbox pull -d ./my-sandbox
xano sandbox pull --env --records

# Push local files to sandbox (defaults to current directory, only changed files)
xano sandbox push
xano sandbox push -d ./my-workspace                      # Push from a specific directory
xano sandbox push --sync                                 # Full push — send all files
xano sandbox push --sync --delete                        # Full push + delete remote objects not included
xano sandbox push --dry-run                              # Preview changes without pushing
xano sandbox push --records --env                        # Include records and environment variables
xano sandbox push --truncate                             # Truncate tables before import
xano sandbox push --no-guids                             # Skip writing GUIDs back to local files
xano sandbox push --force                                # Skip preview and confirmation
xano sandbox push -i "function/*"                        # Push only matching files
xano sandbox push -e "table/*"                           # Push all files except tables
xano sandbox push --review                               # Push and open sandbox review in the browser

# Review (open in browser)
xano sandbox review

# Impersonate (open in browser)
xano sandbox impersonate

# Reset all workspace data
xano sandbox reset
xano sandbox reset --force
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
| `-c, --config` | Path to credentials file (or set `XANO_CONFIG` env var). Default: `~/.xano/credentials.yaml` |
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

Profiles are stored in `~/.xano/credentials.yaml` by default. You can use a different credentials file with:

```bash
# Via flag
xano profile list -c /path/to/other-credentials.yaml

# Via environment variable
export XANO_CONFIG=/path/to/other-credentials.yaml
xano workspace list
```

### Credentials File Format

```yaml
profiles:
  default:
    account_origin: https://app.xano.com
    instance_origin: https://instance.xano.com
    access_token: <token>
    workspace: <workspace_id>
    branch: <branch_id>
  self-hosted:
    instance_origin: https://self-signed.example.com
    access_token: <token>
    insecure: true
default: default
```

### Self-Signed Certificates

For environments using self-signed TLS certificates, use the `--insecure` (`-k`) flag to skip certificate verification:

```bash
# During authentication
xano auth --insecure

# When creating a profile
xano profile create myprofile -i https://self-signed.example.com -t <token> -k

# Add to an existing profile
xano profile edit myprofile --insecure
```

When a profile has `insecure: true`, all commands using that profile will automatically skip TLS certificate verification. A warning is displayed when insecure mode is active.

### Update

```bash
# Update the CLI to the latest version
xano update

# Check for updates without installing
xano update --check

# Update to the latest beta version
xano update --beta

# Check for beta updates without installing
xano update --beta --check
```

## Scripts

### Bump Version

```bash
./scripts/bump-version.sh           # patch: 0.0.38 -> 0.0.39
./scripts/bump-version.sh minor     # minor: 0.0.38 -> 0.1.0
./scripts/bump-version.sh major     # major: 0.0.38 -> 1.0.0
```

## Help

```bash
xano --help
xano <command> --help
```
