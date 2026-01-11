import type {DocTopic} from '../index.js'

export const auditLogDocs: DocTopic = {
  name: 'audit-log',
  title: 'Audit Log Documentation',
  description: 'Track changes and actions in your workspace for compliance and debugging',
  relatedTopics: ['history', 'workspace'],
  content: `
# Audit Log Documentation

## Overview

Audit logs in Xano track all changes made to your workspace configuration,
including table modifications, API changes, function updates, and more.
They provide a complete history of who changed what and when.

Use cases include:
- Compliance and regulatory requirements
- Debugging and troubleshooting
- Change tracking and accountability
- Security monitoring

## Key Concepts

### Audit Log Events
- **CREATE**: New resource created
- **UPDATE**: Existing resource modified
- **DELETE**: Resource deleted
- **SECURITY**: Security settings changed

### Audit Scope
- **Workspace Audit Logs**: Changes within a specific workspace
- **Global Audit Logs**: Changes across all workspaces in your account

## CLI Commands

### List Workspace Audit Logs
\`\`\`bash
# List audit logs
xano audit-log list -w <workspace_id>

# With pagination
xano audit-log list -w <workspace_id> --page 1 --per-page 50

# JSON output
xano audit-log list -w <workspace_id> -o json
\`\`\`

**Example Output:**
\`\`\`
Audit Logs:
  - [2024-01-15 10:30:00] CREATE table "users" (ID: 123)
  - [2024-01-15 09:15:00] UPDATE api "/login" (ID: 456)
  - [2024-01-14 16:45:00] DELETE function "old_helper" (ID: 789)
\`\`\`

### Search Workspace Audit Logs
\`\`\`bash
# Search by action type
xano audit-log search -w <workspace_id> --action CREATE

# Search by resource type
xano audit-log search -w <workspace_id> --resource table

# Search by date range
xano audit-log search -w <workspace_id> --start-date 2024-01-01 --end-date 2024-01-31

# Combined search
xano audit-log search -w <workspace_id> --action DELETE --resource api

# JSON output
xano audit-log search -w <workspace_id> --action UPDATE -o json
\`\`\`

### List Global Audit Logs
\`\`\`bash
# List global audit logs (across all workspaces)
xano audit-log global-list

# With pagination
xano audit-log global-list --page 1 --per-page 100

# JSON output
xano audit-log global-list -o json
\`\`\`

### Search Global Audit Logs
\`\`\`bash
# Search globally by action
xano audit-log global-search --action DELETE

# Search by workspace
xano audit-log global-search --workspace-id 40

# JSON output
xano audit-log global-search --action CREATE -o json
\`\`\`

## Audit Log Entry Fields

| Field | Description |
|-------|-------------|
| \`id\` | Unique audit log entry ID |
| \`timestamp\` | When the action occurred |
| \`action\` | Type of action (CREATE, UPDATE, DELETE) |
| \`resource_type\` | Type of resource affected |
| \`resource_id\` | ID of the affected resource |
| \`resource_name\` | Name of the affected resource |
| \`user_id\` | ID of the user who made the change |
| \`changes\` | Details of what was changed |

## Common Use Cases

### Tracking Table Schema Changes
\`\`\`bash
xano audit-log search -w <workspace_id> --resource table --action UPDATE
\`\`\`

### Finding Deleted Resources
\`\`\`bash
xano audit-log search -w <workspace_id> --action DELETE
\`\`\`

### Monitoring Recent Activity
\`\`\`bash
xano audit-log list -w <workspace_id> --per-page 10
\`\`\`

## Best Practices

1. **Regular review**: Periodically review audit logs for unexpected changes
2. **Export for compliance**: Export logs regularly for compliance records
3. **Set up alerts**: Monitor for security-related changes
4. **Use search filters**: Narrow down logs for specific investigations

## Retention

Audit log retention depends on your Xano plan. Check your plan details
for specific retention periods.

## Related Documentation

- \`xano docs history\` - API request and execution history
- \`xano docs workspace\` - Workspace management
`.trim(),
}
