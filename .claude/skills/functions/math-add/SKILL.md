---
name: math-add
description: XanoScript math.add function - adds a value to a number variable in place. Use for accumulating totals, counters, or running sums.
---

# math.add

Adds a value to a number variable, mutating it in place.

## Syntax

```xs
math.add $variable {
  value = $amount_to_add
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | decimal/int | Yes | The variable to add to (mutated in place) |
| `value` | decimal/int | Yes | The value to add |

## Return Value

None - this function mutates the variable directly (no `as $result`).

## Examples

### Basic Addition

```xs
query "math-add" verb=GET {
  input {
    decimal base { description = "Starting number" }
    decimal add { description = "Value to add" }
  }

  stack {
    var $result { value = $input.base }

    math.add $result {
      value = $input.add
    }
  }

  response = {
    original: $input.base,
    added: $input.add,
    result: $result
  }
}
// Input: base=10, add=5
// Returns: { "original": 10, "added": 5, "result": 15 }
```

### Accumulating Cart Total

```xs
query "add-to-cart" verb=POST {
  input {
    decimal item_price { description = "Price of item to add" }
  }

  stack {
    // Get current cart total
    var $cart_total { value = 0 }

    // Add item price
    math.add $cart_total {
      value = $input.item_price
    }

    // Add tax (10%)
    var $tax { value = `$input.item_price * 0.1` }
    math.add $cart_total {
      value = $tax
    }
  }

  response = {
    item_price: $input.item_price,
    tax: $tax,
    total: $cart_total
  }
}
```

### Multiple Additions

```xs
query "sum-values" verb=GET {
  input {
    decimal a { description = "First value" }
    decimal b { description = "Second value" }
    decimal c { description = "Third value" }
  }

  stack {
    var $sum { value = 0 }

    math.add $sum { value = $input.a }
    math.add $sum { value = $input.b }
    math.add $sum { value = $input.c }
  }

  response = {
    sum: $sum
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
| math-add | 2119 | Add value to number | Working |

## Related Functions

- `math.sub` - Subtract from a number
- `math.mul` - Multiply a number
- `math.div` - Divide a number
