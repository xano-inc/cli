---
name: var-update
description: XanoScript var.update function for updating existing variable values. Use when you need to modify a variable that was already declared with var, especially inside loops or conditionals.
---

# var.update

Updates the value of an existing variable. The variable must have been previously declared with `var`. This is essential for loops and accumulating values.

## Syntax

```xs
var.update $variable_name {
  value = <expression>
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable_name` | identifier | Yes | Name of existing variable (must start with `$`) |
| `value` | any | Yes | New value (string, number, bool, array, object, or expression) |

## Return Value

None - `var.update` modifies the variable in place; it does not return a value.

## Examples

### Example 1: Basic Update
Update a simple string variable.

```xs
query /example-1-basic verb=GET {
  input {}
  stack {
    var $greeting {
      value = "Hello"
    }
    var.update $greeting {
      value = "Hello World"
    }
  }
  response = $greeting
}
```

**Expected output:** `"Hello World"`

**Test API:** `xs-var-update` group, endpoint ID 1864

### Example 2: Numeric Updates
Update numeric variables with new values.

```xs
query /example-2-number verb=GET {
  input {}
  stack {
    var $counter {
      value = 0
    }
    var.update $counter {
      value = 10
    }
    var $price {
      value = 9.99
    }
    var.update $price {
      value = 19.99
    }
  }
  response = {counter: $counter, price: $price}
}
```

**Expected output:** `{"counter": 10, "price": 19.99}`

**Test API:** `xs-var-update` group, endpoint ID 1865

### Example 3: Expression-Based Updates
Use backtick expressions to compute new values based on current values.

```xs
query /example-3-expression verb=GET {
  input {}
  stack {
    var $count {
      value = 5
    }
    var.update $count {
      value = `$count + 10`
    }
    var $name {
      value = "world"
    }
    var.update $name {
      value = `"Hello " ~ $name`
    }
    var $result {
      value = {count: $count, name: $name}
    }
  }
  response = $result
}
```

**Expected output:** `{"count": 15, "name": "Hello world"}`

**Test API:** `xs-var-update` group, endpoint ID 1866

### Example 4: Object Replacement
Replace an entire object variable with a new object.

```xs
query /example-4-object verb=GET {
  input {}
  stack {
    var $user {
      value = {name: "Alice", age: 25}
    }
    var.update $user {
      value = {name: "Alice", age: 26, active: true}
    }
  }
  response = $user
}
```

**Expected output:** `{"name": "Alice", "age": 26, "active": true}`

**Test API:** `xs-var-update` group, endpoint ID 1868

### Example 5: Loop Accumulator
Use `var.update` inside a `foreach` loop to accumulate values.

```xs
query /example-5-loop verb=GET {
  input {}
  stack {
    var $sum {
      value = 0
    }
    foreach ([1, 2, 3, 4, 5]) {
      each as $item {
        var.update $sum {
          value = `$sum + $item`
        }
      }
    }
  }
  response = $sum
}
```

**Expected output:** `15`

**Test API:** `xs-var-update` group, endpoint ID 1869

## Gotchas and Warnings

1. **Variable must exist first** - You cannot use `var.update` on a variable that hasn't been declared with `var`. This will cause an error.

2. **Use expressions for computed values** - To update based on the current value, use backticks: `` `$count + 1` ``. Without backticks, you're setting a literal value.

3. **Object replacement, not merge** - `var.update` replaces the entire value. It does NOT merge objects. If you update an object, provide all properties you want to keep.

4. **Essential for loops** - Inside `foreach`, `for`, and `while` loops, you must use `var.update` to modify variables. Using `var` again would attempt to redeclare.

5. **String concatenation uses `~`** - To concatenate strings in expressions, use the tilde operator: `` `"Hello " ~ $name` ``

## var vs var.update

| Scenario | Use |
|----------|-----|
| First time creating variable | `var` |
| Changing value after creation | `var.update` |
| Inside a loop iteration | `var.update` |
| Setting initial value | `var` |

## Related Functions

- [var](../var/SKILL.md) - Declare a new variable
- [foreach](../foreach/SKILL.md) - Loop through arrays (commonly uses var.update)
- [while](../while/SKILL.md) - Conditional loops (commonly uses var.update)
- [for](../for/SKILL.md) - Counted loops (commonly uses var.update)

## Test Results

| API Group | Endpoints | Status |
|-----------|-----------|--------|
| `xs-var-update` (ID: 225) | 5 endpoints | Created, XanoScript applied |

**Xano Dashboard:** [xs-var-update API Group](https://xhib-njau-6vza.d2.dev.xano.io/workspace/40-0/api/225/dashboard)
