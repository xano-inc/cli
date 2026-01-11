import type {DocTopic} from '../index.js'

export const apiDocs: DocTopic = {
  name: 'api',
  title: 'API Endpoint Documentation',
  description: 'Create and manage RESTful API endpoints',
  relatedTopics: ['apigroup', 'function', 'middleware'],
  content: `
# API Endpoint Documentation

## Overview

API endpoints are the core building blocks of your Xano backend. Each endpoint
exposes a specific piece of functionality over HTTP, allowing external clients
to interact with your data and business logic.

## Key Concepts

### API Groups
Every endpoint belongs to an **API Group** (e.g., "users", "auth", "products").
Groups help organize your APIs and can share common settings like base paths
and authentication requirements.

### HTTP Methods
Endpoints support standard HTTP methods:
- **GET** - Retrieve data
- **POST** - Create new resources
- **PUT** - Update existing resources (full replacement)
- **PATCH** - Partial update of resources
- **DELETE** - Remove resources

### Endpoint Path
The full URL of an endpoint is: \`<base_url>/<group_path>/<endpoint_path>\`

## XanoScript Syntax

\`\`\`xanoscript
api "<endpoint_path>" verb=<METHOD> {
  api_group = "<group_name>"
  description = "Endpoint description"

  input {
    # Path parameters, query params, body fields
    int id
    text name?
  }

  stack {
    # Your business logic here
    db.query users {
      where = $db.users.id == $input.id
      return = {type: "single"}
    } as $user
  }

  response = $user
}
\`\`\`

## Examples

### Example 1: GET Single Record

\`\`\`xanoscript
api "user/{id}" verb=GET {
  api_group = "users"
  description = "Get a user by ID"

  input {
    int id
  }

  stack {
    db.query user {
      where = $db.user.id == $input.id
      return = {type: "single"}
    } as $user
  }

  response = $user
}
\`\`\`

### Example 2: POST Create Record

\`\`\`xanoscript
api "user" verb=POST {
  api_group = "users"
  description = "Create a new user"

  input {
    text name
    text email
  }

  stack {
    db.query user {
      add = {
        name: $input.name,
        email: $input.email,
        created_at: $now
      }
      return = {type: "single"}
    } as $user
  }

  response = $user
}
\`\`\`

### Example 3: DELETE Record

\`\`\`xanoscript
api "user/{id}" verb=DELETE {
  api_group = "users"
  description = "Delete a user"

  input {
    int id
  }

  stack {
    db.query user {
      where = $db.user.id == $input.id
      delete
    }
  }

  response = {success: true}
}
\`\`\`

## CLI Commands

### List API Endpoints
\`\`\`bash
# List all endpoints
xano api list -w <workspace_id>

# List with JSON output
xano api list -w <workspace_id> -o json

# Filter by API group
xano api list -w <workspace_id> --apigroup <group_id>
\`\`\`

### Get Endpoint Details
\`\`\`bash
# Get endpoint info
xano api get <api_id> -w <workspace_id>

# Get as XanoScript
xano api get <api_id> -w <workspace_id> -o xs
\`\`\`

### Create an Endpoint
\`\`\`bash
# Create from XanoScript file
xano api create -w <workspace_id> -f endpoint.xs

# Create in specific API group
xano api create -w <workspace_id> -f endpoint.xs --apigroup <group_id>
\`\`\`

### Edit an Endpoint
\`\`\`bash
xano api edit <api_id> -w <workspace_id> -f updated_endpoint.xs
\`\`\`

### Delete an Endpoint
\`\`\`bash
# With confirmation
xano api delete <api_id> -w <workspace_id>

# Force delete
xano api delete <api_id> -w <workspace_id> --force
\`\`\`

## Input Types

| Type | Description | Example |
|------|-------------|---------|
| \`int\` | Integer number | \`int id\` |
| \`text\` | String value | \`text name\` |
| \`bool\` | Boolean | \`bool active\` |
| \`decimal\` | Decimal number | \`decimal price\` |
| \`timestamp\` | Date/time | \`timestamp created_at\` |
| \`object\` | JSON object | \`object metadata\` |
| \`any[]\` | Array | \`any[] items\` |

Add \`?\` for optional inputs: \`text description?\`

## Authentication

Endpoints can require authentication:

\`\`\`xanoscript
api "protected" verb=GET {
  api_group = "secure"
  auth = {required: true}  # Requires valid auth token

  stack {
    # $auth contains authenticated user info
    db.query user {
      where = $db.user.id == $auth.id
      return = {type: "single"}
    } as $user
  }

  response = $user
}
\`\`\`

## Best Practices

1. **Use RESTful conventions**: GET for reads, POST for creates, etc.
2. **Validate inputs**: Always validate and sanitize user input
3. **Return appropriate status codes**: 200 for success, 404 for not found, etc.
4. **Use meaningful paths**: \`/users/{id}\` not \`/get-user\`
5. **Document your endpoints**: Add descriptions for clarity

## Related Documentation

- \`xano docs apigroup\` - Managing API groups
- \`xano docs function\` - Reusable functions
- \`xano docs middleware\` - Request/response middleware
`.trim(),
}
