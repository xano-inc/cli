---
name: math-bitwise-xor
description: XanoScript math.bitwise.xor function - performs bitwise XOR on a variable. Use for toggling flags, simple encryption, or detecting differences.
---

# math.bitwise.xor

Performs a bitwise XOR (exclusive OR) operation on a variable, mutating it in place.

## Syntax

```xs
math.bitwise.xor $variable {
  value = $bits_to_toggle
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | int | Yes | The variable to XOR (mutated in place) |
| `value` | int | Yes | The value to XOR with (bits to toggle) |

## Return Value

None - this function mutates the variable directly (no `as $result`).

## Bitwise XOR Truth Table

| A | B | A XOR B |
|---|---|---------|
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |

## Examples

### Basic Bitwise XOR

```xs
query "bitwise-xor" verb=GET {
  input {
    int value1 { description = "First operand" }
    int value2 { description = "Second operand (bits to toggle)" }
  }

  stack {
    var $result { value = $input.value1 }

    math.bitwise.xor $result {
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
// Binary: 1100 ^ 1010 = 0110
// Returns: { "value1": 12, "value2": 10, "result": 6 }
```

### Toggle Flag

```xs
query "toggle-flag" verb=POST {
  input {
    int status { description = "Current status bits" }
    int flag { description = "Flag to toggle" }
  }

  stack {
    var $new_status { value = $input.status }

    // XOR toggles the bit: 0->1 or 1->0
    math.bitwise.xor $new_status {
      value = $input.flag
    }
  }

  response = {
    original: $input.status,
    toggled: $input.flag,
    result: $new_status
  }
}
// Toggle ON: status=0, flag=4 → result=4
// Toggle OFF: status=4, flag=4 → result=0
```

### Simple XOR Cipher

```xs
query "xor-cipher" verb=POST {
  input {
    int data { description = "Data to encrypt/decrypt" }
    int key { description = "XOR key" }
  }

  stack {
    var $result { value = $input.data }

    math.bitwise.xor $result {
      value = $input.key
    }
  }

  response = {
    input: $input.data,
    key: $input.key,
    output: $result
  }
}
// Encrypt: data=42, key=123 → output=81
// Decrypt: data=81, key=123 → output=42 (reversible!)
```

### Swap Values Without Temp Variable

```xs
query "xor-swap" verb=GET {
  input {
    int a { description = "First value" }
    int b { description = "Second value" }
  }

  stack {
    var $x { value = $input.a }
    var $y { value = $input.b }

    // XOR swap algorithm
    math.bitwise.xor $x { value = $y }  // x = x ^ y
    math.bitwise.xor $y { value = $x }  // y = y ^ (x ^ y) = x
    math.bitwise.xor $x { value = $y }  // x = (x ^ y) ^ x = y
  }

  response = {
    original_a: $input.a,
    original_b: $input.b,
    swapped_a: $x,
    swapped_b: $y
  }
}
// Input: a=5, b=10
// Returns: swapped_a=10, swapped_b=5
```

## Use Cases

| Use Case | Example |
|----------|---------|
| Toggle flag | `status ^ ACTIVE_FLAG` |
| Simple encryption | `data ^ key` (reversible) |
| Find differences | `a ^ b` (1s where bits differ) |
| Checksum/parity | XOR all bytes together |
| Swap values | Classic XOR swap trick |

## Key Property: Self-Inverse

XOR is its own inverse:
```
A ^ B ^ B = A
```

This makes it useful for:
- Reversible encryption
- Toggle operations
- Undo functionality

## Important Notes

1. **Mutates in place** - No return value, variable is modified directly
2. **Requires stack variable** - Cannot use `$input.field` directly
3. **Integer only** - Works with integers, not decimals
4. **Self-inverse** - XOR twice with same value returns original

## Test API Group

**API Group:** xs-math (ID: 268)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:H7g7BNuc`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| bitwise-xor | 2125 | Bitwise XOR operation | Working |

## Related Functions

- `math.bitwise.and` - Check/mask bits (AND operation)
- `math.bitwise.or` - Set bits (OR operation)
