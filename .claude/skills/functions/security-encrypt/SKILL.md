---
name: security-encrypt
description: XanoScript security.encrypt function - encrypts data using AES or other algorithms. Use for protecting sensitive data at rest or in transit.
---

# security.encrypt

Encrypts data using a specified algorithm, key, and initialization vector.

## Syntax

```xs
security.encrypt {
  data = $plaintext
  algorithm = "aes-256-cbc"
  key = "encryption_key"
  iv = $initialization_vector
} as $encrypted
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | text/binary | Yes | The data to encrypt |
| `algorithm` | text | Yes | Encryption algorithm (e.g., "aes-256-cbc") |
| `key` | text | Yes | Encryption key |
| `iv` | binary | Yes | Initialization vector (16 bytes for AES) |

## Return Value

Returns encrypted binary data stored in the variable specified by `as`. Use `base64_encode` filter for transport.

## Supported Algorithms

| Algorithm | Key Size | IV Size | Notes |
|-----------|----------|---------|-------|
| `aes-128-cbc` | 16 bytes | 16 bytes | AES 128-bit |
| `aes-192-cbc` | 24 bytes | 16 bytes | AES 192-bit |
| `aes-256-cbc` | 32 bytes | 16 bytes | AES 256-bit (recommended) |

## Examples

### Basic Encryption with Base64 Output

```xs
query "encrypt" verb=GET {
  input {
    text plaintext { description = "Text to encrypt" }
    text key?="my-secret-key-1234" { description = "Encryption key" }
  }

  stack {
    // Generate random IV
    security.random_bytes {
      length = 16
    } as $iv

    // Encrypt
    security.encrypt {
      data = $input.plaintext
      algorithm = "aes-256-cbc"
      key = $input.key
      iv = $iv
    } as $encrypted
  }

  response = {
    original: $input.plaintext,
    encrypted: `$encrypted|base64_encode`,
    iv: `$iv|base64_encode`
  }
}
// Returns: { "original": "Hello World", "encrypted": "NQaT0kQuqvNv3OKoDUnzKA==", "iv": "sm0CycLG9roCbd7u2rogWQ==" }
```

### Encrypt Sensitive Data for Storage

```xs
query "store-secret" verb=POST {
  input {
    text secret { description = "Secret to store" }
  }

  stack {
    // Use environment variable for key in production
    var $key { value = "production-secret-key!" }

    security.random_bytes {
      length = 16
    } as $iv

    security.encrypt {
      data = $input.secret
      algorithm = "aes-256-cbc"
      key = $key
      iv = $iv
    } as $encrypted

    // Store encrypted data and IV together
    var $stored {
      value = {
        data: `$encrypted|base64_encode`,
        iv: `$iv|base64_encode`
      }
    }
  }

  response = $stored
}
```

## Important Notes

1. **Always generate a new IV** for each encryption operation
2. **Store the IV with the encrypted data** - it's needed for decryption
3. **IV is not secret** - it can be stored/transmitted in plaintext
4. **Key must match algorithm requirements** - wrong key size causes errors
5. **Output is binary** - use `base64_encode` for JSON responses or storage

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| encrypt-test | 2093 | AES encryption with base64 output | Working |

## Related Functions

- `security.decrypt` - Decrypt encrypted data
- `security.random_bytes` - Generate IV
- `security.create_secret_key` - Generate encryption keys
