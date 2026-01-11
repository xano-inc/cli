---
name: security-jwe-decode
description: XanoScript security.jwe_decode function - decrypts JWE tokens to retrieve the original payload. Use for accessing encrypted sensitive data.
---

# security.jwe_decode

Decrypts a JWE (JSON Web Encryption) token to retrieve the original payload.

## Syntax

```xs
security.jwe_decode {
  token = $jwe_token
  key = $decryption_key
  key_algorithm = "A256KW"
  content_algorithm = "A256GCM"
  timeDrift = 60
} as $payload
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | text | Yes | JWE token to decrypt |
| `key` | JWK object | Yes | Decryption key (same key used for encoding) |
| `key_algorithm` | text | Yes | Key algorithm (must match encoding) |
| `content_algorithm` | text | Yes | Content algorithm (must match encoding) |
| `timeDrift` | int | No | Allowed clock drift in seconds |
| `check_claims` | object | No | Optional claims to verify |

## Return Value

Returns the decrypted payload object containing all original claims.

## Examples

### Basic Decryption

```xs
query "jwe-decode" verb=POST {
  input {
    text token { description = "JWE token to decrypt" }
    json key { description = "JWK encryption key" }
  }

  stack {
    security.jwe_decode {
      token = $input.token
      key = $input.key
      key_algorithm = "A256KW"
      content_algorithm = "A256GCM"
      timeDrift = 60
    } as $payload
  }

  response = {
    decrypted: true,
    payload: $payload
  }
}
// Returns: {
//   "decrypted": true,
//   "payload": {
//     "data": "my-sensitive-data",
//     "iat": 1768108197,
//     "nbf": 1768108197,
//     "exp": 1768111797
//   }
// }
```

### Decrypt User Sensitive Data

```xs
query "get-user-sensitive-data" verb=GET {
  input {
    int user_id { description = "User ID" }
  }

  stack {
    // Get encrypted data
    db.get "encrypted_data" {
      field_name = "user_id"
      field_value = $input.user_id
    } as $record

    precondition ($record != null) {
      error_type = "notfound"
      error = "No encrypted data found"
    }

    // Get decryption key from vault
    db.get "key_vault" {
      field_name = "key_id"
      field_value = $record.key_id
    } as $key_record

    // Decrypt
    security.jwe_decode {
      token = $record.encrypted_token
      key = $key_record.encryption_key
      key_algorithm = "A256KW"
      content_algorithm = "A256GCM"
      timeDrift = 0
    } as $decrypted
  }

  response = {
    user_id: $decrypted.user_id,
    ssn: $decrypted.ssn,
    credit_card: $decrypted.credit_card
  }
}
```

### Verify Claims on Decrypt

```xs
query "decrypt-with-verification" verb=POST {
  input {
    text token { description = "JWE token" }
    json key { description = "JWK key" }
    int expected_user_id { description = "Expected user ID in token" }
  }

  stack {
    security.jwe_decode {
      token = $input.token
      key = $input.key
      key_algorithm = "A256KW"
      content_algorithm = "A256GCM"
      check_claims = {
        user_id: $input.expected_user_id
      }
      timeDrift = 60
    } as $payload
  }

  response = $payload
}
// Throws error if user_id in token doesn't match expected
```

## Error Handling

Decryption can fail for several reasons:

| Error | Cause |
|-------|-------|
| Decryption failed | Wrong key |
| Token expired | Current time > exp claim |
| Token not yet valid | Current time < nbf claim |
| Claim mismatch | check_claims validation failed |
| Invalid token | Malformed or tampered token |

## Auto-Added Claims

When `ttl` was set during encoding, these claims are present:

| Claim | Description |
|-------|-------------|
| `iat` | Issued At timestamp |
| `nbf` | Not Before timestamp |
| `exp` | Expiration timestamp |

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| jwe-decode | 2103 | Decrypt JWE token | Working |

## Related Functions

- `security.jwe_encode` - Create encrypted JWE tokens
- `security.create_secret_key` - Generate encryption keys
