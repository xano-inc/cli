---
name: security-create-auth-token
description: XanoScript security.create_auth_token function - generates encrypted JWT-style authentication tokens linked to a database table. Use for user login, session management, and API authentication.
---

# security.create_auth_token

Generates an encrypted authentication token linked to a database table record.

## Syntax

```xs
security.create_auth_token {
  table = "users"
  id = $user_id
  expiration = 86400
  extras = {}
} as $token
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `table` | text | Yes | Database table name the token is linked to |
| `id` | int | Yes | Record ID in the table (typically user ID) |
| `expiration` | int | Yes | Token validity in seconds |
| `extras` | object | No | Additional data to embed in token |

## Return Value

Returns an encrypted JWT-style token string stored in the variable specified by `as`.

## Examples

### Basic Auth Token

```xs
query "create-auth-token" verb=GET {
  input {
    int user_id { description = "User ID" }
    int expiration?=86400 { description = "Expiration in seconds" }
  }

  stack {
    security.create_auth_token {
      table = "test_user"
      id = $input.user_id
      expiration = $input.expiration
      extras = {}
    } as $token
  }

  response = {
    user_id: $input.user_id,
    token: $token,
    expires_in: $input.expiration
  }
}
// Returns: { "user_id": 1, "token": "eyJhbGciOiJBMjU2S1ci...", "expires_in": 86400 }
```

### Login Endpoint with Token Generation

```xs
query "login" verb=POST {
  input {
    email email { description = "User email" }
    password password { description = "User password" }
  }

  stack {
    // Find user by email
    db.get "users" {
      field_name = "email"
      field_value = $input.email
    } as $user

    precondition ($user != null) {
      error_type = "unauthorized"
      error = "Invalid credentials"
    }

    // Verify password (using security.check_password)
    security.check_password {
      password = $input.password
      hash = $user.password
    } as $valid

    precondition ($valid == true) {
      error_type = "unauthorized"
      error = "Invalid credentials"
    }

    // Generate token
    security.create_auth_token {
      table = "users"
      id = $user.id
      expiration = 604800
      extras = {
        role: $user.role
      }
    } as $token
  }

  response = {
    token: $token,
    user: {
      id: $user.id,
      email: $user.email,
      name: $user.name
    }
  }
}
```

### Token with Extra Claims

```xs
query "admin-token" verb=POST {
  input {
    int user_id { description = "Admin user ID" }
  }

  stack {
    security.create_auth_token {
      table = "users"
      id = $input.user_id
      expiration = 3600
      extras = {
        role: "admin",
        permissions: ["read", "write", "delete"],
        issued_at: `now`
      }
    } as $token
  }

  response = {
    token: $token,
    expires_in: 3600
  }
}
```

## Common Expiration Values

| Duration | Seconds | Use Case |
|----------|---------|----------|
| 1 hour | 3600 | Admin sessions |
| 24 hours | 86400 | Normal sessions |
| 7 days | 604800 | Remember me |
| 30 days | 2592000 | Mobile apps |

## Important Notes

1. **Table must exist** - The specified table must exist in the database
2. **ID must be valid** - The ID should correspond to an existing record
3. **Extras are embedded** - Data in `extras` is encrypted in the token
4. **Tokens are encrypted** - Use Xano's built-in auth middleware to verify

## Using Tokens for Authentication

Enable authentication on endpoints with `auth = "user"`:

```xs
query "protected-endpoint" verb=GET {
  auth = "user"

  input {}

  stack {
    // $auth.id contains the user ID from the token
    db.get "users" {
      field_name = "id"
      field_value = $auth.id
    } as $user
  }

  response = $user
}
```

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| create-auth-token | 2095 | Generate auth token for user | Working |

## Related Functions

- `security.check_password` - Verify password before generating token
- `security.create_password` - Generate temporary passwords
