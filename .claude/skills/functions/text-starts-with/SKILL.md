---
name: text-starts-with
description: XanoScript text.starts_with function - checks if a string starts with a specified prefix. Use when you need to validate string prefixes, check URL protocols, or filter strings by their beginning characters.
---

# text.starts_with

Checks if a text string begins with the specified value. Returns `true` if it does, `false` otherwise.

## Syntax

```xs
text.starts_with $variable {
  value = "prefix"
} as $result
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to check (must be a stack variable, NOT `$input.field`) |
| `value` | text | Yes | The prefix to look for |

## Return Value

Returns a boolean stored in the variable specified by `as`:
- `true` if the string starts with the prefix
- `false` otherwise

## Important Notes

1. **Case-sensitive**: `text.starts_with` is case-sensitive. Use `text.istarts_with` for case-insensitive matching.
2. **Requires stack variable**: You CANNOT use `$input.field` directly. Copy input to a variable first.
3. **Result via `as`**: The boolean result must be captured with `as $varname`.

## Examples

### Basic Usage - Match Found

```xs
query "example" verb=GET {
  input {}

  stack {
    var $message { value = "Hello World" }

    text.starts_with $message {
      value = "Hello"
    } as $result
  }

  response = $result
}
// Returns: true
```

### No Match

```xs
query "example" verb=GET {
  input {}

  stack {
    var $message { value = "Hello World" }

    text.starts_with $message {
      value = "World"
    } as $result
  }

  response = $result
}
// Returns: false
```

### Case Sensitivity

```xs
query "example" verb=GET {
  input {}

  stack {
    var $message { value = "Hello World" }

    text.starts_with $message {
      value = "hello"
    } as $lowercase

    text.starts_with $message {
      value = "Hello"
    } as $correct_case
  }

  response = {
    lowercase_match: $lowercase,
    correct_case_match: $correct_case
  }
}
// Returns: { "lowercase_match": false, "correct_case_match": true }
```

### With User Input (Copy to Variable First!)

```xs
query "example" verb=GET {
  input {
    text message { description = "String to check" }
    text prefix { description = "Prefix to look for" }
  }

  stack {
    // CRITICAL: Copy input to stack variable first!
    var $msg { value = $input.message }

    text.starts_with $msg {
      value = $input.prefix
    } as $result
  }

  response = {
    message: $input.message,
    prefix: $input.prefix,
    starts_with: $result
  }
}
```

### With Conditional Logic

```xs
query "example" verb=GET {
  input {
    text url { description = "URL to validate" }
  }

  stack {
    var $url { value = $input.url }

    text.starts_with $url {
      value = "https://"
    } as $is_secure

    conditional {
      if ($is_secure) {
        var $status { value = "Secure URL" }
      }
      else {
        var $status { value = "Insecure URL - use HTTPS" }
      }
    }
  }

  response = {
    url: $input.url,
    is_secure: $is_secure,
    status: $status
  }
}
```

## Common Gotchas

### Cannot Use $input Directly

```xs
// WRONG - Will fail with "Missing var entry: input"
text.starts_with $input.message {
  value = "Hello"
} as $result

// CORRECT - Copy to variable first
var $msg { value = $input.message }
text.starts_with $msg {
  value = "Hello"
} as $result
```

### Case Sensitivity

```xs
// This returns FALSE because starts_with is case-sensitive
var $text { value = "Hello World" }
text.starts_with $text {
  value = "hello"
} as $result

// Use text.istarts_with for case-insensitive matching
text.istarts_with $text {
  value = "hello"
} as $result  // Returns TRUE
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| starts-with-basic | 2072 | Basic true case | ✅ Working |
| starts-with-false | 2073 | Returns false | ✅ Working |
| starts-with-case | 2074 | Case sensitivity demo | ✅ Working |
| starts-with-input | 2075 | User input handling | ✅ Working |

## Related Functions

- `text.istarts_with` - Case-insensitive version
- `text.ends_with` - Check suffix instead of prefix
- `text.contains` - Check if substring exists anywhere
