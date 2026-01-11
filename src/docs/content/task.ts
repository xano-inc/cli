import type {DocTopic} from '../index.js'

export const taskDocs: DocTopic = {
  name: 'task',
  title: 'Scheduled Task Documentation',
  description: 'Background jobs that run on a schedule (cron)',
  relatedTopics: ['function', 'trigger'],
  content: `
# Scheduled Task Documentation

## Overview

Tasks in Xano are scheduled background jobs that run automatically based on a
cron schedule. They're ideal for:
- Periodic data cleanup or maintenance
- Report generation
- Sending scheduled notifications
- Data synchronization with external services
- Batch processing

## Key Concepts

### Cron Schedules
Tasks use cron expressions to define when they run:

| Expression | Description |
|------------|-------------|
| \`* * * * *\` | Every minute |
| \`0 * * * *\` | Every hour |
| \`0 0 * * *\` | Daily at midnight |
| \`0 0 * * 0\` | Weekly on Sunday |
| \`0 0 1 * *\` | Monthly on the 1st |

Format: \`minute hour day-of-month month day-of-week\`

### Task Execution
- Tasks run in the background
- Each execution is logged in task history
- Failed tasks can be configured to retry

## CLI Commands

### List Tasks
\`\`\`bash
# List all tasks
xano task list -w <workspace_id>

# JSON output
xano task list -w <workspace_id> -o json
\`\`\`

### Get Task Details
\`\`\`bash
# Get task info
xano task get <task_id> -w <workspace_id>

# Get as XanoScript
xano task get <task_id> -w <workspace_id> -o xs
\`\`\`

### Create Task
\`\`\`bash
# Create with schedule
xano task create -w <workspace_id> --name daily_cleanup --schedule "0 0 * * *"

# Create from XanoScript file
xano task create -w <workspace_id> -f task.xs

# Create with JSON output
xano task create -w <workspace_id> -f task.xs -o json
\`\`\`

### Edit Task
\`\`\`bash
xano task edit <task_id> -w <workspace_id> -f updated.xs
\`\`\`

### Delete Task
\`\`\`bash
# With confirmation
xano task delete <task_id> -w <workspace_id>

# Force delete
xano task delete <task_id> -w <workspace_id> --force
\`\`\`

### Update Security
\`\`\`bash
xano task security <task_id> -w <workspace_id> --guid <guid>
\`\`\`

## XanoScript Syntax

### Basic Task
\`\`\`xanoscript
task "daily_cleanup" {
  description = "Clean up old records daily"
  schedule = "0 0 * * *"  # Daily at midnight

  stack {
    # Delete records older than 30 days
    db.query old_records {
      where = $db.old_records.created_at < $now - 2592000000
      delete
    }
  }
}
\`\`\`

### Task with Email Notification
\`\`\`xanoscript
task "weekly_report" {
  description = "Generate and send weekly report"
  schedule = "0 9 * * 1"  # Monday at 9 AM

  stack {
    # Get report data
    db.query orders {
      where = $db.orders.created_at > $now - 604800000
      return = {type: "list"}
    } as $orders

    # Calculate totals
    var $total {
      value = 0
    }

    foreach $orders as $order {
      math.calc {
        expression = $total + $order.amount
      } as $total
    }

    # Send email
    email.send {
      to = "admin@example.com"
      subject = "Weekly Sales Report"
      body = "Total sales: $" + $total
    }
  }
}
\`\`\`

## Viewing Task History
\`\`\`bash
# List task execution history
xano history task list -w <workspace_id>

# Search history
xano history task search -w <workspace_id> --task-id <task_id>
\`\`\`

## Best Practices

1. **Use appropriate schedules**: Don't run tasks more often than needed
2. **Handle errors**: Tasks should handle failures gracefully
3. **Log important events**: Use logging for debugging
4. **Keep tasks focused**: One task, one purpose
5. **Monitor execution**: Check task history regularly

## Related Documentation

- \`xano docs function\` - Reusable logic for tasks
- \`xano docs trigger\` - Event-based execution
- \`xano docs history\` - View task execution history
`.trim(),
}
