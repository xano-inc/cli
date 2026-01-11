---
name: return
description: XanoScript return function for early exit from functions with a value. Use when you need to exit execution early based on a condition - guard clauses, search results, or conditional response paths.
---

# return

Halts execution and returns the specified value as the response. Unlike `throw`, this is a normal exit (not an error). Useful for early returns, guard clauses, and conditional response paths.

## Syntax

```xs
return {
  value = $your_data
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | any | Yes | The value to return as the response |

## Behavior

- Immediately stops execution of the current stack
- Returns the specified value as the API response
- Does NOT trigger catch blocks (it's not an error)
- Code after `return` is never executed

## Examples

### Example 1: Basic Early Return

Simple guard clause pattern.

```xs
query "return-basic" verb=GET {
  input {
    bool early_return?=true
  }
  stack {
    conditional {
      if ($input.early_return == true) {
        return {
          value = {message: "Returned early", reached_end: false}
        }
      }
    }

    var $result {
      value = {message: "Reached the end", reached_end: true}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/return-basic`
- early_return=true → `{message: "Returned early", reached_end: false}`
- early_return=false → `{message: "Reached the end", reached_end: true}`

### Example 2: Conditional Return Based on User Type

Return different data based on input.

```xs
query "return-conditional" verb=GET {
  input {
    text user_type?="guest"
  }
  stack {
    conditional {
      if ($input.user_type == "admin") {
        return {
          value = {access: "full", features: ["read", "write", "delete", "admin"]}
        }
      }
      elseif ($input.user_type == "user") {
        return {
          value = {access: "standard", features: ["read", "write"]}
        }
      }
    }

    var $result {
      value = {access: "limited", features: ["read"]}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/return-conditional`
- user_type=admin → `{access: "full", features: [...]}`
- user_type=user → `{access: "standard", features: [...]}`
- user_type=guest → `{access: "limited", features: ["read"]}`

### Example 3: Return When Found in Loop

Exit loop early when item is found.

```xs
query "return-in-loop" verb=GET {
  input {
    int find_value?=5
  }
  stack {
    var $items {
      value = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    }

    foreach ($items) {
      each as $item {
        conditional {
          if ($item == $input.find_value) {
            return {
              value = {found: true, value: $item, message: "Found in loop"}
            }
          }
        }
      }
    }

    var $result {
      value = {found: false, value: null, message: "Not found"}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/return-in-loop`
- find_value=5 → `{found: true, value: 5, message: "Found in loop"}`
- find_value=99 → `{found: false, value: null, message: "Not found"}`

### Example 4: Return from Nested Conditionals

Exit from deeply nested logic.

```xs
query "return-nested" verb=GET {
  input {
    int x?=0
    int y?=0
  }
  stack {
    conditional {
      if ($input.x > 0) {
        conditional {
          if ($input.y > 0) {
            return {
              value = {quadrant: 1, description: "Upper right"}
            }
          }
          else {
            return {
              value = {quadrant: 4, description: "Lower right"}
            }
          }
        }
      }
      elseif ($input.x < 0) {
        conditional {
          if ($input.y > 0) {
            return {
              value = {quadrant: 2, description: "Upper left"}
            }
          }
          else {
            return {
              value = {quadrant: 3, description: "Lower left"}
            }
          }
        }
      }
    }

    var $result {
      value = {quadrant: 0, description: "On axis"}
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/return-nested`
- x=5, y=3 → `{quadrant: 1, description: "Upper right"}`
- x=-5, y=-3 → `{quadrant: 3, description: "Lower left"}`
- x=0, y=5 → `{quadrant: 0, description: "On axis"}`

### Example 5: Return After Processing (Break Pattern)

Exit when a condition is met during processing.

```xs
query "return-with-processing" verb=GET {
  input {
    int number?=10
  }
  stack {
    var $sum { value = 0 }

    for ($input.number) {
      each as $i {
        var.update $sum {
          value = $sum + ($i + 1)
        }

        conditional {
          if ($sum > 100) {
            return {
              value = {
                stopped_early: true,
                sum: $sum,
                iterations: $i + 1,
                message: "Sum exceeded 100"
              }
            }
          }
        }
      }
    }

    var $result {
      value = {
        stopped_early: false,
        sum: $sum,
        iterations: $input.number,
        message: "Completed all iterations"
      }
    }
  }
  response = $result
}
```

**Tested in API:** `xs-error-handling/return-with-processing`
- number=10 → `{stopped_early: false, sum: 55, iterations: 10, ...}`
- number=20 → `{stopped_early: true, sum: 105, iterations: 14, ...}` (stopped at 14)

## Gotchas and Warnings

### 1. Return is Not an Error

Unlike `throw`, `return` is a normal exit:

```xs
try_catch {
  try {
    return { value = "This is fine" }  // NOT caught
  }
  catch {
    // This never runs for return
  }
}
```

### 2. Code After Return Never Executes

```xs
return { value = "Done" }
var $x { value = "Never created" }  // Dead code
```

### 3. Return Bypasses Response Block

When you use `return`, the `response = ` line is never reached:

```xs
query "example" verb=GET {
  input {}
  stack {
    return { value = "Returned here" }  // This becomes the response
    var $result { value = "Never used" }
  }
  response = $result  // Never reached
}
```

### 4. Return vs Throw Comparison

| Feature | return | throw |
|---------|--------|-------|
| Exit type | Normal | Error |
| Caught by try_catch | No | Yes |
| Response format | Your value directly | Error object with payload |
| Use case | Early exit | Error conditions |

### 5. Return in Functions vs APIs

In custom functions, `return` returns to the calling code. In API queries, `return` becomes the final response.

## Test Results

| Endpoint | Status | Notes |
|----------|--------|-------|
| return-basic (2158) | ✅ Working | Basic early return |
| return-conditional (2159) | ✅ Working | Different return paths |
| return-in-loop (2160) | ✅ Working | Exit loop when found |
| return-nested (2161) | ✅ Working | Nested conditional returns |
| return-with-processing (2162) | ✅ Working | Break pattern with processing |

**API Group:** `xs-error-handling` (271)
**API Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:uJH8PQAf`

## Related Functions

- [throw](../throw/SKILL.md) - Exit with an error
- [precondition](../precondition/SKILL.md) - Validate and throw if false
- [try_catch](../try-catch/SKILL.md) - Catch thrown errors (not returns)
