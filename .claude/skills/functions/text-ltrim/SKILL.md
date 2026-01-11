---
name: text-ltrim
description: XanoScript text.ltrim function - removes characters from the left (beginning) of a string. Use for removing leading whitespace or prefixes.
---

# text.ltrim

Removes specified characters from the beginning (left side) of a text string. Modifies the variable in place.

## Syntax

```xs
text.ltrim $variable {
  value = " "
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to modify (must be a stack variable) |
| `value` | text | Yes | The character(s) to remove from the left (default: space) |

## Return Value

None - modifies the variable in place (no `as $result`).

## Examples

### Basic Usage - Remove Leading Whitespace

```xs
query "example" verb=GET {
  input {}

  stack {
    var $text { value = "   Hello World   " }

    text.ltrim $text {
      value = " "
    }
  }

  response = $text
}
// Returns: "Hello World   " (trailing spaces preserved)
```

### Remove Leading Zeros

```xs
query "remove-leading-zeros" verb=GET {
  input {
    text number { description = "Number with leading zeros" }
  }

  stack {
    var $num { value = $input.number }

    text.ltrim $num {
      value = "0"
    }
  }

  response = {
    original: $input.number,
    trimmed: $num
  }
}
// Input: "000123" -> Returns: "123"
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| ltrim-test | 2086 | Left trim demonstration | ✅ Working |

## Related Functions

- `text.trim` - Remove from both ends
- `text.rtrim` - Remove from right side only
