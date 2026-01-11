---
name: throw
description: XanoScript throw function for raising custom errors. Use when you need to halt execution with a custom error - validation failures, business rule violations, or custom error handling.
---

# throw

Throws an error and immediately halts script execution. Use with `try_catch` to handle the error gracefully, or let it propagate to the API response.

## Syntax

```xs
throw {
  name = "ErrorName"
  value = "Error message or data"
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | text | Yes | Error type/category (e.g., "ValidationError", "NotFoundError") |
| `value` | any | Yes | Error message (string) or structured data (object) |

## Behavior

### Uncaught Throw (No try_catch)

When throw is not caught, the API returns an error response:

```json
{
  "payload": "Your error message",
  "statement": "Throw Error"
}
```

### Caught Throw (With try_catch)

When caught, the `$error` object contains:

```json
{
  "code": "ERROR_CODE_THROWN_ERROR",
  "message": "Throw Error Statement",
  "name": "YourErrorName",
  "result": "Your error message or data"
}
```

## Examples

### Example 1: Basic Throw

Simple throw with name and message.

```xs
query "throw-basic" verb=GET {
  input {
    bool should_throw?=true
  }
  stack {
    conditional {
      if ($input.should_throw == true) {
        throw {
          name = "ValidationError"
          value = "This is a custom error message"
        }
      }
    }

    var $result {
      value = {success: true, message: "No error was thrown"}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/throw-basic`
- should_throw=true → `{payload: "This is a custom error message", statement: "Throw Error"}`
- should_throw=false → `{success: true, message: "No error was thrown"}`

### Example 2: Different Error Types

Use different error names to categorize errors.

```xs
query "throw-custom-types" verb=GET {
  input {
    text error_type?="validation"
  }
  stack {
    conditional {
      if ($input.error_type == "validation") {
        throw {
          name = "ValidationError"
          value = "Input validation failed"
        }
      }
      elseif ($input.error_type == "notfound") {
        throw {
          name = "NotFoundError"
          value = "Resource not found"
        }
      }
      elseif ($input.error_type == "auth") {
        throw {
          name = "AuthenticationError"
          value = "Authentication required"
        }
      }
      else {
        throw {
          name = "BusinessLogicError"
          value = "Business rule violated"
        }
      }
    }
  }
  response = "never reached"
}
```

**Tested in API:** `xs-error-handling/throw-custom-types`
- error_type=validation → `{payload: "Input validation failed", ...}`
- error_type=notfound → `{payload: "Resource not found", ...}`

### Example 3: Conditional Throw

Throw based on input validation.

```xs
query "throw-conditional" verb=GET {
  input {
    int age?=0
  }
  stack {
    conditional {
      if ($input.age < 0) {
        throw {
          name = "InvalidInputError"
          value = "Age cannot be negative"
        }
      }
      elseif ($input.age < 18) {
        throw {
          name = "AgeRestrictionError"
          value = "Must be 18 or older"
        }
      }
      elseif ($input.age > 120) {
        throw {
          name = "InvalidInputError"
          value = "Age seems unrealistic"
        }
      }
    }

    var $result {
      value = {valid: true, age: $input.age, message: "Age is valid"}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/throw-conditional`
- age=25 → `{valid: true, age: 25, message: "Age is valid"}`
- age=15 → `{payload: "Must be 18 or older", ...}`
- age=-5 → `{payload: "Age cannot be negative", ...}`

### Example 4: Throw in Loop (Break Pattern)

Use throw to break out of loop execution with error details.

```xs
query "throw-in-loop" verb=GET {
  input {
    int fail_at?=5
  }
  stack {
    var $processed { value = [] }
    var $error_caught { value = null }

    try_catch {
      try {
        for (10) {
          each as $i {
            conditional {
              if ($input.fail_at > 0 && ($i + 1) == $input.fail_at) {
                throw {
                  name = "LoopError"
                  value = "Failed at iteration " ~ ($i + 1)
                }
              }
            }
            var.update $processed {
              value = $processed|push:($i + 1)
            }
          }
        }
      }
      catch {
        var.update $error_caught { value = $error }
      }
    }

    var $result {
      value = {processed: $processed, error: $error_caught}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/throw-in-loop`
- fail_at=0 → `{processed: [1,2,3,4,5,6,7,8,9,10], error: null}`
- fail_at=5 → `{processed: [1,2,3,4], error: {name: "LoopError", result: "Failed at iteration 5", ...}}`

### Example 5: Throw with Structured Data

Pass complex data in the throw value.

```xs
query "throw-with-data" verb=GET {
  input {
    text user_id?="123"
  }
  stack {
    var $error_data { value = null }

    try_catch {
      try {
        throw {
          name = "DataValidationError"
          value = {
            field: "user_id",
            provided: $input.user_id,
            expected: "numeric string",
            timestamp: 1234567890
          }
        }
      }
      catch {
        var.update $error_data { value = $error }
      }
    }

    var $result {
      value = {
        error_name: $error_data.name,
        error_data: $error_data.result
      }
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/throw-with-data`
- Returns: `{error_name: "DataValidationError", error_data: {field: "user_id", provided: "123", expected: "numeric string", timestamp: 1234567890}}`

## Gotchas and Warnings

### 1. Error Name Must Be Static

The `name` parameter must be a static string, not a variable:

```xs
// WRONG - won't work
throw {
  name = $input.error_type
  value = "Error message"
}

// CORRECT - use conditional to set different names
conditional {
  if ($input.error_type == "validation") {
    throw { name = "ValidationError", value = "..." }
  }
  else {
    throw { name = "GenericError", value = "..." }
  }
}
```

### 2. Throw Halts Immediately

Code after throw never executes:

```xs
throw { name = "Error", value = "Stop here" }
var $result { value = "Never reached" }  // This line never runs
```

### 3. Accessing Error Data

When caught, the throw `value` is in `$error.result`, NOT `$error.message`:

```xs
throw { name = "Test", value = "My message" }

// In catch block:
$error.message  // "Throw Error Statement" (static text)
$error.result   // "My message" (your custom value)
$error.name     // "Test" (your custom name)
```

### 4. Uncaught Errors Use Different Format

Without try_catch, the response format differs:

```json
{
  "payload": "Your value here",
  "statement": "Throw Error"
}
```

The `name` from throw is NOT included in uncaught error responses - only the `value` as `payload`.

### 5. Throw vs Precondition

| Feature | throw | precondition |
|---------|-------|--------------|
| Custom name | Yes (via `name`) | No (always "Exception") |
| Error types | No HTTP codes | notfound (404), unauthorized (401) |
| Error message | In `$error.result` | In `$error.message` |
| Use case | Custom errors | Validation gates |

## Test Results

| Endpoint | Status | Notes |
|----------|--------|-------|
| throw-basic (2153) | ✅ Working | Basic throw |
| throw-custom-types (2154) | ✅ Working | Different error names |
| throw-conditional (2155) | ✅ Working | Conditional throws |
| throw-in-loop (2156) | ✅ Working | Loop break pattern |
| throw-with-data (2157) | ✅ Working | Structured data in value |

**API Group:** `xs-error-handling` (271)
**API Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:uJH8PQAf`

## Related Functions

- [precondition](../precondition/SKILL.md) - Validate conditions with HTTP error types
- [try_catch](../try-catch/SKILL.md) - Catch and handle thrown errors
- [return](../return/SKILL.md) - Early exit without error
