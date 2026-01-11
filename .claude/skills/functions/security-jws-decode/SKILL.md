---
name: security-jws-decode
description: XanoScript security.jws_decode function - verifies and decodes JWT tokens. Use for validating authentication tokens and extracting claims.
---

# security.jws_decode

Verifies and decodes a JWT (JSON Web Token) signed with JWS.

## Syntax

```xs
security.jws_decode {
  token = $jwt_token
  key = $signing_key
  signature_algorithm = "HS256"
  timeDrift = 60
} as $payload
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | text | Yes | JWT token to verify and decode |
| `key` | JWK object | Yes | Signing key (same key used for encoding) |
| `signature_algorithm` | text | Yes | Algorithm (must match encoding) |
| `timeDrift` | int | No | Allowed clock drift in seconds (default 0) |
| `check_claims` | object | No | Optional claims to verify |

## Return Value

Returns the decoded payload object containing all claims.

## Examples

### Basic Token Verification

```xs
query "jws-decode" verb=POST {
  input {
    text token { description = "JWT to verify" }
    json key { description = "JWK signing key" }
  }

  stack {
    security.jws_decode {
      token = $input.token
      key = $input.key
      signature_algorithm = "HS256"
      timeDrift = 60
    } as $payload
  }

  response = {
    valid: true,
    payload: $payload
  }
}
// Returns: {
//   "valid": true,
//   "payload": {
//     "user_id": "123",
//     "iat": 1768108013,
//     "nbf": 1768108013,
//     "exp": 1768111613
//   }
// }
```

### Verify with Claim Checking

```xs
query "verify-admin" verb=POST {
  input {
    text token { description = "JWT to verify" }
    json key { description = "JWK signing key" }
  }

  stack {
    security.jws_decode {
      token = $input.token
      key = $input.key
      signature_algorithm = "HS256"
      check_claims = {
        role: "admin"
      }
      timeDrift = 60
    } as $payload
  }

  response = $payload
}
// Throws error if role claim is not "admin"
```

### Protected Endpoint Pattern

```xs
query "protected-resource" verb=GET {
  input {
    text authorization { description = "Bearer token" }
  }

  stack {
    // Extract token from "Bearer xxx" format
    var $token { value = `$input.authorization|replace:'Bearer ':''` }

    // Retrieve signing key from storage
    db.get "app_keys" {
      field_name = "name"
      field_value = "jwt_signing_key"
    } as $stored_key

    // Verify token
    security.jws_decode {
      token = $token
      key = $stored_key.key_data
      signature_algorithm = "HS256"
      timeDrift = 60
    } as $claims

    // Get user from claims
    db.get "users" {
      field_name = "id"
      field_value = $claims.user_id
    } as $user
  }

  response = {
    user: $user,
    claims: $claims
  }
}
```

## Error Handling

Token verification can fail for several reasons:

| Error | Cause |
|-------|-------|
| Invalid signature | Wrong key or tampered token |
| Token expired | Current time > exp claim |
| Token not yet valid | Current time < nbf claim |
| Claim mismatch | check_claims validation failed |

Handle errors with precondition or try/catch patterns.

## Time Drift

The `timeDrift` parameter allows for clock differences between servers:

```xs
security.jws_decode {
  ...
  timeDrift = 60  // Allow 60 seconds of clock drift
} as $payload
```

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| jws-decode | 2101 | Verify and decode JWT | Working |

## Related Functions

- `security.jws_encode` - Create signed JWT
- `security.create_secret_key` - Generate signing key
