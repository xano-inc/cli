import type {DocTopic} from '../index.js'

export const historyDocs: DocTopic = {
  name: 'history',
  title: 'Execution History Documentation',
  description: 'View execution history for API requests, functions, tasks, triggers, and tools',
  relatedTopics: ['audit-log', 'api', 'function', 'task', 'trigger', 'tool'],
  content: `
# Execution History Documentation

## Overview

Execution history in Xano records all runtime executions of your API endpoints,
functions, tasks, triggers, middleware, and tools. This data is invaluable for
debugging, performance monitoring, and understanding system behavior.

Use cases include:
- Debugging failed requests
- Performance analysis
- Usage monitoring
- Error tracking

## History Types

### Request History
Tracks all API endpoint executions.
- HTTP method and path
- Request/response data
- Status codes
- Execution time

### Function History
Tracks function executions.
- Function name
- Input/output data
- Execution time
- Errors

### Task History
Tracks scheduled task executions.
- Task name
- Execution status
- Start/end times
- Errors

### Trigger History
Tracks trigger executions.
- Trigger name and type
- Event that fired it
- Execution result

### Middleware History
Tracks middleware executions.
- Middleware name
- Associated request
- Execution time

### Tool History
Tracks AI tool executions.
- Tool name
- Input/output
- Calling agent

## CLI Commands

### Request History
\`\`\`bash
# List API request history
xano history request list -w <workspace_id>

# Search request history
xano history request search -w <workspace_id> --status 500
xano history request search -w <workspace_id> --method POST
xano history request search -w <workspace_id> --path "/api/users"

# With pagination
xano history request list -w <workspace_id> --page 1 --per-page 100

# JSON output
xano history request list -w <workspace_id> -o json
\`\`\`

### Function History
\`\`\`bash
# List function execution history
xano history function list -w <workspace_id>

# Search by function
xano history function search -w <workspace_id> --function-id <id>

# JSON output
xano history function list -w <workspace_id> -o json
\`\`\`

### Task History
\`\`\`bash
# List task execution history
xano history task list -w <workspace_id>

# Search by task
xano history task search -w <workspace_id> --task-id <id>

# JSON output
xano history task list -w <workspace_id> -o json
\`\`\`

### Trigger History
\`\`\`bash
# List trigger execution history
xano history trigger list -w <workspace_id>

# Search by trigger
xano history trigger search -w <workspace_id> --trigger-id <id>

# JSON output
xano history trigger list -w <workspace_id> -o json
\`\`\`

### Middleware History
\`\`\`bash
# List middleware execution history
xano history middleware list -w <workspace_id>

# Search by middleware
xano history middleware search -w <workspace_id> --middleware-id <id>

# JSON output
xano history middleware list -w <workspace_id> -o json
\`\`\`

### Tool History
\`\`\`bash
# List tool execution history
xano history tool list -w <workspace_id>

# Search by tool
xano history tool search -w <workspace_id> --tool-id <id>

# JSON output
xano history tool list -w <workspace_id> -o json
\`\`\`

## History Entry Fields

### Request History Fields
| Field | Description |
|-------|-------------|
| \`id\` | Unique history entry ID |
| \`timestamp\` | When the request occurred |
| \`method\` | HTTP method (GET, POST, etc.) |
| \`path\` | API endpoint path |
| \`status\` | HTTP response status code |
| \`duration\` | Execution time in ms |
| \`request_body\` | Request payload |
| \`response_body\` | Response payload |

### Common History Fields
| Field | Description |
|-------|-------------|
| \`id\` | Unique history entry ID |
| \`timestamp\` | When execution occurred |
| \`duration\` | Execution time in ms |
| \`status\` | Success or failure |
| \`error\` | Error message if failed |

## Common Use Cases

### Debugging Failed Requests
\`\`\`bash
# Find 500 errors
xano history request search -w <workspace_id> --status 500

# Get details
xano history request list -w <workspace_id> -o json | head -20
\`\`\`

### Monitoring Task Execution
\`\`\`bash
# Check if tasks ran successfully
xano history task list -w <workspace_id> --per-page 10
\`\`\`

### Analyzing API Usage
\`\`\`bash
# List recent requests
xano history request list -w <workspace_id> --per-page 100 -o json
\`\`\`

## Best Practices

1. **Regular monitoring**: Check history for errors regularly
2. **Use search filters**: Narrow down to specific issues
3. **Export for analysis**: Export to JSON for detailed analysis
4. **Set up alerts**: Use Xano alerts for critical errors
5. **Clean up old history**: History has retention limits

## Retention

History retention depends on your Xano plan:
- Free tier: Limited retention
- Paid plans: Extended retention based on plan

## Related Documentation

- \`xano docs audit-log\` - Configuration change tracking
- \`xano docs api\` - API endpoint configuration
- \`xano docs task\` - Scheduled task configuration
- \`xano docs trigger\` - Trigger configuration
- \`xano docs function\` - Function configuration
`.trim(),
}
