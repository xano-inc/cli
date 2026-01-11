---
name: try-catch
description: XanoScript try_catch function for error handling. Use when wrapping code that might fail - external API calls, database operations, or any code that could throw errors. Provides try/catch/finally blocks.
---

# try_catch

Executes code in a `try` block and catches any errors in the `catch` block. The optional `finally` block runs regardless of success or failure, useful for cleanup tasks.

## Syntax

```xs
try_catch {
  try {
    // Code that might fail
  }
  catch {
    // Error handling - $error is available here
  }
  finally {
    // Optional cleanup - always runs
  }
}
```

## Blocks

| Block | Required | Description |
|-------|----------|-------------|
| `try` | Yes | Code to attempt |
| `catch` | Yes | Error handling code - runs only on failure |
| `finally` | No | Cleanup code - always runs |

## The $error Object

Inside the `catch` block, `$error` contains error details:

| Property | Description |
|----------|-------------|
| `$error.code` | Error code (e.g., "ERROR_FATAL", "ERROR_CODE_THROWN_ERROR") |
| `$error.message` | Error message (from precondition) or static "Throw Error Statement" (from throw) |
| `$error.name` | Error name (e.g., "Exception" or custom name from throw) |
| `$error.result` | Custom value from throw statement |

### Error Source Differences

**From precondition:**
```json
{
  "code": "ERROR_FATAL",
  "message": "Your error message here",
  "name": "Exception",
  "result": ""
}
```

**From throw:**
```json
{
  "code": "ERROR_CODE_THROWN_ERROR",
  "message": "Throw Error Statement",
  "name": "YourErrorName",
  "result": "Your custom value here"
}
```

## Examples

### Example 1: Basic Try/Catch

Simple error handling with a precondition.

```xs
query "try-catch-basic" verb=GET {
  input {
    bool should_fail?=false
  }
  stack {
    var $success { value = false }
    var $error_msg { value = null }
    var $data { value = null }

    try_catch {
      try {
        precondition ($input.should_fail == false) {
          error = "Intentional error triggered"
        }

        var.update $success { value = true }
        var.update $data { value = "Operation completed successfully" }
      }
      catch {
        var.update $error_msg { value = $error }
      }
    }

    var $result {
      value = {success: $success, error: $error_msg, data: $data}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/try-catch-basic`
- should_fail=false → `{success: true, error: null, data: "Operation completed..."}`
- should_fail=true → `{success: false, error: {...}, data: null}`

### Example 2: Try/Catch with Finally

The `finally` block always executes, regardless of success or failure.

```xs
query "try-catch-finally" verb=GET {
  input {
    bool should_fail?=false
  }
  stack {
    var $result {
      value = {try_ran: false, catch_ran: false, finally_ran: false}
    }

    try_catch {
      try {
        var.update $result {
          value = {try_ran: true, catch_ran: false, finally_ran: false}
        }

        precondition ($input.should_fail == false) {
          error = "Error in try block"
        }
      }
      catch {
        var.update $result {
          value = {try_ran: true, catch_ran: true, finally_ran: false}
        }
      }
      finally {
        var.update $result {
          value = $result|set:"finally_ran":true
        }
      }
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/try-catch-finally`
- should_fail=false → `{try_ran: true, catch_ran: false, finally_ran: true}`
- should_fail=true → `{try_ran: true, catch_ran: true, finally_ran: true}`

### Example 3: Accessing Error Details

Capture the full `$error` object to access error details.

```xs
query "try-catch-error-info" verb=GET {
  input {}
  stack {
    var $error_info { value = null }
    var $caught { value = false }

    try_catch {
      try {
        throw {
          name = "ValidationError"
          value = "This is the error message"
        }
      }
      catch {
        var.update $caught { value = true }
        var.update $error_info { value = $error }
      }
    }

    var $result {
      value = {caught: $caught, error: $error_info}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/try-catch-error-info`
- Returns: `{caught: true, error: {code: "ERROR_CODE_THROWN_ERROR", name: "ValidationError", result: "This is the error message", message: "Throw Error Statement"}}`

### Example 4: Wrapping External API Calls

Handle potential failures when calling external APIs.

```xs
query "try-catch-api-request" verb=GET {
  input {
    int status_code?=200
  }
  stack {
    var $success { value = false }
    var $error_msg { value = null }
    var $data { value = null }

    try_catch {
      try {
        api.request {
          url = "https://httpbin.org/status/" ~ $input.status_code
          method = "GET"
          timeout = 10
        } as $api_response

        var.update $success { value = true }
        var.update $data { value = $api_response }
      }
      catch {
        var.update $error_msg { value = $error }
      }
    }

    var $result {
      value = {success: $success, error: $error_msg, data: $data}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/try-catch-api-request`

### Example 5: Nested Try/Catch

Handle errors at different levels with nested blocks.

```xs
query "try-catch-nested" verb=GET {
  input {
    bool outer_fail?=false
    bool inner_fail?=false
  }
  stack {
    var $result {
      value = {outer_try: false, inner_try: false, inner_catch: false, outer_catch: false}
    }

    try_catch {
      try {
        var.update $result { value = $result|set:"outer_try":true }

        precondition ($input.outer_fail == false) {
          error = "Outer block failed"
        }

        try_catch {
          try {
            var.update $result { value = $result|set:"inner_try":true }

            precondition ($input.inner_fail == false) {
              error = "Inner block failed"
            }
          }
          catch {
            var.update $result { value = $result|set:"inner_catch":true }
          }
        }
      }
      catch {
        var.update $result { value = $result|set:"outer_catch":true }
      }
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/try-catch-nested`
- No failure → `{outer_try: true, inner_try: true, inner_catch: false, outer_catch: false}`
- inner_fail=true → `{outer_try: true, inner_try: true, inner_catch: true, outer_catch: false}`
- outer_fail=true → `{outer_try: true, inner_try: false, inner_catch: false, outer_catch: true}`

## Gotchas and Warnings

### 1. $error Cannot Be Used Inline in Object Literals

You must capture `$error` to a separate variable first:

```xs
// WRONG - $error properties will be null
catch {
  var.update $result {
    value = {error_msg: $error.message}
  }
}

// CORRECT - capture full $error object first
catch {
  var.update $error_info { value = $error }
}
// Then access $error_info.message later
```

### 2. API Errors vs HTTP Error Codes

`api.request` does NOT throw on HTTP error status codes (404, 500). It only throws on network failures or timeouts. You must check the response status yourself:

```xs
api.request { ... } as $response

// Check status code manually
precondition ($response.response.status == 200) {
  error = "API returned error: " ~ $response.response.status
}
```

### 3. Error Message Location Varies

- **precondition errors**: `$error.message` contains your message
- **throw errors**: `$error.result` contains your message, `$error.name` contains your name

### 4. Finally Always Runs

The `finally` block runs even if `catch` block errors:

```xs
try_catch {
  try {
    throw { name = "Test", value = "Error" }
  }
  catch {
    throw { name = "CatchError", value = "Catch also failed" }
  }
  finally {
    // This STILL runs before the catch error propagates
  }
}
```

### 5. Variables Must Be Declared Outside

Declare variables outside try_catch to access them after:

```xs
// CORRECT - accessible after try_catch
var $result { value = null }
try_catch {
  try {
    var.update $result { value = "success" }
  }
  catch {
    var.update $result { value = "failed" }
  }
}
response = $result  // Works!
```

## Test Results

| Endpoint | Status | Notes |
|----------|--------|-------|
| try-catch-basic (2148) | ✅ Working | Basic error handling |
| try-catch-finally (2149) | ✅ Working | Finally always executes |
| try-catch-error-info (2150) | ✅ Working | Full $error object capture |
| try-catch-api-request (2151) | ✅ Working | External API wrapping |
| try-catch-nested (2152) | ✅ Working | Nested error handling |

**API Group:** `xs-error-handling` (271)
**API Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:uJH8PQAf`

## Related Functions

- [precondition](../precondition/SKILL.md) - Validate conditions and throw errors
- [throw](../throw/SKILL.md) - Manually throw custom errors
- [return](../return/SKILL.md) - Early exit from functions
