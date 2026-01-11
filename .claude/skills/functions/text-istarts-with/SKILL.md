---
name: text-istarts-with
description: XanoScript text.istarts_with function - case-insensitive check if string starts with prefix. Use when you need to check prefixes regardless of case, like protocol validation or case-insensitive search.
---

# text.istarts_with

Case-insensitive check if a text string begins with the specified value. Returns `true` if it does (ignoring case), `false` otherwise.

## Syntax

```xs
text.istarts_with $variable {
  value = "prefix"
} as $result
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to check (must be a stack variable) |
| `value` | text | Yes | The prefix to look for (case is ignored) |

## Return Value

Returns a boolean stored in the variable specified by `as`:
- `true` if the string starts with the prefix (case-insensitive)
- `false` otherwise

## Examples

### Case-Insensitive Matching

```xs
query "example" verb=GET {
  input {}

  stack {
    var $message { value = "Hello World" }

    text.istarts_with $message {
      value = "hello"
    } as $lowercase

    text.istarts_with $message {
      value = "HELLO"
    } as $uppercase

    // Compare with case-sensitive version
    text.starts_with $message {
      value = "hello"
    } as $case_sensitive
  }

  response = {
    istarts_with_lowercase: $lowercase,
    istarts_with_uppercase: $uppercase,
    starts_with_lowercase: $case_sensitive
  }
}
// Returns: { "istarts_with_lowercase": true, "istarts_with_uppercase": true, "starts_with_lowercase": false }
```

### Protocol Validation (Case-Insensitive)

```xs
query "validate-url" verb=GET {
  input {
    text url { description = "URL to check" }
  }

  stack {
    var $url { value = $input.url }

    // Accepts "https://", "HTTPS://", "Https://", etc.
    text.istarts_with $url {
      value = "https://"
    } as $is_secure
  }

  response = {
    url: $input.url,
    is_secure: $is_secure
  }
}
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| istarts-with-test | 2079 | Case-insensitive vs sensitive comparison | ✅ Working |

## Related Functions

- `text.starts_with` - Case-sensitive version
- `text.iends_with` - Case-insensitive suffix check
- `text.icontains` - Case-insensitive contains check
