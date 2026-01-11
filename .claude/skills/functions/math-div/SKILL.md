---
name: math-div
description: XanoScript math.div function - divides a number variable by a value in place. Use for averages, ratios, or splitting amounts.
---

# math.div

Divides a number variable by a value, mutating it in place.

## Syntax

```xs
math.div $variable {
  value = $divisor
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | decimal/int | Yes | The variable to divide (mutated in place) |
| `value` | decimal/int | Yes | The value to divide by (divisor) |

## Return Value

None - this function mutates the variable directly (no `as $result`).

## Examples

### Basic Division

```xs
query "math-div" verb=GET {
  input {
    decimal base { description = "Starting number (dividend)" }
    decimal divide { description = "Value to divide by (divisor)" }
  }

  stack {
    var $result { value = $input.base }

    math.div $result {
      value = $input.divide
    }
  }

  response = {
    original: $input.base,
    divided_by: $input.divide,
    result: $result
  }
}
// Input: base=100, divide=4
// Returns: { "original": 100, "divided_by": 4, "result": 25 }
```

### Calculate Average

```xs
query "average" verb=GET {
  input {
    decimal total { description = "Total sum" }
    int count { description = "Number of items" }
  }

  stack {
    precondition ($input.count > 0) {
      error_type = "validation"
      error = "Count must be greater than 0"
    }

    var $average { value = $input.total }

    math.div $average {
      value = $input.count
    }
  }

  response = {
    total: $input.total,
    count: $input.count,
    average: $average
  }
}
```

### Split Bill

```xs
query "split-bill" verb=GET {
  input {
    decimal total { description = "Total bill amount" }
    int people { description = "Number of people" }
  }

  stack {
    precondition ($input.people > 0) {
      error_type = "validation"
      error = "Must have at least 1 person"
    }

    var $per_person { value = $input.total }

    math.div $per_person {
      value = $input.people
    }
  }

  response = {
    total: $input.total,
    people: $input.people,
    per_person: $per_person
  }
}
```

## Important Notes

1. **Mutates in place** - No return value, variable is modified directly
2. **Requires stack variable** - Cannot use `$input.field` directly
3. **Division by zero** - Add precondition to prevent
4. **Returns decimal** - Integer division still returns decimal result

## Test API Group

**API Group:** xs-math (ID: 268)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:H7g7BNuc`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| math-div | 2122 | Divide number by value | Working |

## Related Functions

- `math.add` - Add to a number
- `math.sub` - Subtract from a number
- `math.mul` - Multiply a number
