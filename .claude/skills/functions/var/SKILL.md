---
name: var
description: XanoScript var function for declaring variables with values. Use when you need to create a new variable in a stack block, store values like strings, numbers, booleans, arrays, or objects.
---

# var

Declares a new variable with an initial value. The variable can hold strings, numbers, booleans, arrays, or objects.

## Syntax

```xs
var $variable_name {
  value = <expression>
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable_name` | identifier | Yes | Name must start with `$` |
| `value` | any | Yes | Initial value (string, number, bool, array, object, null) |

## Return Value

None - `var` declares the variable in scope; it does not return a value.

## Examples

### Example 1: String Variable
Declare a simple string variable and return it.

```xs
query /example-1-basic verb=GET {
  input {}
  stack {
    var $greeting {
      value = "Hello World"
    }
  }
  response = $greeting
}
```

**Expected output:** `"Hello World"`

**Test API:** `xs-var` group, endpoint ID 1858

### Example 2: Numeric Variables
Declare integer and decimal variables.

```xs
query /example-2-number verb=GET {
  input {}
  stack {
    var $count {
      value = 42
    }
    var $price {
      value = 19.99
    }
  }
  response = {count: $count, price: $price}
}
```

**Expected output:** `{"count": 42, "price": 19.99}`

**Test API:** `xs-var` group, endpoint ID 1859

### Example 3: Object Variable
Declare a variable containing an object with multiple properties.

```xs
query /example-3-object verb=GET {
  input {}
  stack {
    var $user {
      value = {name: "Alice", age: 30, active: true}
    }
  }
  response = $user
}
```

**Expected output:** `{"name": "Alice", "age": 30, "active": true}`

**Test API:** `xs-var` group, endpoint ID 1860

### Example 4: Array Variables
Declare arrays of strings and numbers.

```xs
query /example-4-array verb=GET {
  input {}
  stack {
    var $colors {
      value = ["red", "green", "blue"]
    }
    var $numbers {
      value = [1, 2, 3, 4, 5]
    }
  }
  response = {colors: $colors, numbers: $numbers}
}
```

**Expected output:** `{"colors": ["red", "green", "blue"], "numbers": [1, 2, 3, 4, 5]}`

**Test API:** `xs-var` group, endpoint ID 1861

### Example 5: Null and Empty Values
Declare variables with null, empty string, empty array, and empty object.

```xs
query /example-5-null-empty verb=GET {
  input {}
  stack {
    var $empty_string {
      value = ""
    }
    var $null_value {
      value = null
    }
    var $empty_array {
      value = []
    }
    var $empty_object {
      value = {}
    }
  }
  response = {
    empty_string: $empty_string,
    null_value: $null_value,
    empty_array: $empty_array,
    empty_object: $empty_object
  }
}
```

**Expected output:** `{"empty_string": "", "null_value": null, "empty_array": [], "empty_object": {}}`

**Test API:** `xs-var` group, endpoint ID 1863

## Gotchas and Warnings

1. **Variable names must start with `$`** - Forgetting the `$` prefix will cause a syntax error.

2. **Scope is local to the stack** - Variables declared in a stack are only available within that stack and nested blocks.

3. **Cannot redeclare** - Once a variable is declared, use `var.update` to change its value, not another `var` statement.

4. **Query requires `input {}` block** - Even if you have no inputs, you must include an empty `input {}` block or you'll get "Missing block: input" error.

## Critical Discovery: XanoScript Deployment

When deploying XanoScript to endpoints via the Xano API, you MUST use:
- **Content-Type:** `text/x-xanoscript`
- **Body:** Raw XanoScript code (not JSON-wrapped)

Using `application/json` with XanoScript in a field will NOT work correctly.

## Related Functions

- [var-update](../var-update/SKILL.md) - Update an existing variable's value
- [math.add](../math-add/SKILL.md) - Add to a numeric variable (mutates in place)

## Test Results

| API Group | Endpoints | Status |
|-----------|-----------|--------|
| `xs-var` (ID: 224) | 5 endpoints | Created, XanoScript applied |

**Xano Dashboard:** [xs-var API Group](https://xhib-njau-6vza.d2.dev.xano.io/workspace/40-0/api/224/dashboard)
