---
name: security-random-number
description: XanoScript security.random_number function - generates a cryptographically secure random integer within a range. Use for random selection, dice rolls, or random sampling.
---

# security.random_number

Generates a cryptographically secure random integer between min and max (inclusive).

## Syntax

```xs
security.random_number {
  min = 1
  max = 100
} as $number
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `min` | int | Yes | Minimum value (inclusive) |
| `max` | int | Yes | Maximum value (inclusive) |

## Return Value

Returns an integer between min and max stored in the variable specified by `as`.

## Examples

### Basic Usage

```xs
query "example" verb=GET {
  input {}

  stack {
    security.random_number {
      min = 1
      max = 100
    } as $number
  }

  response = {
    result: $number
  }
}
// Returns: { "result": 51 } (random between 1-100)
```

### With User Input

```xs
query "roll-dice" verb=GET {
  input {
    int sides?=6 { description = "Number of sides on the die" }
  }

  stack {
    security.random_number {
      min = 1
      max = $input.sides
    } as $roll
  }

  response = {
    sides: $input.sides,
    roll: $roll
  }
}
```

### Generate OTP Code

```xs
query "generate-otp" verb=GET {
  input {}

  stack {
    security.random_number {
      min = 100000
      max = 999999
    } as $otp
  }

  response = {
    otp: $otp
  }
}
// Returns 6-digit code like { "otp": 384729 }
```

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| random-number | 2090 | Random number with configurable range | ✅ Working |

## Related Functions

- `security.random_bytes` - Generate random bytes
- `security.create_uuid` - Generate UUID
