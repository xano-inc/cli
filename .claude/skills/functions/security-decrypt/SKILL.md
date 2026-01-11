---
name: security-decrypt
description: XanoScript security.decrypt function - decrypts data encrypted with security.encrypt. Use for retrieving protected data.
---

# security.decrypt

Decrypts data that was encrypted using `security.encrypt`.

## Syntax

```xs
security.decrypt {
  data = $encrypted_data
  algorithm = "aes-256-cbc"
  key = "encryption_key"
  iv = $initialization_vector
} as $decrypted
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | binary | Yes | The encrypted data to decrypt |
| `algorithm` | text | Yes | Must match the encryption algorithm |
| `key` | text | Yes | Must match the encryption key |
| `iv` | binary | Yes | Must match the IV used for encryption |

## Return Value

Returns the decrypted plaintext stored in the variable specified by `as`.

## Examples

### Basic Decryption with Base64 Input

```xs
query "decrypt" verb=GET {
  input {
    text encrypted { description = "Encrypted data (base64)" }
    text key?="my-secret-key-1234" { description = "Decryption key" }
    text iv { description = "IV (base64)" }
  }

  stack {
    // Decode base64 inputs to binary
    var $encrypted_raw { value = `$input.encrypted|base64_decode` }
    var $iv_raw { value = `$input.iv|base64_decode` }

    security.decrypt {
      data = $encrypted_raw
      algorithm = "aes-256-cbc"
      key = $input.key
      iv = $iv_raw
    } as $decrypted
  }

  response = {
    encrypted: $input.encrypted,
    decrypted: $decrypted
  }
}
// Input: encrypted=NQaT0kQuqvNv3OKoDUnzKA==, iv=sm0CycLG9roCbd7u2rogWQ==
// Returns: { "encrypted": "NQaT0kQuqvNv3OKoDUnzKA==", "decrypted": "Hello World" }
```

### Retrieve and Decrypt Stored Secret

```xs
query "get-secret" verb=GET {
  input {
    int id { description = "Secret record ID" }
  }

  stack {
    // Fetch stored encrypted data
    db.get "secrets" {
      field_name = "id"
      field_value = $input.id
    } as $record

    precondition ($record != null) {
      error_type = "notfound"
      error = "Secret not found"
    }

    // Decode from base64
    var $encrypted_raw { value = `$record.encrypted_data|base64_decode` }
    var $iv_raw { value = `$record.iv|base64_decode` }

    // Use environment variable for key in production
    var $key { value = "production-secret-key!" }

    security.decrypt {
      data = $encrypted_raw
      algorithm = "aes-256-cbc"
      key = $key
      iv = $iv_raw
    } as $secret
  }

  response = {
    id: $record.id,
    secret: $secret
  }
}
```

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Decryption failed | Wrong key | Verify key matches encryption |
| Invalid IV | Wrong IV or size | Use exact IV from encryption |
| Invalid data | Corrupted or wrong format | Ensure base64 decode if needed |

## Important Notes

1. **Algorithm must match** - Use same algorithm as encryption
2. **Key must match exactly** - Including any whitespace
3. **IV must match exactly** - Use the IV stored with encrypted data
4. **Decode base64 first** - If data was encoded for transport

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| decrypt-test | 2094 | AES decryption with base64 input | Working |

## Related Functions

- `security.encrypt` - Encrypt data
- `security.random_bytes` - Generate IV
