---
name: math-mul
description: XanoScript math.mul function - multiplies a number variable by a value in place. Use for scaling, percentages, or quantity calculations.
---

# math.mul

Multiplies a number variable by a value, mutating it in place.

## Syntax

```xs
math.mul $variable {
  value = $multiplier
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | decimal/int | Yes | The variable to multiply (mutated in place) |
| `value` | decimal/int | Yes | The value to multiply by |

## Return Value

None - this function mutates the variable directly (no `as $result`).

## Examples

### Basic Multiplication

```xs
query "math-mul" verb=GET {
  input {
    decimal base { description = "Starting number" }
    decimal multiply { description = "Value to multiply by" }
  }

  stack {
    var $result { value = $input.base }

    math.mul $result {
      value = $input.multiply
    }
  }

  response = {
    original: $input.base,
    multiplied_by: $input.multiply,
    result: $result
  }
}
// Input: base=6, multiply=7
// Returns: { "original": 6, "multiplied_by": 7, "result": 42 }
```

### Calculate Tax

```xs
query "calculate-with-tax" verb=GET {
  input {
    decimal price { description = "Base price" }
    decimal tax_rate?=0.1 { description = "Tax rate (default 10%)" }
  }

  stack {
    var $total { value = $input.price }

    // Calculate tax amount
    var $tax { value = $input.price }
    math.mul $tax {
      value = $input.tax_rate
    }

    // Add tax to total
    math.add $total {
      value = $tax
    }
  }

  response = {
    base_price: $input.price,
    tax_rate: $input.tax_rate,
    tax_amount: $tax,
    total: $total
  }
}
```

### Percentage Calculation

```xs
query "percentage" verb=GET {
  input {
    decimal amount { description = "Amount" }
    decimal percent { description = "Percentage (e.g., 25 for 25%)" }
  }

  stack {
    var $result { value = $input.amount }

    // Convert percent to decimal and multiply
    var $decimal_percent { value = `$input.percent / 100` }
    math.mul $result {
      value = $decimal_percent
    }
  }

  response = {
    amount: $input.amount,
    percent: $input.percent,
    result: $result
  }
}
```

## Important Notes

1. **Mutates in place** - No return value, variable is modified directly
2. **Requires stack variable** - Cannot use `$input.field` directly
3. **Works with decimals** - Handles floating-point arithmetic

## Test API Group

**API Group:** xs-math (ID: 268)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:H7g7BNuc`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| math-mul | 2121 | Multiply number by value | Working |

## Related Functions

- `math.add` - Add to a number
- `math.sub` - Subtract from a number
- `math.div` - Divide a number
