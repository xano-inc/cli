---
name: math-sub
description: XanoScript math.sub function - subtracts a value from a number variable in place. Use for discounts, decrements, or balance reductions.
---

# math.sub

Subtracts a value from a number variable, mutating it in place.

## Syntax

```xs
math.sub $variable {
  value = $amount_to_subtract
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | decimal/int | Yes | The variable to subtract from (mutated in place) |
| `value` | decimal/int | Yes | The value to subtract |

## Return Value

None - this function mutates the variable directly (no `as $result`).

## Examples

### Basic Subtraction

```xs
query "math-sub" verb=GET {
  input {
    decimal base { description = "Starting number" }
    decimal subtract { description = "Value to subtract" }
  }

  stack {
    var $result { value = $input.base }

    math.sub $result {
      value = $input.subtract
    }
  }

  response = {
    original: $input.base,
    subtracted: $input.subtract,
    result: $result
  }
}
// Input: base=20, subtract=7
// Returns: { "original": 20, "subtracted": 7, "result": 13 }
```

### Apply Discount

```xs
query "apply-discount" verb=POST {
  input {
    decimal price { description = "Original price" }
    decimal discount { description = "Discount amount" }
  }

  stack {
    var $final_price { value = $input.price }

    math.sub $final_price {
      value = $input.discount
    }

    // Ensure price doesn't go negative
    precondition ($final_price >= 0) {
      error_type = "validation"
      error = "Discount exceeds price"
    }
  }

  response = {
    original_price: $input.price,
    discount: $input.discount,
    final_price: $final_price
  }
}
```

## Important Notes

1. **Mutates in place** - No return value, variable is modified directly
2. **Requires stack variable** - Cannot use `$input.field` directly
3. **Can result in negative** - Add validation if needed

## Test API Group

**API Group:** xs-math (ID: 268)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:H7g7BNuc`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| math-sub | 2120 | Subtract value from number | Working |

## Related Functions

- `math.add` - Add to a number
- `math.mul` - Multiply a number
- `math.div` - Divide a number
