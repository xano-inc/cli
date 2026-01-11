---
name: math-bitwise-or
description: XanoScript math.bitwise.or function - performs bitwise OR on a variable. Use for setting flags, combining permissions, or merging bit fields.
---

# math.bitwise.or

Performs a bitwise OR operation on a variable, mutating it in place.

## Syntax

```xs
math.bitwise.or $variable {
  value = $bits_to_set
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | int | Yes | The variable to OR (mutated in place) |
| `value` | int | Yes | The value to OR with (bits to set) |

## Return Value

None - this function mutates the variable directly (no `as $result`).

## Bitwise OR Truth Table

| A | B | A OR B |
|---|---|--------|
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 1 |

## Examples

### Basic Bitwise OR

```xs
query "bitwise-or" verb=GET {
  input {
    int value1 { description = "First operand" }
    int value2 { description = "Second operand (bits to set)" }
  }

  stack {
    var $result { value = $input.value1 }

    math.bitwise.or $result {
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
// Binary: 1100 | 1010 = 1110
// Returns: { "value1": 12, "value2": 10, "result": 14 }
```

### Set Permission Flag

```xs
query "set-permission" verb=POST {
  input {
    int current_permissions { description = "Current permission bits" }
    int new_permission { description = "Permission flag to add" }
  }

  stack {
    var $permissions { value = $input.current_permissions }

    // OR sets the bit regardless of current state
    math.bitwise.or $permissions {
      value = $input.new_permission
    }
  }

  response = {
    original: $input.current_permissions,
    added: $input.new_permission,
    result: $permissions
  }
}
// Input: current_permissions=1 (READ), new_permission=2 (WRITE)
// 1 | 2 = 3 (READ + WRITE)
```

### Combine Multiple Flags

```xs
query "combine-flags" verb=GET {
  input {
    int flag_a { description = "First flag" }
    int flag_b { description = "Second flag" }
    int flag_c { description = "Third flag" }
  }

  stack {
    var $combined { value = 0 }

    math.bitwise.or $combined { value = $input.flag_a }
    math.bitwise.or $combined { value = $input.flag_b }
    math.bitwise.or $combined { value = $input.flag_c }
  }

  response = {
    flags: [$input.flag_a, $input.flag_b, $input.flag_c],
    combined: $combined
  }
}
// Input: flag_a=1, flag_b=4, flag_c=8
// 0 | 1 | 4 | 8 = 13
```

## Use Cases

| Use Case | Example |
|----------|---------|
| Add permission | `permissions \| WRITE_FLAG` |
| Set status bit | `status \| ACTIVE_BIT` |
| Combine options | `option1 \| option2 \| option3` |
| Enable feature | `features \| NEW_FEATURE` |

## Common Permission Patterns

```xs
// Define permission constants
// READ = 1 (001)
// WRITE = 2 (010)
// EXECUTE = 4 (100)

// Grant read + write
var $perms { value = 0 }
math.bitwise.or $perms { value = 1 }  // READ
math.bitwise.or $perms { value = 2 }  // WRITE
// $perms = 3 (011)
```

## Important Notes

1. **Mutates in place** - No return value, variable is modified directly
2. **Requires stack variable** - Cannot use `$input.field` directly
3. **Integer only** - Works with integers, not decimals
4. **Idempotent** - Setting a bit that's already set has no effect

## Test API Group

**API Group:** xs-math (ID: 268)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:H7g7BNuc`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| bitwise-or | 2124 | Bitwise OR operation | Working |

## Related Functions

- `math.bitwise.and` - Check/mask bits (AND operation)
- `math.bitwise.xor` - Toggle bits (XOR operation)
