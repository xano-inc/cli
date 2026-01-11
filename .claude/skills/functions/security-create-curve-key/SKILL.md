---
name: security-create-curve-key
description: XanoScript security.create_curve_key function - generates elliptic curve key pairs for asymmetric cryptography. Use for ECDSA signing, ECDH key exchange, or JWT signing.
---

# security.create_curve_key

Generates an elliptic curve (EC) key pair for asymmetric cryptography.

## Syntax

```xs
security.create_curve_key {
  curve = "P-256"
  format = "object"
} as $key
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `curve` | text | Yes | Elliptic curve type (P-256, P-384, P-521) |
| `format` | text | Yes | Output format ("object") |

## Return Value

Returns a JWK (JSON Web Key) object containing both private and public key components.

### Object Format Structure

```json
{
  "kty": "EC",
  "crv": "P-256",
  "d": "private-key-component",
  "x": "public-key-x-coordinate",
  "y": "public-key-y-coordinate"
}
```

| Field | Description |
|-------|-------------|
| `kty` | Key type - "EC" for Elliptic Curve |
| `crv` | Curve name (P-256, P-384, P-521) |
| `d` | Private key (Base64URL encoded) - KEEP SECRET |
| `x` | Public key X coordinate |
| `y` | Public key Y coordinate |

## Curve Options

| Curve | Key Size | Security Level | Use Case |
|-------|----------|----------------|----------|
| P-256 | 256-bit | ~128-bit | General purpose, JWT ES256 |
| P-384 | 384-bit | ~192-bit | High security, JWT ES384 |
| P-521 | 521-bit | ~256-bit | Maximum security, JWT ES512 |

## Examples

### Generate P-256 Key Pair

```xs
query "create-curve-key" verb=GET {
  input {
    text curve?="P-256" { description = "Curve type" }
  }

  stack {
    security.create_curve_key {
      curve = $input.curve
      format = "object"
    } as $key
  }

  response = {
    curve: $input.curve,
    key: $key
  }
}
// Returns: {
//   "curve": "P-256",
//   "key": {
//     "kty": "EC",
//     "crv": "P-256",
//     "d": "c8YoLEWHWuY49Qe2FbvIpoTA6oiMzBhzRTlJlO_LfqE",
//     "x": "0GVJMqqXmsTUStdcO5NCyFMq6LMPZcyMmp1dCJm3u1I",
//     "y": "8lmDAQdp9Xhve6t0iF2ACBQWQZCMLuSl7ANdoOobMlk"
//   }
// }
```

### Generate and Separate Public/Private Keys

```xs
query "generate-key-pair" verb=GET {
  input {}

  stack {
    security.create_curve_key {
      curve = "P-256"
      format = "object"
    } as $full_key

    // Public key only (for sharing)
    var $public_key {
      value = {
        kty: $full_key.kty,
        crv: $full_key.crv,
        x: $full_key.x,
        y: $full_key.y
      }
    }
  }

  response = {
    private_key: $full_key,
    public_key: $public_key
  }
}
```

### Store Key Pair in Database

```xs
query "create-signing-key" verb=POST {
  input {
    text name { description = "Key name/identifier" }
  }

  stack {
    security.create_curve_key {
      curve = "P-256"
      format = "object"
    } as $key

    security.create_uuid as $key_id

    db.add "signing_keys" {
      data = {
        key_id: $key_id,
        name: $input.name,
        curve: "P-256",
        private_key: $key,
        created_at: `now`
      }
    } as $record
  }

  response = {
    key_id: $key_id,
    name: $input.name,
    public_key: {
      kty: $key.kty,
      crv: $key.crv,
      x: $key.x,
      y: $key.y
    }
  }
}
```

## Important Notes

1. **Asymmetric keys** - Contains both private (d) and public (x, y) components
2. **Never expose private key** - Only share the public key (x, y coordinates)
3. **Format is "object"** - Returns JWK format
4. **Use with JWS/JWE** - Keys work with security.jws_encode/jwe_encode

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| create-curve-key | 2099 | Generate EC key pair | Working |

## Related Functions

- `security.create_secret_key` - Generate symmetric keys
- `security.jws_encode` - Sign data with EC private key
- `security.jws_decode` - Verify signatures with EC public key
