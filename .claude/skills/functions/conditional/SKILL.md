# conditional

The `conditional` block controls script flow based on conditions, executing different code blocks depending on whether conditions evaluate to true or false. It functions like an if-else statement.

## Syntax

```xs
conditional {
  if (condition1) {
    // executes if condition1 is true
  }
  elseif (condition2) {
    // executes if condition1 is false and condition2 is true
  }
  else {
    // executes if all conditions are false
  }
}
```

## Condition Syntax

Conditions can be written in two ways:

```xs
// With backticks (for expressions)
if (`$value > 10`) { ... }

// Without backticks (for simple comparisons)
if ($value > 10) { ... }
if ($status == "active") { ... }
```

## Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equals | `$x == 5` |
| `!=` | Not equals | `$x != 0` |
| `>` | Greater than | `$x > 10` |
| `<` | Less than | `$x < 100` |
| `>=` | Greater or equal | `$x >= 0` |
| `<=` | Less or equal | `$x <= 50` |
| `&&` | Logical AND | `$x > 0 && $x < 10` |
| `\|\|` | Logical OR | `$x == 0 \|\| $x == 1` |

## Test Endpoints

**API Group:** xs-conditional (ID: 230)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:jA-U-X1o`

### 1. Basic If/Else

**Endpoint:** `GET /conditional/basic` (ID: 1892)

```xs
query "conditional/basic" verb=GET {
  description = "Basic if/else conditional"

  input {
    int value?=0 {
      description = "Value to check"
    }
  }

  stack {
    var $result { value = "" }

    conditional {
      if ($input.value > 0) {
        var.update $result { value = "positive" }
      }
      elseif ($input.value < 0) {
        var.update $result { value = "negative" }
      }
      else {
        var.update $result { value = "zero" }
      }
    }
  }

  response = { value: $input.value, classification: $result }
}
```

**Test Cases:**
- `?value=5` → `{"value": 5, "classification": "positive"}`
- `?value=-3` → `{"value": -3, "classification": "negative"}`
- `?value=0` → `{"value": 0, "classification": "zero"}`

### 2. Multiple Branches (Grading)

**Endpoint:** `GET /conditional/multi-branch` (ID: 1893)

```xs
query "conditional/multi-branch" verb=GET {
  description = "Multiple elseif branches for grading"

  input {
    int score {
      description = "Test score (0-100)"
    }
  }

  stack {
    var $grade { value = "" }

    conditional {
      if ($input.score >= 90) {
        var.update $grade { value = "A" }
      }
      elseif ($input.score >= 80) {
        var.update $grade { value = "B" }
      }
      elseif ($input.score >= 70) {
        var.update $grade { value = "C" }
      }
      elseif ($input.score >= 60) {
        var.update $grade { value = "D" }
      }
      else {
        var.update $grade { value = "F" }
      }
    }
  }

  response = { score: $input.score, grade: $grade }
}
```

**Test Cases:**
- `?score=95` → `{"score": 95, "grade": "A"}`
- `?score=72` → `{"score": 72, "grade": "C"}`
- `?score=55` → `{"score": 55, "grade": "F"}`

### 3. Nested Conditionals

**Endpoint:** `GET /conditional/nested` (ID: 1894)

```xs
query "conditional/nested" verb=GET {
  description = "Nested conditionals for complex logic"

  input {
    text category {
      description = "Category: product or service"
    }
    int value {
      description = "Value amount"
    }
  }

  stack {
    var $discount { value = 0 }

    conditional {
      if ($input.category == "product") {
        conditional {
          if ($input.value > 100) {
            var.update $discount { value = 15 }
          }
          elseif ($input.value > 50) {
            var.update $discount { value = 10 }
          }
          else {
            var.update $discount { value = 5 }
          }
        }
      }
      elseif ($input.category == "service") {
        conditional {
          if ($input.value > 200) {
            var.update $discount { value = 20 }
          }
          else {
            var.update $discount { value = 10 }
          }
        }
      }
      else {
        var.update $discount { value = 0 }
      }
    }
  }

  response = {
    category: $input.category,
    value: $input.value,
    discount_percent: $discount
  }
}
```

### 4. Compound Operators (AND/OR)

**Endpoint:** `GET /conditional/operators` (ID: 1895)

```xs
query "conditional/operators" verb=GET {
  description = "Conditionals with AND/OR operators"

  input {
    text status {
      description = "User status: active or inactive"
    }
    int age {
      description = "User age"
    }
  }

  stack {
    var $access { value = "denied" }
    var $reason { value = "" }

    conditional {
      if ($input.status == "active" && $input.age >= 18) {
        var.update $access { value = "full" }
        var.update $reason { value = "Active adult user" }
      }
      elseif ($input.status == "active" && $input.age < 18) {
        var.update $access { value = "limited" }
        var.update $reason { value = "Active minor - restricted content" }
      }
      elseif ($input.status == "inactive" || $input.age < 13) {
        var.update $access { value = "denied" }
        var.update $reason { value = "Account inactive or too young" }
      }
      else {
        var.update $access { value = "basic" }
        var.update $reason { value = "Default access level" }
      }
    }
  }

  response = {
    status: $input.status,
    age: $input.age,
    access: $access,
    reason: $reason
  }
}
```

### 5. Inline Ternary Alternative

**Endpoint:** `GET /conditional/ternary` (ID: 1896)

```xs
query "conditional/ternary" verb=GET {
  description = "Ternary operator alternative"

  input {
    bool flag?=false {
      description = "Boolean flag"
    }
  }

  stack {
    // XanoScript ternary syntax
    var $result {
      value = ($input.flag == true) ? "enabled" : "disabled"
    }

    // Alternative: use conditional block for clarity
    var $message { value = "" }
    conditional {
      if ($input.flag) {
        var.update $message { value = "Feature is ON" }
      }
      else {
        var.update $message { value = "Feature is OFF" }
      }
    }
  }

  response = {
    flag: $input.flag,
    status: $result,
    message: $message
  }
}
```

## Key Patterns

### Pattern 1: Variable Assignment in Branches

```xs
// Declare variable first, update in branches
var $result { value = "" }

conditional {
  if ($condition) {
    var.update $result { value = "yes" }
  }
  else {
    var.update $result { value = "no" }
  }
}
```

### Pattern 2: Early Return with Precondition

```xs
// Use precondition for validation, conditional for logic
precondition ($input.id != null) {
  error_type = "inputerror"
  error = "ID is required"
}

conditional {
  if ($record.status == "active") {
    // process active record
  }
}
```

### Pattern 3: Checking Null/Empty

```xs
conditional {
  if ($value == null) {
    // handle null
  }
  elseif (($value|strlen) == 0) {
    // handle empty string
  }
  else {
    // handle value
  }
}
```

### Pattern 4: Type-Based Logic

```xs
conditional {
  if ($input.type == "admin") {
    // admin logic
  }
  elseif ($input.type == "user") {
    // user logic
  }
  elseif ($input.type == "guest") {
    // guest logic
  }
}
```

## Gotchas and Edge Cases

1. **Backticks for expressions**: Use backticks when combining operators: `` if (`$a > 0 && $b < 10`) ``

2. **Variable scoping**: Variables declared inside a conditional branch are accessible outside the block (unlike some languages).

3. **Ternary vs Conditional**: For simple true/false assignments, use ternary `? :`. For complex logic, use `conditional`.

4. **String comparison**: Use `==` for string equality. Case-sensitive by default.

5. **Empty elseif**: If you need multiple independent checks, use separate `conditional` blocks instead of empty `elseif`.

6. **Order matters**: Conditions are checked in order. Put most specific conditions first.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `unexpected 'if'` | Missing `conditional` wrapper | Wrap `if` in `conditional { }` |
| `undefined variable` | Using var before declaration | Declare `var $x {}` before conditional |
| Logic error | Wrong operator precedence | Use parentheses: `($a && $b) \|\| $c` |

## Related Functions

- [switch](../switch/SKILL.md) - Multi-branch with case matching
- [precondition](../precondition/SKILL.md) - Validation with error throwing
- [for](../for/SKILL.md) - Counted loops
- [foreach](../foreach/SKILL.md) - Array iteration
- [var.update](../var-update/SKILL.md) - Variable modification
