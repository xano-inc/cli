import type {DocTopic} from '../index.js'

export const workspaceDocs: DocTopic = {
  name: 'workspace',
  title: 'Workspace Documentation',
  description: 'Manage Xano workspaces, export/import configurations, and view context',
  relatedTopics: ['profile', 'branch', 'table', 'api'],
  content: `
# Workspace Documentation

## Overview

A workspace in Xano is a complete environment containing your database tables,
API endpoints, functions, and other resources. The CLI provides tools for
listing workspaces, exporting/importing configurations, and accessing workspace
context.

Use cases include:
- Listing available workspaces
- Exporting workspace configurations for backup
- Importing configurations to restore or clone workspaces
- Getting OpenAPI specifications
- Accessing full workspace context for development

## Key Concepts

### Workspace Components
- **Tables**: Database schema and data
- **API Groups**: Collections of API endpoints
- **Functions**: Reusable logic blocks
- **Tasks**: Scheduled background jobs
- **Triggers**: Event-driven logic
- **Agents**: AI-powered automation

### Export/Import
- Full workspace export includes all configuration
- Schema-only export for database structure
- Import can replace or merge workspace content

## CLI Commands

### List Workspaces
\`\`\`bash
# List all workspaces
xano workspace list

# JSON output
xano workspace list -o json

# Use specific profile
xano workspace list --profile staging
\`\`\`

**Example Output:**
\`\`\`
Available workspaces:
  - my-app (ID: 40)
  - staging-env (ID: 41)
  - test-workspace (ID: 42)
\`\`\`

### Get Workspace Details
\`\`\`bash
# Get workspace info
xano workspace get <workspace_id>

# JSON output
xano workspace get 40 -o json
\`\`\`

### Get Workspace Context
Get comprehensive context about all workspace resources:

\`\`\`bash
# Print context to terminal
xano workspace context 40

# Save to file for reference
xano workspace context 40 > context.txt
\`\`\`

Context includes:
- All tables with schemas
- API groups and endpoints
- Functions
- Tasks
- Triggers
- And more

### Export Workspace
\`\`\`bash
# Full workspace export
xano workspace export -w 40 -o workspace_backup.zip

# Export to specific directory
xano workspace export -w 40 -o ./backups/
\`\`\`

### Export Schema Only
\`\`\`bash
# Export just database schema
xano workspace export-schema -w 40 -o schema.json
\`\`\`

### Import Workspace
\`\`\`bash
# Import from archive
xano workspace import -w 40 -f workspace_backup.zip

# Import with options
xano workspace import -w 40 -f backup.zip --replace
\`\`\`

### Import Schema
\`\`\`bash
# Import schema into new branch
xano workspace import-schema -w 40 -f schema.json --branch new-branch

# Import and deploy
xano workspace import-schema -w 40 -f schema.json --branch new-branch --deploy
\`\`\`

### Get OpenAPI Specification
\`\`\`bash
# Get OpenAPI/Swagger spec
xano workspace openapi -w 40

# Save to file
xano workspace openapi -w 40 > openapi.json
\`\`\`

## Common Workflows

### Backup Workspace
\`\`\`bash
# Create timestamped backup
xano workspace export -w 40 -o "backup_$(date +%Y%m%d).zip"
\`\`\`

### Clone Workspace Configuration
\`\`\`bash
# Export from source
xano workspace export -w 40 -o config.zip

# Import to target
xano workspace import -w 41 -f config.zip
\`\`\`

### Generate API Documentation
\`\`\`bash
# Get OpenAPI spec for documentation tools
xano workspace openapi -w 40 > api-spec.json

# Use with Swagger UI, Redoc, etc.
\`\`\`

### Database Schema Migration
\`\`\`bash
# Export schema from production
xano workspace export-schema -w 40 -o prod-schema.json

# Import to staging as new branch
xano workspace import-schema -w 41 -f prod-schema.json --branch from-prod
\`\`\`

## Workspace Context for AI/LLM

The \`workspace context\` command is particularly useful when working with AI
assistants. It provides a comprehensive view of your workspace that can be
used as context for generating code, understanding the structure, or
troubleshooting.

\`\`\`bash
# Get context and pipe to clipboard (macOS)
xano workspace context 40 | pbcopy

# Save for reference
xano workspace context 40 > my-workspace-context.txt
\`\`\`

## Best Practices

1. **Regular backups**: Schedule periodic workspace exports
2. **Version control schemas**: Export schemas and track changes
3. **Test imports**: Always test imports in a non-production workspace first
4. **Document workspaces**: Keep notes on workspace purposes
5. **Use branches**: Make changes in branches before going live

## Related Documentation

- \`xano docs profile\` - Authentication and profiles
- \`xano docs branch\` - Branch management
- \`xano docs table\` - Table management
- \`xano docs api\` - API endpoint management
`.trim(),
}
