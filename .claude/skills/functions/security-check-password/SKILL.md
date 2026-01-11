---
name: security-check-password
description: XanoScript security.check_password function - verifies a plain text password against a stored hash. Use for login authentication and password validation.
---

# security.check_password

Verifies if a plain-text password matches a stored password hash.

## Syntax

```xs
security.check_password {
  text_password = $plain_password
  hash_password = $stored_hash
} as $is_valid
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text_password` | text | Yes | Plain text password to verify |
| `hash_password` | text | Yes | Stored password hash to compare against |

## Return Value

Returns a boolean (`true` if passwords match, `false` otherwise) stored in the variable specified by `as`.

## How Password Hashing Works in Xano

Xano automatically hashes passwords when using the `password` input type:

```xs
input {
  password user_password { description = "User's password" }
}
// $input.user_password is automatically hashed
```

## Examples

### Hash a Password (Using password input type)

```xs
query "hash-password" verb=POST {
  input {
    password plaintext { description = "Password to hash" }
  }

  stack {}

  response = {
    hashed: $input.plaintext
  }
}
// Input: { "plaintext": "MySecretPassword123" }
// Returns: { "hashed": "60720ef0d0b9afcb.5d413e53eb5103949f53f131d47ae7509accbfdf31fd81381bac24c7f55390d4" }
```

### Check a Password

```xs
query "check-password" verb=POST {
  input {
    text plaintext { description = "Plain text password to check" }
    text hash { description = "Hashed password to compare against" }
  }

  stack {
    security.check_password {
      text_password = $input.plaintext
      hash_password = $input.hash
    } as $is_valid
  }

  response = {
    valid: $is_valid
  }
}
// Correct password: { "valid": true }
// Wrong password: { "valid": false }
```

### Complete Login Endpoint

```xs
query "login" verb=POST {
  input {
    email email { description = "User email" }
    text password { description = "User password (plain text)" }
  }

  stack {
    // Find user by email
    db.get "users" {
      field_name = "email"
      field_value = $input.email
    } as $user

    precondition ($user != null) {
      error_type = "unauthorized"
      error = "Invalid email or password"
    }

    // Verify password
    security.check_password {
      text_password = $input.password
      hash_password = $user.password
    } as $valid

    precondition ($valid == true) {
      error_type = "unauthorized"
      error = "Invalid email or password"
    }

    // Generate auth token on success
    security.create_auth_token {
      table = "users"
      id = $user.id
      expiration = 86400
      extras = {}
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

### User Registration with Password Hashing

```xs
query "register" verb=POST {
  input {
    text name { description = "User's name" }
    email email { description = "User's email" }
    password password { description = "User's password (auto-hashed)" }
  }

  stack {
    // Check if email already exists
    db.get "users" {
      field_name = "email"
      field_value = $input.email
    } as $existing

    precondition ($existing == null) {
      error_type = "conflict"
      error = "Email already registered"
    }

    // Create user - password is already hashed via input type
    db.add "users" {
      data = {
        name: $input.name,
        email: $input.email,
        password: $input.password
      }
    } as $user
  }

  response = {
    id: $user.id,
    name: $user.name,
    email: $user.email
  }
}
```

## Important Notes

1. **password input type auto-hashes** - Use `password` type for registration
2. **text input type for login** - Use `text` type when checking (don't double-hash)
3. **Never return password hashes** - Filter from API responses
4. **Same generic error** - Use same error message for wrong email/password

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| hash-password | 2096 | Hash a password using password input type | Working |
| check-password | 2097 | Verify password against hash | Working |

## Related Functions

- `security.create_auth_token` - Generate token after successful login
- `security.create_password` - Generate random passwords
