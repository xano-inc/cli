---
name: text-rtrim
description: XanoScript text.rtrim function - removes characters from the right (end) of a string. Use for removing trailing whitespace or suffixes.
---

# text.rtrim

Removes specified characters from the end (right side) of a text string. Modifies the variable in place.

## Syntax

```xs
text.rtrim $variable {
  value = " "
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to modify (must be a stack variable) |
| `value` | text | Yes | The character(s) to remove from the right (default: space) |

## Return Value

None - modifies the variable in place (no `as $result`).

## Examples

### Basic Usage - Remove Trailing Whitespace

```xs
query "example" verb=GET {
  input {}

  stack {
    var $text { value = "   Hello World   " }

    text.rtrim $text {
      value = " "
    }
  }

  response = $text
}
// Returns: "   Hello World" (leading spaces preserved)
```

### Remove Trailing Slashes

```xs
query "normalize-path" verb=GET {
  input {
    text path { description = "Path that may have trailing slashes" }
  }

  stack {
    var $normalized { value = $input.path }

    text.rtrim $normalized {
      value = "/"
    }
  }

  response = {
    original: $input.path,
    normalized: $normalized
  }
}
// Input: "/api/users///" -> Returns: "/api/users"
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| rtrim-test | 2087 | Right trim demonstration | ✅ Working |

## Related Functions

- `text.trim` - Remove from both ends
- `text.ltrim` - Remove from left side only
