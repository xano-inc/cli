# stack

A `stack` block defines a sequence of actions to be executed in a specific context. It acts as a container for organizing and executing operations like variable declarations, control flow, function calls, and database operations.

## Syntax

```xs
stack {
  // Variable declarations
  var $name { value = "..." }

  // Control flow
  for (n) { each as $i { ... } }
  conditional { if (...) { ... } }

  // Function calls
  math.add $var { value = n }

  // Database operations
  db.query "table" { ... } as $result
}
```

## Where stack is Used

- Inside `query` blocks (API endpoints)
- Inside `function` blocks (custom functions)
- Inside `task` blocks (scheduled jobs)
- Inside `group` blocks (logical groupings)
- Inside `db.transaction` blocks (atomic operations)

## Test Endpoints

**API Group:** xs-stack (ID: 226)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:AX-Hh5r0`

### 1. Basic Stack - Variable Declarations

**Endpoint:** `GET /stack/basic` (ID: 1870)

```xs
query /stack/basic verb=GET {
  input {}
  stack {
    var $message { value = "Hello from stack" }
    var $count { value = 42 }
    var $result { value = { message: $message, count: $count } }
  }
  response = $result
}
```

**Expected Response:**
```json
{
  "message": "Hello from stack",
  "count": 42
}
```

### 2. Stack with For Loop

**Endpoint:** `GET /stack/loop` (ID: 1871)

```xs
query /stack/loop verb=GET {
  input {}
  stack {
    var $sum { value = 0 }
    for (5) {
      each as $i {
        math.add $sum { value = `$i + 1` }
      }
    }
    var $result { value = { sum: $sum, description: "Sum of 1+2+3+4+5" } }
  }
  response = $result
}
```

**Expected Response:**
```json
{
  "sum": 15,
  "description": "Sum of 1+2+3+4+5"
}
```

### 3. Stack with Conditional Logic

**Endpoint:** `GET /stack/conditional` (ID: 1872)

```xs
query /stack/conditional verb=GET {
  input {
    int value?
  }
  stack {
    var $input_val { value = $input.value || 0 }
    var $category { value = "" }
    conditional {
      if (`$input_val > 100`) {
        var.update $category { value = "large" }
      }
      elseif (`$input_val > 10`) {
        var.update $category { value = "medium" }
      }
      else {
        var.update $category { value = "small" }
      }
    }
    var $result { value = { input: $input_val, category: $category } }
  }
  response = $result
}
```

**Test Cases:**
- `?value=150` → `{"input": 150, "category": "large"}`
- `?value=50` → `{"input": 50, "category": "medium"}`
- `?value=5` → `{"input": 5, "category": "small"}`

### 4. Stack with Multiple Operations

**Endpoint:** `GET /stack/multi-op` (ID: 1873)

```xs
query /stack/multi-op verb=GET {
  input {
    int a?
    int b?
  }
  stack {
    var $x { value = $input.a || 10 }
    var $y { value = $input.b || 5 }
    var $sum { value = `$x + $y` }
    var $product { value = `$x * $y` }
    var $difference { value = `$x - $y` }
    var $result {
      value = {
        a: $x,
        b: $y,
        sum: $sum,
        product: $product,
        difference: $difference
      }
    }
  }
  response = $result
}
```

**Expected Response (default):**
```json
{
  "a": 10,
  "b": 5,
  "sum": 15,
  "product": 50,
  "difference": 5
}
```

### 5. Nested Stacks with Groups

**Endpoint:** `GET /stack/nested` (ID: 1874)

```xs
query /stack/nested verb=GET {
  input {}
  stack {
    var $outer { value = "outer scope" }
    var $items { value = [] }
    group {
      description = "First group with its own stack"
      stack {
        var $inner1 { value = "first nested" }
        array.push $items { value = $inner1 }
      }
    }
    group {
      description = "Second group with its own stack"
      stack {
        var $inner2 { value = "second nested" }
        array.push $items { value = $inner2 }
      }
    }
    var $result { value = { outer: $outer, collected: $items } }
  }
  response = $result
}
```

**Expected Response:**
```json
{
  "outer": "outer scope",
  "collected": ["first nested", "second nested"]
}
```

## Key Patterns

### Pattern 1: Stack as Main Container
Every `query` and `function` uses `stack` as the main container for logic:

```xs
query /example verb=GET {
  input { ... }
  stack {
    // All logic goes here
  }
  response = $result
}
```

### Pattern 2: Variable Scope
Variables declared in a stack are accessible in nested stacks (groups):

```xs
stack {
  var $shared { value = [] }
  group {
    stack {
      // $shared is accessible here
      array.push $shared { value = "item" }
    }
  }
}
```

### Pattern 3: Sequential Execution
Operations in a stack execute sequentially from top to bottom:

```xs
stack {
  var $x { value = 1 }      // Step 1
  math.add $x { value = 2 } // Step 2: $x = 3
  math.mul $x { value = 3 } // Step 3: $x = 9
}
```

## Gotchas and Edge Cases

1. **Stack is Required**: You cannot have loose operations in a `query` or `function` - they must be inside a `stack` block.

2. **No Return Inside Stack**: Use `response = $var` outside the stack, not `return` inside (unless you want early termination).

3. **Variable Hoisting**: Variables must be declared before use. Unlike JavaScript, there's no hoisting.

4. **Group Stacks**: When using `group` for organization, the inner `stack` is required for containing operations.

## Related Functions

- [var](../var/SKILL.md) - Variable declaration
- [var.update](../var-update/SKILL.md) - Variable modification
- [group](../group/SKILL.md) - Logical grouping with collapsible UI
- [conditional](../conditional/SKILL.md) - If/else logic
- [for](../for/SKILL.md) - Counted loops
- [foreach](../foreach/SKILL.md) - Array iteration
