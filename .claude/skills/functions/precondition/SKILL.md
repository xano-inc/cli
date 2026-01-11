---
name: precondition
description: XanoScript precondition function for validation and error handling. Use when checking conditions that must be true before proceeding - 404 handling, authentication checks, input validation, and business rules.
---

# precondition

Validates a condition and throws an error if the condition is FALSE. Used for input validation, 404 handling, authentication checks, and enforcing business rules.

## Syntax

```xs
precondition (condition) {
  error_type = "standard"
  error = "Error message"
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `condition` | expression | Yes | Condition that must be TRUE to continue |
| `error_type` | text | No | Error type: `standard` (default), `notfound` (404), `unauthorized` (401) |
| `error` | text | Yes | Error message to display when condition is FALSE |

## Error Types

| Type | HTTP Status | Use Case |
|------|-------------|----------|
| `standard` | 500 | General validation errors |
| `notfound` | 404 | Resource not found |
| `unauthorized` | 401 | Authentication/authorization failures |

## Important: Condition Logic

**The condition must be TRUE for execution to continue.** If the condition is FALSE, the error is thrown.

```xs
// If name IS empty (condition is false), throw error
precondition ($input.name != "") {
  error = "Name is required"
}
```

## Examples

### Example 1: Basic Input Validation

Simple validation that a required field is not empty.

```xs
query "precondition-basic" verb=GET {
  input {
    text name
  }
  stack {
    precondition ($input.name != "") {
      error = "Name cannot be empty"
    }

    var $result {
      value = {success: true, message: "Hello, " ~ $input.name}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/precondition-basic`
- No name → Error "Name cannot be empty"
- name=Claude → `{success: true, message: "Hello, Claude"}`

### Example 2: Not Found (404) Error

Use `error_type = "notfound"` for missing resources.

```xs
query "precondition-notfound" verb=GET {
  input {
    int user_id
  }
  stack {
    // Simulate database lookup
    var $fake_user {
      value = null
    }

    conditional {
      if ($input.user_id == 1) {
        var.update $fake_user {
          value = {id: 1, name: "John"}
        }
      }
    }

    // Return 404 if user not found
    precondition ($fake_user != null) {
      error_type = "notfound"
      error = "User not found"
    }
  }
  response = $fake_user
}
```

**Tested in API:** `xs-error-handling/precondition-notfound`
- user_id=999 → 404 "User not found"
- user_id=1 → `{id: 1, name: "John"}`

### Example 3: Numeric Comparison

Validate numeric ranges with comparison operators.

```xs
query "precondition-numeric" verb=GET {
  input {
    int age
  }
  stack {
    precondition ($input.age >= 18) {
      error = "Must be 18 or older"
    }

    precondition ($input.age <= 120) {
      error = "Age cannot exceed 120"
    }

    var $result {
      value = {
        valid: true,
        age: $input.age,
        message: "Age is valid"
      }
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/precondition-numeric`
- age=15 → Error "Must be 18 or older"
- age=25 → `{valid: true, age: 25, message: "Age is valid"}`

### Example 4: Multiple Chained Validations

Chain multiple preconditions for comprehensive validation.

```xs
query "precondition-multiple" verb=GET {
  input {
    text email
    text password
  }
  stack {
    precondition ($input.email != "") {
      error = "Email is required"
    }

    precondition ($input.email|contains:"@") {
      error = "Email must contain @"
    }

    precondition ($input.password != "") {
      error = "Password is required"
    }

    precondition (($input.password|strlen) >= 8) {
      error = "Password must be at least 8 characters"
    }

    var $result {
      value = {valid: true, email: $input.email}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/precondition-multiple`
- email=test → Error "Email must contain @"
- password=short → Error "Password must be at least 8 characters"
- Valid data → `{valid: true, email: "test@example.com"}`

### Example 5: Unauthorized (401) Error

Use `error_type = "unauthorized"` for authentication failures.

```xs
query "precondition-unauthorized" verb=GET {
  input {
    text token?
  }
  stack {
    precondition ($input.token != "") {
      error_type = "unauthorized"
      error = "Authentication required"
    }

    precondition ($input.token == "secret123") {
      error_type = "unauthorized"
      error = "Invalid token"
    }

    var $result {
      value = {authenticated: true, message: "Access granted"}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/precondition-unauthorized`
- No token → 401 "Authentication required"
- token=wrong → 401 "Invalid token"
- token=secret123 → `{authenticated: true, message: "Access granted"}`

## Gotchas and Warnings

### 1. Condition Must Be TRUE to Continue

The precondition checks if the condition is TRUE. If FALSE, it throws.

```xs
// CORRECT: Continue if name is NOT empty
precondition ($input.name != "") {
  error = "Name required"
}

// WRONG: This throws when name IS provided!
precondition ($input.name == "") {
  error = "Name required"
}
```

### 2. Filters Need Parentheses

When using filters in preconditions, wrap them in parentheses:

```xs
// CORRECT: Wrap filter expression in parentheses
precondition ($input.email|contains:"@") {
  error = "Invalid email"
}

// For comparisons with filter results, use double parentheses
precondition (($input.password|strlen) >= 8) {
  error = "Password too short"
}
```

### 3. Error Type Defaults to Standard

If you omit `error_type`, it defaults to "standard" (500 error):

```xs
// These are equivalent
precondition ($condition) {
  error = "Something went wrong"
}

precondition ($condition) {
  error_type = "standard"
  error = "Something went wrong"
}
```

### 4. Preconditions Execute in Order

Each precondition is checked in sequence. The first failure stops execution:

```xs
precondition ($a) { error = "A failed" }  // Checked first
precondition ($b) { error = "B failed" }  // Only checked if A passes
precondition ($c) { error = "C failed" }  // Only checked if A and B pass
```

### 5. Use with Database Lookups

Common pattern - fetch record then check if found:

```xs
db.get "users" {
  field_name = "id"
  field_value = $input.user_id
} as $user

precondition ($user != null) {
  error_type = "notfound"
  error = "User not found"
}
```

### 6. Error Response Format

Precondition errors return this JSON structure:

```json
{
  "code": "ERROR_CODE_NOT_FOUND",
  "message": "User not found",
  "payload": ""
}
```

Error codes by type:
- `standard` → `ERROR_FATAL`
- `notfound` → `ERROR_CODE_NOT_FOUND`
- `unauthorized` → `ERROR_CODE_UNAUTHORIZED`

## Test Results

| Endpoint | Status | Notes |
|----------|--------|-------|
| precondition-basic (2143) | ✅ Working | Basic validation |
| precondition-notfound (2144) | ✅ Working | 404 error type |
| precondition-numeric (2145) | ✅ Working | Numeric comparisons |
| precondition-multiple (2146) | ✅ Working | Chained validations |
| precondition-unauthorized (2147) | ✅ Working | 401 error type |

**API Group:** `xs-error-handling` (271)
**API Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:uJH8PQAf`

## Related Functions

- [try_catch](../try-catch/SKILL.md) - Catch and handle errors
- [throw](../throw/SKILL.md) - Manually throw custom errors
- [return](../return/SKILL.md) - Early exit from functions
