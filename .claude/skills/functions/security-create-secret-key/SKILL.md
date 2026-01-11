---
name: security-create-secret-key
description: XanoScript security.create_secret_key function - generates symmetric secret keys for signing and encryption. Use for HMAC signing, symmetric encryption keys, or API secrets.
---

# security.create_secret_key

Generates a symmetric secret key for digital signatures or encryption.

## Syntax

```xs
security.create_secret_key {
  bits = 2048
  format = "object"
} as $key
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `bits` | int | Yes | - | Key size in bits (512, 1024, 2048, 4096) |
| `format` | text | Yes | - | Output format ("object") |

## Return Value

Returns a JWK (JSON Web Key) object stored in the variable specified by `as`.

### Object Format Structure

```json
{
  "kty": "oct",
  "k": "base64url-encoded-key-material"
}
```

| Field | Description |
|-------|-------------|
| `kty` | Key type - "oct" for symmetric/octet keys |
| `k` | Base64URL-encoded key material |

## Examples

### Basic Secret Key Generation

```xs
query "create-secret-key" verb=GET {
  input {
    int bits?=2048 { description = "Key size in bits" }
  }

  stack {
    security.create_secret_key {
      bits = $input.bits
      format = "object"
    } as $key
  }

  response = {
    bits: $input.bits,
    key: $key
  }
}
// Returns: { "bits": 2048, "key": { "kty": "oct", "k": "..." } }
```

### Generate 512-bit Key

```xs
query "small-key" verb=GET {
  input {}

  stack {
    security.create_secret_key {
      bits = 512
      format = "object"
    } as $key
  }

  response = $key
}
// Returns: { "kty": "oct", "k": "GKSJXqhQ26xQ9zqT1ca3iGtMrZjzwmm1g9hSYaxUzAOzDT1JbsRu91FdXTp18cUDGg6_ct_jtMOTXTXQCM_b6g" }
```

### Generate and Store API Key

```xs
query "create-api-key" verb=POST {
  input {
    int user_id { description = "User to generate API key for" }
  }

  stack {
    // Generate secret key
    security.create_secret_key {
      bits = 2048
      format = "object"
    } as $key

    // Store in database
    db.add "api_keys" {
      data = {
        user_id: $input.user_id,
        key_id: `$key.k|slice:0:16`,
        key_secret: $key.k,
        created_at: `now`
      }
    } as $record
  }

  response = {
    key_id: `$key.k|slice:0:16`,
    api_key: $key.k
  }
}
```

## Key Size Recommendations

| Use Case | Recommended Bits |
|----------|-----------------|
| Development/testing | 512 |
| Standard applications | 2048 |
| High security | 4096 |
| HMAC-SHA256 | 256+ |
| HMAC-SHA512 | 512+ |

## Important Notes

1. **Format is "object"** - Only "object" format is supported (returns JWK)
2. **Symmetric key** - Same key used for both signing and verification
3. **Store securely** - Never expose secret keys in responses
4. **Key type is "oct"** - Indicates octet/symmetric key

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| create-secret-key | 2098 | Generate symmetric secret key | Working |

## Related Functions

- `security.create_curve_key` - Generate asymmetric elliptic curve keys
- `security.jws_encode` - Sign data with secret key
- `security.jws_decode` - Verify signatures
