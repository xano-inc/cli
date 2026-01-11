import type {DocTopic} from '../index.js'

export const middlewareDocs: DocTopic = {
  name: 'middleware',
  title: 'Middleware Documentation',
  description: 'Request/response processing that runs before or after API endpoints',
  relatedTopics: ['api', 'function', 'apigroup'],
  content: `
# Middleware Documentation

## Overview

Middleware in Xano allows you to run code before (precondition) or after (response)
your API endpoints execute. Common uses include:
- Authentication and authorization checks
- Request validation and transformation
- Response formatting and logging
- Rate limiting and caching

## Key Concepts

### Middleware Types
- **Precondition Middleware**: Runs before the API endpoint logic
- **Response Middleware**: Runs after the API endpoint completes

### Execution Order
Middleware executes in the order they're attached to an API group or endpoint.

## CLI Commands

### List Middleware
\`\`\`bash
# List all middleware in workspace
xano middleware list -w <workspace_id>

# JSON output
xano middleware list -w <workspace_id> -o json
\`\`\`

### Get Middleware Details
\`\`\`bash
# Get middleware info
xano middleware get <middleware_id> -w <workspace_id>

# Get as XanoScript
xano middleware get <middleware_id> -w <workspace_id> -o xs
\`\`\`

### Create Middleware
\`\`\`bash
# Create with name and description
xano middleware create -w <workspace_id> --name auth_check --description "Auth middleware"

# Create from XanoScript file
xano middleware create -w <workspace_id> -f middleware.xs

# Create with JSON output
xano middleware create -w <workspace_id> -f middleware.xs -o json
\`\`\`

### Edit Middleware
\`\`\`bash
xano middleware edit <middleware_id> -w <workspace_id> -f updated.xs
\`\`\`

### Delete Middleware
\`\`\`bash
# With confirmation
xano middleware delete <middleware_id> -w <workspace_id>

# Force delete
xano middleware delete <middleware_id> -w <workspace_id> --force
\`\`\`

### Update Security
\`\`\`bash
# Restrict to API group
xano middleware security <middleware_id> -w <workspace_id> --guid <api_group_guid>
\`\`\`

## XanoScript Syntax

### Precondition Middleware Example
\`\`\`xanoscript
middleware "auth_required" {
  description = "Ensure user is authenticated"
  type = "precondition"

  stack {
    precondition {
      condition = $auth.id != null
      error = {
        code: 401,
        message: "Authentication required"
      }
    }
  }
}
\`\`\`

### Response Middleware Example
\`\`\`xanoscript
middleware "add_metadata" {
  description = "Add response metadata"
  type = "response"

  stack {
    var $result {
      value = {
        data: $response,
        timestamp: $now,
        version: "1.0"
      }
    }
  }

  response = $result
}
\`\`\`

## Best Practices

1. **Keep middleware focused**: Each middleware should do one thing
2. **Order matters**: Place authentication before authorization
3. **Handle errors gracefully**: Return clear error messages
4. **Avoid side effects**: Middleware should be predictable
5. **Document purpose**: Use descriptions to explain what each does

## Related Documentation

- \`xano docs api\` - API endpoints that use middleware
- \`xano docs apigroup\` - Groups that apply middleware
- \`xano docs function\` - Functions for complex middleware logic
`.trim(),
}
