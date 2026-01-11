---
name: api-lambda
description: XanoScript api.lambda function for running JavaScript/TypeScript code. Use when you need custom logic, data transformation, validation, or any computation that's easier in JS than XanoScript.
---

# api.lambda

Executes JavaScript or TypeScript code in a sandboxed environment. Has access to stack context (`$input`, `$var`, `$auth`, `$env`) and returns a value.

## Syntax

```xs
api.lambda {
  code = """
    // JavaScript or TypeScript code
    return yourResult;
  """
  timeout = 10
} as $result
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | text | Yes | JavaScript/TypeScript code in triple quotes (`"""`) |
| `timeout` | int | Yes | Maximum execution time in seconds |

## Available Context

Inside lambda code, you have access to:

| Variable | Description |
|----------|-------------|
| `$input` | API input parameters |
| `$var` | Stack variables (access via `$var.variableName`) |
| `$auth` | Authentication context |
| `$env` | Environment variables |

## Examples

### Example 1: Basic JavaScript Execution

Simple conditionals and computations.

```xs
query "lambda-basic" verb=GET {
  input {
    int value?=15
  }
  stack {
    api.lambda {
      code = """
        const isGreaterThan10 = $input.value > 10;
        return {
          input_value: $input.value,
          is_greater_than_10: isGreaterThan10,
          doubled: $input.value * 2,
          message: isGreaterThan10 ? 'Value is greater than 10' : 'Value is 10 or less'
        };
      """
      timeout = 10
    } as $result
  }
  response = $result
}
```

**Tested in API:** `xs-api-lambda/lambda-basic`
- value=15 → `{input_value: 15, is_greater_than_10: true, doubled: 30, ...}`
- value=5 → `{input_value: 5, is_greater_than_10: false, doubled: 10, ...}`

### Example 2: Accessing Stack Variables

Read variables declared in XanoScript stack.

```xs
query "lambda-access-vars" verb=GET {
  input {
    text name?="World"
  }
  stack {
    var $greeting {
      value = "Hello"
    }
    var $count {
      value = 42
    }

    api.lambda {
      code = """
        const greeting = $var.greeting;
        const count = $var.count;
        const name = $input.name;

        return {
          message: greeting + ', ' + name + '!',
          count_from_stack: count,
          computed: count * 2
        };
      """
      timeout = 10
    } as $result
  }
  response = $result
}
```

**Tested in API:** `xs-api-lambda/lambda-access-vars`
- name=Claude → `{message: "Hello, Claude!", count_from_stack: 42, computed: 84}`

### Example 3: Data Transformation

Array manipulation with map, filter, etc.

```xs
query "lambda-transform" verb=POST {
  input {
    json items
  }
  stack {
    api.lambda {
      code = """
        const items = $input.items || [];

        const transformed = items.map((item, index) => ({
          id: index + 1,
          original: item,
          uppercase: typeof item === 'string' ? item.toUpperCase() : item,
          type: typeof item
        }));

        return {
          count: items.length,
          items: transformed,
          summary: 'Processed ' + items.length + ' items'
        };
      """
      timeout = 10
    } as $result
  }
  response = $result
}
```

**Tested in API:** `xs-api-lambda/lambda-transform`
- items=["hello","world",123] → Transforms each with type info and uppercase

### Example 4: Async/Await Patterns

Use async operations like setTimeout, fetch (if available).

```xs
query "lambda-async" verb=GET {
  input {
    int delay_ms?=100
  }
  stack {
    api.lambda {
      code = """
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        const start = Date.now();
        await delay($input.delay_ms);
        const elapsed = Date.now() - start;

        return {
          requested_delay: $input.delay_ms,
          actual_elapsed: elapsed,
          message: 'Async operation completed'
        };
      """
      timeout = 10
    } as $result
  }
  response = $result
}
```

**Tested in API:** `xs-api-lambda/lambda-async`
- delay_ms=50 → `{requested_delay: 50, actual_elapsed: 51, ...}`

### Example 5: Complex Input Validation

Full validation logic with helper functions.

```xs
query "lambda-with-input" verb=POST {
  input {
    json user
  }
  stack {
    api.lambda {
      code = """
        const user = $input.user || {};

        const isValidEmail = email => {
          return email && email.includes('@') && email.includes('.');
        };

        const errors = [];
        if (!user.name || user.name.length < 2) {
          errors.push('Name must be at least 2 characters');
        }
        if (!isValidEmail(user.email)) {
          errors.push('Invalid email format');
        }

        return {
          valid: errors.length === 0,
          errors: errors,
          sanitized: {
            name: (user.name || '').trim(),
            email: (user.email || '').toLowerCase().trim()
          }
        };
      """
      timeout = 10
    } as $result
  }
  response = $result
}
```

**Tested in API:** `xs-api-lambda/lambda-with-input`
- Valid user → `{valid: true, errors: [], sanitized: {...}}`
- Invalid → `{valid: false, errors: ["Name must be at least 2 characters", "Invalid email format"], ...}`

## Gotchas and Warnings

### 1. Must Return a Value

Lambda code MUST return a value. Without return, the result is undefined:

```xs
// WRONG - returns undefined
api.lambda {
  code = """
    const x = 5;
  """
  timeout = 10
} as $result  // $result is undefined

// CORRECT
api.lambda {
  code = """
    const x = 5;
    return x;
  """
  timeout = 10
} as $result  // $result is 5
```

### 2. Access Stack Variables via $var

Stack variables are accessed via `$var.name`, not `$name`:

```xs
var $myData { value = "hello" }

api.lambda {
  code = """
    // WRONG - $myData is undefined
    // const data = $myData;

    // CORRECT
    const data = $var.myData;
    return data;
  """
  timeout = 10
} as $result
```

### 3. Triple Quotes for Multiline Code

Use `"""` for code blocks:

```xs
api.lambda {
  code = """
    const line1 = 'hello';
    const line2 = 'world';
    return line1 + ' ' + line2;
  """
  timeout = 10
} as $result
```

### 4. Lambda Can Only Be Used in Stack

Lambda is a stack statement, not usable in input or response:

```xs
// WRONG
input {
  api.lambda { ... }  // Not allowed
}

// CORRECT
stack {
  api.lambda { ... } as $result
}
```

### 5. Timeout is Required

Always specify a timeout:

```xs
api.lambda {
  code = "return 1;"
  timeout = 10  // Required!
} as $result
```

### 6. Error Handling in Lambda

Use try/catch inside lambda for error handling:

```xs
api.lambda {
  code = """
    try {
      const data = JSON.parse($input.jsonString);
      return { success: true, data: data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  """
  timeout = 10
} as $result
```

### 7. Lambda vs SQL vs XanoScript

| Use Case | Best Tool |
|----------|-----------|
| Database queries | SQL (db.direct_query) |
| Simple conditions | XanoScript (conditional) |
| Complex logic | Lambda (api.lambda) |
| Data transformation | Lambda |
| External API calls | api.request + Lambda for processing |

## Test Results

| Endpoint | Status | Notes |
|----------|--------|-------|
| lambda-basic (2169) | ✅ Working | Conditionals and math |
| lambda-access-vars (2170) | ✅ Working | Stack variable access |
| lambda-transform (2171) | ✅ Working | Array transformation |
| lambda-async (2172) | ✅ Working | Async/await support |
| lambda-with-input (2173) | ✅ Working | Complex validation |

**API Group:** `xs-api-lambda` (273)
**API Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:TmEz5GzX`

## Related Functions

- [api.request](../api-request/SKILL.md) - Make HTTP requests to external APIs
- [try_catch](../try-catch/SKILL.md) - Error handling wrapper
- [function.run](../function-run/SKILL.md) - Call custom Xano functions
