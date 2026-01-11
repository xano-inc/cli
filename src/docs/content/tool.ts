import type {DocTopic} from '../index.js'

export const toolDocs: DocTopic = {
  name: 'tool',
  title: 'AI Tool Documentation',
  description: 'Specialized functions designed to be executed by AI Agents or exposed via MCP servers',
  relatedTopics: ['agent', 'mcp-server', 'function'],
  content: `
# AI Tool Documentation

## Overview

AI Tools in Xano are specialized, reusable function stacks designed to be executed
by AI Agents or exposed externally through MCP (Model Context Protocol) servers.
They act as the bridge between an AI's reasoning capabilities and your application's
backend.

Use cases include:
- Database queries and operations
- External API integrations
- Data transformations
- Business logic execution

## Key Concepts

### Tool Structure
- **description**: Internal documentation (not visible to AI)
- **instructions**: Guidelines for AI on how to use the tool (crucial)
- **input**: Parameters the tool accepts
- **stack**: The tool's logic and operations
- **response**: Data returned to the caller

### Tool-Specific Statements
- \`api.call\`: Execute an API endpoint
- \`task.call\`: Execute a background task
- \`tool.call\`: Execute another tool

## CLI Commands

### List Tools
\`\`\`bash
# List all tools
xano tool list -w <workspace_id>

# JSON output
xano tool list -w <workspace_id> -o json
\`\`\`

### Get Tool Details
\`\`\`bash
# Get tool info
xano tool get <tool_id> -w <workspace_id>

# Get as XanoScript
xano tool get <tool_id> -w <workspace_id> -o xs
\`\`\`

### Create Tool
\`\`\`bash
# Create from XanoScript file
xano tool create -w <workspace_id> -f tool.xs

# Create with JSON output
xano tool create -w <workspace_id> -f tool.xs -o json
\`\`\`

### Edit Tool
\`\`\`bash
xano tool edit <tool_id> -w <workspace_id> -f updated.xs
\`\`\`

### Delete Tool
\`\`\`bash
# With confirmation
xano tool delete <tool_id> -w <workspace_id>

# Force delete
xano tool delete <tool_id> -w <workspace_id> --force
\`\`\`

### Update Security
\`\`\`bash
xano tool security <tool_id> -w <workspace_id> --guid <guid>
\`\`\`

## XanoScript Syntax

### Basic Tool
\`\`\`xanoscript
tool "user_lookup" {
  description = "Looks up user information by user ID"
  instructions = "Use this tool to retrieve user profile data given their ID."

  input {
    int user_id {
      description = "The unique identifier of the user"
    }
  }

  stack {
    db.get "user" {
      field_name = "id"
      field_value = $input.user_id
    } as $user
  }

  response = $user
}
\`\`\`

### Tool with API Call
\`\`\`xanoscript
tool "authenticate_user" {
  description = "Authenticates a user via the auth API"
  instructions = "Use this to verify user credentials. Returns auth token on success."

  input {
    text email {
      description = "User's email address"
    }
    text password {
      description = "User's password"
    }
  }

  stack {
    api.call "auth/login" verb=POST {
      api_group = "Authentication"
      input = {
        email: $input.email,
        password: $input.password
      }
    } as $auth_result
  }

  response = $auth_result
}
\`\`\`

### Tool Calling Another Tool
\`\`\`xanoscript
tool "get_user_with_orders" {
  description = "Gets user details along with their orders"
  instructions = "Retrieves comprehensive user data including order history."

  input {
    int user_id {
      description = "The user ID to look up"
    }
  }

  stack {
    tool.call "user_lookup" {
      input = {user_id: $input.user_id}
    } as $user

    db.query orders {
      where = $db.orders.user_id == $input.user_id
      return = {type: "list"}
    } as $orders

    var $result {
      value = {
        user: $user,
        orders: $orders
      }
    }
  }

  response = $result
}
\`\`\`

### Tool with Input Validation
\`\`\`xanoscript
tool "create_task" {
  description = "Creates a new task for a user"
  instructions = "Creates a task with title and optional due date. Priority must be low, medium, or high."

  input {
    text title {
      description = "Task title"
      filters = trim
    }
    text priority? {
      description = "Task priority level"
      enum = ["low", "medium", "high"]
    }
    timestamp due_date? {
      description = "Optional due date for the task"
    }
  }

  stack {
    precondition {
      condition = $input.title|length > 0
      error = {
        code: 400,
        message: "Task title cannot be empty"
      }
    }

    db.query tasks {
      add = {
        title: $input.title,
        priority: $input.priority ?? "medium",
        due_date: $input.due_date,
        created_at: $now
      }
    } as $task
  }

  response = $task
}
\`\`\`

## Input Types

| Type | Description |
|------|-------------|
| \`text\` | String value |
| \`int\` | Integer number |
| \`decimal\` | Decimal number |
| \`bool\` | Boolean (true/false) |
| \`timestamp\` | Date/time value |
| \`object\` | JSON object |
| \`list\` | Array/list |

Add \`?\` after the type for optional parameters.

## Best Practices

1. **Write clear instructions**: Most important field for AI usage
2. **Use descriptive input fields**: Help AI construct valid requests
3. **Leverage enums**: For inputs with fixed options
4. **Keep tools focused**: One well-defined task per tool
5. **Handle errors gracefully**: Return clear error messages
6. **Use filters**: Validate and sanitize inputs

## Related Documentation

- \`xano docs agent\` - AI agents that execute tools
- \`xano docs mcp-server\` - Expose tools via MCP protocol
- \`xano docs function\` - Standard functions for comparison
`.trim(),
}
