import type {DocTopic} from '../index.js'

export const triggerDocs: DocTopic = {
  name: 'trigger',
  title: 'Trigger Documentation',
  description: 'Event-driven code execution based on workspace or table events',
  relatedTopics: ['table', 'function', 'task'],
  content: `
# Trigger Documentation

## Overview

Triggers in Xano execute code automatically in response to events. Unlike tasks
which run on schedules, triggers respond to specific actions like:
- Database record changes (insert, update, delete)
- Workspace events
- Custom events

## Trigger Types

### Workspace Triggers
Run in response to workspace-level events.

### Table Triggers
Run when table data changes:
- **Before Insert**: Validate or transform data before saving
- **After Insert**: Update related records, send notifications
- **Before Update**: Validate changes
- **After Update**: Sync data, log changes
- **Before Delete**: Check constraints
- **After Delete**: Cleanup related data

## CLI Commands

### List Triggers
\`\`\`bash
# List workspace triggers
xano trigger list -w <workspace_id>

# List table triggers
xano table trigger list -w <workspace_id>

# JSON output
xano trigger list -w <workspace_id> -o json
\`\`\`

### Get Trigger Details
\`\`\`bash
# Workspace trigger
xano trigger get <trigger_id> -w <workspace_id>

# Table trigger
xano table trigger get <trigger_id> -w <workspace_id>

# Get as XanoScript
xano trigger get <trigger_id> -w <workspace_id> -o xs
\`\`\`

### Create Trigger
\`\`\`bash
# Create workspace trigger
xano trigger create -w <workspace_id> -f trigger.xs

# Create with name
xano trigger create -w <workspace_id> --name my_trigger --description "My trigger"

# Create table trigger
xano table trigger create -w <workspace_id> -f table_trigger.xs
\`\`\`

### Edit Trigger
\`\`\`bash
# Edit workspace trigger
xano trigger edit <trigger_id> -w <workspace_id> -f updated.xs

# Edit table trigger
xano table trigger edit <trigger_id> -w <workspace_id> -f updated.xs
\`\`\`

### Delete Trigger
\`\`\`bash
# Delete workspace trigger
xano trigger delete <trigger_id> -w <workspace_id> --force

# Delete table trigger
xano table trigger delete <trigger_id> -w <workspace_id> --force
\`\`\`

### Update Security
\`\`\`bash
xano trigger security <trigger_id> -w <workspace_id> --guid <guid>
\`\`\`

## XanoScript Syntax

### Table Trigger - After Insert
\`\`\`xanoscript
table_trigger "log_new_user" {
  table = "user"
  event = "after_insert"
  description = "Log when new user is created"

  stack {
    db.query audit_log {
      add = {
        action: "user_created",
        record_id: $trigger.record.id,
        created_at: $now
      }
    }
  }
}
\`\`\`

### Table Trigger - Before Update
\`\`\`xanoscript
table_trigger "validate_email" {
  table = "user"
  event = "before_update"
  description = "Validate email format before update"

  stack {
    precondition {
      condition = regex.match {
        pattern = "^[^@]+@[^@]+\\.[^@]+$"
        input = $trigger.record.email
      }
      error = {
        code: 400,
        message: "Invalid email format"
      }
    }
  }
}
\`\`\`

### Workspace Trigger
\`\`\`xanoscript
trigger "workspace_init" {
  event = "workspace_start"
  description = "Initialize workspace on start"

  stack {
    # Initialization logic
    var $config {
      value = {
        initialized: true,
        timestamp: $now
      }
    }
  }
}
\`\`\`

## Trigger Context Variables

| Variable | Description |
|----------|-------------|
| \`$trigger.record\` | The record being affected |
| \`$trigger.old_record\` | Previous record state (for updates) |
| \`$trigger.event\` | The event type |
| \`$trigger.table\` | The table name |

## Viewing Trigger History
\`\`\`bash
# View trigger execution history
xano history trigger list -w <workspace_id>

# Search by trigger ID
xano history trigger search -w <workspace_id> --trigger-id <id>
\`\`\`

## Best Practices

1. **Keep triggers lightweight**: Heavy processing should be async
2. **Handle errors**: Don't let trigger failures break operations
3. **Avoid infinite loops**: Be careful with triggers that modify the same table
4. **Use appropriate events**: Choose before vs after based on need
5. **Log important actions**: Track what triggers do for debugging

## Related Documentation

- \`xano docs table\` - Table operations that fire triggers
- \`xano docs function\` - Reusable logic in triggers
- \`xano docs history\` - View trigger execution history
`.trim(),
}
