# Authentication & Security in Xano

Use this skill when implementing authentication endpoints, securing APIs, or working with user sessions in Xano.

---

## Prerequisites: Enable Auth on User Table

**CRITICAL:** The user table MUST have `auth = true` for authentication to work.

```xs
table user {
  auth = true    // <-- REQUIRED for auth endpoints

  schema {
    int id
    timestamp created_at?=now
    text email?
    password password?    // <-- Must be 'password' type
    text name?
    enum role? {
      values = ["admin", "sales_rep"]
    }
  }
}
```

**Key Points:**
- `auth = true` enables Xano's built-in auth system for this table
- `password` column type auto-hashes on insert
- Password field is never returned in API responses

---

## Authentication Functions

| Function | Purpose |
|----------|---------|
| `security.create_auth_token` | Generate JWT after login/signup |
| `security.check_password` | Verify password against hash |
| `$auth` | Access authenticated user in protected endpoints |

---

## Endpoint Patterns

### POST /auth/signup

Creates a new user and returns an auth token.

```xs
query "auth/signup" verb=POST {
  api_group = "authentication"

  input {
    text email?
    password password?    // <-- password type, not text
    text name?
  }

  stack {
    // Check if email already exists
    db.get user {
      field_name = "email"
      field_value = $input.email
    } as $existing_user

    precondition ($existing_user == null) {
      error_type = "accessdenied"
      error = "This account is already in use."
    }

    // Create user (password auto-hashed due to column type)
    db.add user {
      data = {
        created_at: "now"
        email     : $input.email
        password  : $input.password
        name      : $input.name
      }
    } as $user

    // Generate auth token
    security.create_auth_token {
      table = "user"
      id = $user.id
      extras = {}
      expiration = 86400    // 24 hours in seconds
    } as $authToken
  }

  response = {authToken: $authToken}
}
```

**Notes:**
- Input `password` uses type `password` (not `text`) for proper handling
- `security.create_auth_token` generates a JWT
- `expiration` is in seconds (86400 = 24 hours)
- `extras` can include custom claims like `{role: $user.role}`

---

### POST /auth/login

Verifies credentials and returns an auth token.

```xs
query "auth/login" verb=POST {
  api_group = "authentication"

  input {
    text email?
    text password?    // <-- text type for login (raw password)
  }

  stack {
    // Find user by email (include password hash for verification)
    db.get user {
      field_name = "email"
      field_value = $input.email
      output = ["id", "created_at", "name", "email", "password"]
    } as $user

    precondition ($user != null) {
      error = "Invalid Credentials."
    }

    // Verify password against stored hash
    security.check_password {
      text_password = $input.password
      hash_password = $user.password
    } as $pass_result

    precondition ($pass_result) {
      error = "Invalid Credentials."
    }

    // Generate auth token
    security.create_auth_token {
      table = "user"
      id = $user.id
      extras = {}
      expiration = 86400
    } as $authToken
  }

  response = {authToken: $authToken}
}
```

**Notes:**
- Login uses `text` type for password input (raw password to verify)
- Must explicitly include `password` in `output` array to get the hash
- `security.check_password` compares raw password with stored hash
- Use same generic error message for both "user not found" and "wrong password" (security best practice)

---

### GET /auth/me (Protected Endpoint)

Returns the authenticated user's profile.

```xs
query "auth/me" verb=GET {
  api_group = "authentication"
  auth = "user"    // <-- Requires valid auth token for "user" table

  input {
    // No input needed - user comes from token
  }

  stack {
    // $auth.id is automatically populated from the token
    db.get user {
      field_name = "id"
      field_value = $auth.id
      output = ["id", "created_at", "email", "name", "role"]
    } as $user
  }

  response = $user
}
```

**Notes:**
- `auth = "user"` makes this endpoint require a valid token
- `$auth` object is automatically populated from the JWT
- `$auth.id` contains the user ID from the token
- Exclude `password` from output array

---

## Protecting Other Endpoints

Any endpoint can require authentication by adding `auth = "table_name"`:

```xs
query "deals" verb=GET {
  auth = "user"    // <-- Requires authentication

  input {
    int page?=1
  }

  stack {
    // Filter by authenticated user
    db.query deal {
      where = {owner_id: $auth.id}
      return = {type: "list"}
    } as $deals
  }

  response = $deals
}
```

**The `$auth` object contains:**
- `$auth.id` - User ID from token
- Any `extras` fields added during token creation

---

## Token Configuration

### Token Expiration Strategies

| Strategy | Seconds | Use Case |
|----------|---------|----------|
| Short-lived | 900 (15 min) | High security, requires refresh |
| Medium | 86400 (24 hrs) | Balance of security/UX |
| Long-lived | 604800 (7 days) | Mobile apps, "remember me" |
| Extended | 2592000 (30 days) | Trusted devices |

### Adding Custom Claims (Extras)

```xs
security.create_auth_token {
  table = "user"
  id = $user.id
  expiration = 86400
  extras = {
    role: $user.role,
    permissions: ["read", "write"]
  }
} as $authToken
```

Access in protected endpoints: `$auth.role`, `$auth.permissions`

---

## Security Best Practices

### 1. Generic Error Messages
```xs
// GOOD - Same message for both cases
precondition ($user != null) {
  error = "Invalid Credentials."
}
precondition ($pass_result) {
  error = "Invalid Credentials."
}

// BAD - Reveals which part failed
precondition ($user != null) {
  error = "User not found."    // Tells attacker email doesn't exist
}
```

### 2. Never Return Password
```xs
// GOOD - Explicit output without password
db.get user {
  field_name = "id"
  field_value = $auth.id
  output = ["id", "email", "name", "role"]
} as $user

// BAD - Returns all fields including password hash
db.get user {
  field_name = "id"
  field_value = $auth.id
} as $user
```

### 3. Authorization Checks
```xs
// Ensure user can only access their own resources
db.get deal {
  field_name = "id"
  field_value = $input.deal_id
} as $deal

precondition ($deal.owner_id == $auth.id) {
  error_type = "accessdenied"
  error = "You don't have access to this deal."
}
```

### 4. Role-Based Access
```xs
// Admin-only endpoint
precondition ($auth.role == "admin") {
  error_type = "accessdenied"
  error = "Admin access required."
}
```

---

## API Group Configuration

Auth endpoints are in API group 220 (`authentication`):

| Endpoint | ID | Description |
|----------|-----|-------------|
| POST /auth/signup | 1781 | Register new user |
| POST /auth/login | 1780 | Login and get token |
| GET /auth/me | 1782 | Get current user profile |

**API Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:authentication`

---

## Testing Auth Endpoints

### 1. Signup
```bash
curl -X POST https://xhib-njau-6vza.d2.dev.xano.io/api:authentication/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "secret123", "name": "Test User"}'
```

### 2. Login
```bash
curl -X POST https://xhib-njau-6vza.d2.dev.xano.io/api:authentication/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "secret123"}'
```

### 3. Get Profile (with token)
```bash
curl https://xhib-njau-6vza.d2.dev.xano.io/api:authentication/auth/me \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

---

## Troubleshooting

### "Invalid Credentials" on login
- Check email exists in database
- Verify password column is type `password` (not `text`)
- Ensure `security.check_password` has correct parameter order

### "Unauthorized" on protected endpoint
- Check token is sent in `Authorization: Bearer <token>` header
- Verify token hasn't expired
- Confirm endpoint has `auth = "user"` set

### Token not working after signup
- Ensure user table has `auth = true`
- Verify `security.create_auth_token` uses correct table name
- Check user ID is passed correctly

### "This account is already in use"
- Email already exists - expected behavior
- To allow re-registration, delete existing user first

---

## Related Skills
- [sql-lambda-patterns](../sql-lambda-patterns/SKILL.md) - Writing endpoint logic
- [security](../../rules/security.md) - General security rules
