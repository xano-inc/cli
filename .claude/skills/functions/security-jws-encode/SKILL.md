---
name: security-jws-encode
description: XanoScript security.jws_encode function - creates signed JWT tokens using JWS (JSON Web Signature). Use for creating authentication tokens, API tokens, or signed data.
---

# security.jws_encode

Creates a signed JWT (JSON Web Token) using JWS (JSON Web Signature) standard.

## Syntax

```xs
security.jws_encode {
  headers = { "alg": "HS256" }
  claims = { "user_id": "123" }
  key = $signing_key
  signature_algorithm = "HS256"
  ttl = 3600
} as $token
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `headers` | object | Yes | JWT headers (must include "alg") |
| `claims` | object | Yes | Payload data to include in token |
| `key` | JWK object | Yes | Signing key (from create_secret_key) |
| `signature_algorithm` | text | Yes | Algorithm (HS256, HS384, HS512, ES256, etc.) |
| `ttl` | int | Yes | Token time-to-live in seconds |

## Return Value

Returns a signed JWT string (three parts: header.payload.signature).

## Important: Key Format

**Keys must be JWK objects, not strings!** Use `security.create_secret_key` to generate:

```xs
// Generate a JWK key
security.create_secret_key {
  bits = 512
  format = "object"
} as $key

// Use JWK in jws_encode
security.jws_encode {
  key = $key  // NOT a string!
  ...
} as $token
```

## Signature Algorithms

| Algorithm | Key Type | Description |
|-----------|----------|-------------|
| HS256 | oct (symmetric) | HMAC-SHA256 |
| HS384 | oct (symmetric) | HMAC-SHA384 |
| HS512 | oct (symmetric) | HMAC-SHA512 |
| ES256 | EC (P-256) | ECDSA with P-256 |
| ES384 | EC (P-384) | ECDSA with P-384 |
| ES512 | EC (P-521) | ECDSA with P-521 |

## Examples

### Create JWT with HS256

```xs
query "jws-encode" verb=GET {
  input {
    text user_id { description = "User ID" }
    int ttl?=3600 { description = "TTL in seconds" }
  }

  stack {
    // Generate signing key
    security.create_secret_key {
      bits = 512
      format = "object"
    } as $key

    security.jws_encode {
      headers = { "alg": "HS256" }
      claims = {
        user_id: $input.user_id
      }
      key = $key
      signature_algorithm = "HS256"
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
//   "token": "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiMTIzIi...",
//   "key": { "kty": "oct", "k": "..." },
//   "expires_in": 3600
// }
```

### JWT with Custom Claims

```xs
query "create-session" verb=POST {
  input {
    int user_id { description = "User ID" }
    text role { description = "User role" }
  }

  stack {
    security.create_secret_key {
      bits = 512
      format = "object"
    } as $key

    security.jws_encode {
      headers = { "alg": "HS256" }
      claims = {
        sub: $input.user_id,
        role: $input.role,
        iss: "my-app",
        aud: "my-api"
      }
      key = $key
      signature_algorithm = "HS256"
      ttl = 86400
    } as $token

    // Store key for later verification
    db.add "sessions" {
      data = {
        user_id: $input.user_id,
        signing_key: $key,
        created_at: `now`
      }
    } as $session
  }

  response = {
    token: $token,
    session_id: $session.id
  }
}
```

## Auto-Added Claims

When `ttl` is set, the following claims are automatically added:

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
| jws-encode | 2100 | Create signed JWT | Working |

## Related Functions

- `security.jws_decode` - Verify and decode JWT
- `security.create_secret_key` - Generate symmetric signing key
- `security.create_curve_key` - Generate EC signing key
