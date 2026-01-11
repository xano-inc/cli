---
name: security-jwe-encode
description: XanoScript security.jwe_encode function - creates encrypted JWT tokens using JWE (JSON Web Encryption). Use for encrypting sensitive data that needs to be transmitted securely.
---

# security.jwe_encode

Creates an encrypted JWT (JSON Web Token) using JWE (JSON Web Encryption) standard.

## Syntax

```xs
security.jwe_encode {
  headers = { "alg": "A256KW" }
  claims = { "data": "secret" }
  key = $encryption_key
  key_algorithm = "A256KW"
  content_algorithm = "A256GCM"
  ttl = 3600
} as $token
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `headers` | object | Yes | JWE headers (includes "alg") |
| `claims` | object | Yes | Payload data to encrypt |
| `key` | JWK object | Yes | Encryption key (from create_secret_key) |
| `key_algorithm` | text | Yes | Key encryption algorithm |
| `content_algorithm` | text | Yes | Content encryption algorithm |
| `ttl` | int | Yes | Token TTL in seconds (0 for no expiration) |

## Return Value

Returns an encrypted JWE token string (five parts separated by dots).

## JWS vs JWE

| Feature | JWS | JWE |
|---------|-----|-----|
| Purpose | Sign (verify integrity) | Encrypt (hide content) |
| Payload visible? | Yes (base64) | No (encrypted) |
| Use case | Auth tokens, signatures | Sensitive data |

## Algorithms

### Key Algorithms (key_algorithm)

| Algorithm | Description |
|-----------|-------------|
| A128KW | AES Key Wrap (128-bit) |
| A192KW | AES Key Wrap (192-bit) |
| A256KW | AES Key Wrap (256-bit) - recommended |

### Content Algorithms (content_algorithm)

| Algorithm | Description |
|-----------|-------------|
| A128GCM | AES-GCM (128-bit) |
| A192GCM | AES-GCM (192-bit) |
| A256GCM | AES-GCM (256-bit) - recommended |

## Examples

### Basic Encryption

```xs
query "jwe-encode" verb=GET {
  input {
    text secret_data { description = "Data to encrypt" }
    int ttl?=3600 { description = "TTL in seconds" }
  }

  stack {
    // Generate encryption key
    security.create_secret_key {
      bits = 512
      format = "object"
    } as $key

    security.jwe_encode {
      headers = { "alg": "A256KW" }
      claims = {
        data: $input.secret_data
      }
      key = $key
      key_algorithm = "A256KW"
      content_algorithm = "A256GCM"
      ttl = $input.ttl
    } as $token
  }

  response = {
    token: $token,
    key: $key,
    expires_in: $input.ttl
  }
}
// Returns: {
//   "token": "eyJhbGciOiJBMjU2S1ciLCJlbmMiOiJBMjU2R0NNIi...",
//   "key": { "kty": "oct", "k": "..." },
//   "expires_in": 3600
// }
```

### Encrypt Sensitive User Data

```xs
query "encrypt-user-data" verb=POST {
  input {
    int user_id { description = "User ID" }
    text ssn { description = "Social Security Number" }
    text credit_card { description = "Credit card number" }
  }

  stack {
    security.create_secret_key {
      bits = 512
      format = "object"
    } as $key

    security.jwe_encode {
      headers = { "alg": "A256KW" }
      claims = {
        user_id: $input.user_id,
        ssn: $input.ssn,
        credit_card: $input.credit_card
      }
      key = $key
      key_algorithm = "A256KW"
      content_algorithm = "A256GCM"
      ttl = 0
    } as $encrypted

    // Store encrypted token and key separately
    db.add "encrypted_data" {
      data = {
        user_id: $input.user_id,
        encrypted_token: $encrypted,
        key_id: "user_" ++ $input.user_id
      }
    } as $record

    // Store key in secure key vault (separate storage)
    db.add "key_vault" {
      data = {
        key_id: "user_" ++ $input.user_id,
        encryption_key: $key
      }
    } as $key_record
  }

  response = {
    stored: true,
    record_id: $record.id
  }
}
```

## Important Notes

1. **Keys must be JWK objects** - Use `security.create_secret_key` to generate
2. **Payload is encrypted** - Cannot read content without the key
3. **Different from JWS** - JWE encrypts content, JWS only signs
4. **Store keys securely** - Keys should be stored separately from encrypted data

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| jwe-encode | 2102 | Create encrypted JWE token | Working |

## Related Functions

- `security.jwe_decode` - Decrypt JWE tokens
- `security.create_secret_key` - Generate encryption key
- `security.jws_encode` - Create signed (not encrypted) tokens
