---
name: security-random-bytes
description: XanoScript security.random_bytes function - generates cryptographically secure random bytes. Use for generating keys, salts, or initialization vectors.
---

# security.random_bytes

Generates a string of cryptographically secure random bytes.

## Syntax

```xs
security.random_bytes {
  length = 16
} as $bytes
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `length` | int | Yes | Number of random bytes to generate |

## Return Value

Returns a binary string of random bytes stored in the variable specified by `as`.

## Examples

### Basic Usage

```xs
query "example" verb=GET {
  input {}

  stack {
    security.random_bytes {
      length = 16
    } as $bytes
  }

  response = {
    bytes: $bytes
  }
}
// Returns 16 random bytes (binary data)
```

### Generate Initialization Vector (IV)

```xs
query "generate-iv" verb=GET {
  input {}

  stack {
    // AES requires 16-byte IV
    security.random_bytes {
      length = 16
    } as $iv
  }

  response = {
    iv: $iv
  }
}
```

### Generate Salt for Hashing

```xs
query "generate-salt" verb=GET {
  input {}

  stack {
    // 32-byte salt for password hashing
    security.random_bytes {
      length = 32
    } as $salt
  }

  response = {
    salt: $salt
  }
}
```

## Common Use Cases

| Use Case | Recommended Length |
|----------|-------------------|
| AES-128 key | 16 bytes |
| AES-256 key | 32 bytes |
| IV for AES | 16 bytes |
| Salt for hashing | 16-32 bytes |

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| random-bytes | 2091 | Generate random bytes | ✅ Working |

## Related Functions

- `security.random_number` - Generate random integer
- `security.create_uuid` - Generate UUID
- `security.encrypt` - Encrypt data (uses IV)
