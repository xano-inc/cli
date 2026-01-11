---
name: security-create-password
description: XanoScript security.create_password function - generates a random password with configurable requirements. Use for user registration, password reset, or generating API keys.
---

# security.create_password

Generates a random password with configurable character requirements.

## Syntax

```xs
security.create_password {
  character_count = 12
  require_lowercase = true
  require_uppercase = true
  require_digit = true
  require_symbol = false
  symbol_whitelist = "!@#$%"
} as $password
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `character_count` | int | Yes | - | Total password length |
| `require_lowercase` | bool | No | false | Include lowercase letters (a-z) |
| `require_uppercase` | bool | No | false | Include uppercase letters (A-Z) |
| `require_digit` | bool | No | false | Include digits (0-9) |
| `require_symbol` | bool | No | false | Include symbols |
| `symbol_whitelist` | text | No | - | Specific symbols to use (e.g., "!@#$%") |

## Return Value

Returns a string containing the generated password stored in the variable specified by `as`.

## Examples

### Basic Usage - 12 Character Password

```xs
query "example" verb=GET {
  input {}

  stack {
    security.create_password {
      character_count = 12
      require_lowercase = true
      require_uppercase = true
      require_digit = true
    } as $password
  }

  response = {
    password: $password
  }
}
// Returns: { "password": "XD9fImRzK57P" }
```

### Strong Password with Symbols

```xs
query "strong-password" verb=GET {
  input {}

  stack {
    security.create_password {
      character_count = 20
      require_lowercase = true
      require_uppercase = true
      require_digit = true
      require_symbol = true
      symbol_whitelist = "!@#$%^&*"
    } as $password
  }

  response = {
    password: $password
  }
}
// Returns: { "password": "TcD#1Z%9aoY0fT7@N!uU" }
```

### Configurable Password Generator

```xs
query "generate-password" verb=GET {
  input {
    int length?=12 { description = "Password length" }
    bool lowercase?=true { description = "Include lowercase letters" }
    bool uppercase?=true { description = "Include uppercase letters" }
    bool digits?=true { description = "Include digits" }
    bool symbols?=false { description = "Include symbols" }
  }

  stack {
    security.create_password {
      character_count = $input.length
      require_lowercase = $input.lowercase
      require_uppercase = $input.uppercase
      require_digit = $input.digits
      require_symbol = $input.symbols
      symbol_whitelist = "!@#$%"
    } as $password
  }

  response = {
    length: $input.length,
    password: $password
  }
}
```

## Common Use Cases

| Use Case | Recommended Settings |
|----------|---------------------|
| User registration | 12 chars, lower+upper+digit |
| Admin password | 16+ chars, all character types |
| API key | 32 chars, alphanumeric only |
| Temporary password | 8 chars, simple for easy typing |

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| create-password | 2092 | Configurable password generator | Working |

## Related Functions

- `security.check_password` - Verify a password against a hash
- `security.random_bytes` - Generate random bytes
- `security.random_number` - Generate random integer
