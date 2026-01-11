---
name: math-bitwise-and
description: XanoScript math.bitwise.and function - performs bitwise AND on a variable. Use for masking bits, checking flags, or extracting bit fields.
---

# math.bitwise.and

Performs a bitwise AND operation on a variable, mutating it in place.

## Syntax

```xs
math.bitwise.and $variable {
  value = $mask
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | int | Yes | The variable to AND (mutated in place) |
| `value` | int | Yes | The value to AND with (mask) |

## Return Value

None - this function mutates the variable directly (no `as $result`).

## Bitwise AND Truth Table

| A | B | A AND B |
|---|---|---------|
| 0 | 0 | 0 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | 1 |

## Examples

### Basic Bitwise AND

```xs
query "bitwise-and" verb=GET {
  input {
    int value1 { description = "First operand" }
    int value2 { description = "Second operand (mask)" }
  }

  stack {
    var $result { value = $input.value1 }

    math.bitwise.and $result {
      value = $input.value2
    }
  }

  response = {
    value1: $input.value1,
    value2: $input.value2,
    result: $result
  }
}
// Input: value1=12, value2=10
// Binary: 1100 & 1010 = 1000
// Returns: { "value1": 12, "value2": 10, "result": 8 }
```

### Check if Flag is Set

```xs
query "check-flag" verb=GET {
  input {
    int permissions { description = "Permission bits" }
    int flag { description = "Flag to check" }
  }

  stack {
    var $check { value = $input.permissions }

    math.bitwise.and $check {
      value = $input.flag
    }

    // If result equals the flag, it was set
    var $is_set { value = `$check == $input.flag` }
  }

  response = {
    permissions: $input.permissions,
    flag: $input.flag,
    is_set: $is_set
  }
}
// Input: permissions=7 (binary 111), flag=4 (binary 100)
// 7 & 4 = 4, so flag is set
```

### Extract Lower Nibble

```xs
query "extract-nibble" verb=GET {
  input {
    int value { description = "Value to extract from" }
  }

  stack {
    var $lower_nibble { value = $input.value }

    // Mask with 0x0F (15) to get lower 4 bits
    math.bitwise.and $lower_nibble {
      value = 15
    }
  }

  response = {
    original: $input.value,
    lower_nibble: $lower_nibble
  }
}
// Input: value=171 (binary 10101011)
// 171 & 15 = 11 (binary 1011)
```

## Use Cases

| Use Case | Example |
|----------|---------|
| Check permission flag | `permissions & READ_FLAG == READ_FLAG` |
| Extract bit field | `value & 0xFF` to get lower byte |
| Clear specific bits | `value & ~mask` (with XOR) |
| Validate bit patterns | `value & required_bits == required_bits` |

## Important Notes

1. **Mutates in place** - No return value, variable is modified directly
2. **Requires stack variable** - Cannot use `$input.field` directly
3. **Integer only** - Works with integers, not decimals
4. **Common masks**: 1, 2, 4, 8, 16... (powers of 2 for single bits)

## Test API Group

**API Group:** xs-math (ID: 268)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:H7g7BNuc`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| bitwise-and | 2123 | Bitwise AND operation | Working |

## Related Functions

- `math.bitwise.or` - Set bits (OR operation)
- `math.bitwise.xor` - Toggle bits (XOR operation)
