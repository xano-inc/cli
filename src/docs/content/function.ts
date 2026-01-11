import type {DocTopic} from '../index.js'

export const functionDocs: DocTopic = {
  name: 'function',
  title: 'Function Documentation',
  description: 'Reusable business logic that can be called from APIs and other functions',
  relatedTopics: ['api', 'task', 'middleware'],
  content: `
# Function Documentation

## Overview

Functions are reusable pieces of business logic in Xano. They can be called
from API endpoints, tasks, triggers, or other functions. Functions help you:
- Avoid code duplication
- Encapsulate complex logic
- Create testable, modular code

## XanoScript Syntax

\`\`\`xanoscript
function "<function_name>" {
  description = "What this function does"

  input {
    # Parameters passed to the function
    int user_id
    text action?  # Optional parameter
  }

  stack {
    # Your business logic
    db.query user {
      where = $db.user.id == $input.user_id
      return = {type: "single"}
    } as $user

    # More operations...
  }

  response = $user
}
\`\`\`

## Examples

### Example 1: Simple Lookup Function

\`\`\`xanoscript
function "get_user_by_email" {
  description = "Find a user by their email address"

  input {
    text email
  }

  stack {
    db.query user {
      where = $db.user.email == $input.email
      return = {type: "single"}
    } as $user
  }

  response = $user
}
\`\`\`

### Example 2: Function with Validation

\`\`\`xanoscript
function "create_order" {
  description = "Create a new order with validation"

  input {
    int user_id
    any[] items
  }

  stack {
    # Validate user exists
    db.query user {
      where = $db.user.id == $input.user_id
      return = {type: "single"}
    } as $user

    precondition {
      condition = $user != null
      error = {code: 404, message: "User not found"}
    }

    # Calculate total
    var $total {
      value = 0
    }

    foreach $input.items as $item {
      math.calc {
        expression = $total + $item.price * $item.quantity
      } as $total
    }

    # Create order
    db.query order {
      add = {
        user_id: $input.user_id,
        total: $total,
        created_at: $now
      }
      return = {type: "single"}
    } as $order
  }

  response = $order
}
\`\`\`

### Example 3: Calling Other Functions

\`\`\`xanoscript
function "process_signup" {
  input {
    text email
    text password
  }

  stack {
    # Call another function
    function.call "validate_email" {
      input = {email: $input.email}
    } as $valid

    precondition {
      condition = $valid == true
      error = {code: 400, message: "Invalid email"}
    }

    # Create user
    db.query user {
      add = {email: $input.email}
      return = {type: "single"}
    } as $user
  }

  response = $user
}
\`\`\`

## CLI Commands

### List Functions
\`\`\`bash
# List all functions
xano function list -w <workspace_id>

# JSON output
xano function list -w <workspace_id> -o json
\`\`\`

### Get Function Details
\`\`\`bash
# Get function info
xano function get <function_id> -w <workspace_id>

# Get as XanoScript
xano function get <function_id> -w <workspace_id> -o xs
\`\`\`

### Create Function
\`\`\`bash
xano function create -w <workspace_id> -f function.xs
\`\`\`

### Edit Function
\`\`\`bash
xano function edit <function_id> -w <workspace_id> -f updated.xs
\`\`\`

### Delete Function
\`\`\`bash
xano function delete <function_id> -w <workspace_id> --force
\`\`\`

## Calling Functions

From an API endpoint or another function:

\`\`\`xanoscript
function.call "my_function" {
  input = {
    param1: "value1",
    param2: 123
  }
} as $result
\`\`\`

## Best Practices

1. **Single responsibility**: Each function should do one thing well
2. **Clear naming**: Use descriptive names like \`validate_user_credentials\`
3. **Input validation**: Validate inputs at the start of the function
4. **Error handling**: Use preconditions for clear error messages
5. **Documentation**: Add descriptions explaining what the function does

## Related Documentation

- \`xano docs api\` - API endpoints that call functions
- \`xano docs task\` - Scheduled tasks using functions
- \`xano docs middleware\` - Middleware functions
`.trim(),
}
