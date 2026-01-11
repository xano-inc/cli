---
name: text-icontains
description: XanoScript text.icontains function - case-insensitive check if string contains substring. Use for flexible searching where case doesn't matter.
---

# text.icontains

Case-insensitive check if a text string contains the specified substring. Returns `true` if found (ignoring case), `false` otherwise.

## Syntax

```xs
text.icontains $variable {
  value = "substring"
} as $result
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to search in (must be a stack variable) |
| `value` | text | Yes | The substring to look for (case is ignored) |

## Return Value

Returns a boolean stored in the variable specified by `as`:
- `true` if the substring is found (case-insensitive)
- `false` otherwise

## Examples

### Case-Insensitive Matching

```xs
query "example" verb=GET {
  input {}

  stack {
    var $log { value = "ERROR: Connection failed at 10:30" }

    // Finds "error" in "ERROR"
    text.icontains $log {
      value = "error"
    } as $has_error

    // Finds "CONNECTION" in "Connection"
    text.icontains $log {
      value = "CONNECTION"
    } as $has_connection

    // Compare with case-sensitive
    text.contains $log {
      value = "error"
    } as $case_sensitive
  }

  response = {
    icontains_error: $has_error,
    icontains_connection: $has_connection,
    contains_error_case_sensitive: $case_sensitive
  }
}
// Returns: { "icontains_error": true, "icontains_connection": true, "contains_error_case_sensitive": false }
```

### Flexible Search

```xs
query "search" verb=GET {
  input {
    text text { description = "Text to search" }
    text query { description = "Search query" }
  }

  stack {
    var $text { value = $input.text }

    // Case-insensitive search
    text.icontains $text {
      value = $input.query
    } as $found
  }

  response = {
    text: $input.text,
    query: $input.query,
    found: $found
  }
}
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| icontains-test | 2082 | Case-insensitive vs sensitive comparison | ✅ Working |

## Related Functions

- `text.contains` - Case-sensitive version
- `text.istarts_with` - Case-insensitive prefix check
- `text.iends_with` - Case-insensitive suffix check
