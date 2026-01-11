---
name: text-trim
description: XanoScript text.trim function - removes characters from both ends of a string. Use for cleaning user input or removing whitespace.
---

# text.trim

Removes specified characters from both the beginning and end of a text string. Modifies the variable in place.

## Syntax

```xs
text.trim $variable {
  value = " "
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to modify (must be a stack variable) |
| `value` | text | Yes | The character(s) to remove from both ends (default: space) |

## Return Value

None - modifies the variable in place (no `as $result`).

## Examples

### Basic Usage - Remove Whitespace

```xs
query "example" verb=GET {
  input {}

  stack {
    var $text { value = "   Hello World   " }

    text.trim $text {
      value = " "
    }
  }

  response = $text
}
// Returns: "Hello World"
```

### Clean User Input

```xs
query "clean-input" verb=GET {
  input {
    text user_input { description = "User provided text" }
  }

  stack {
    var $cleaned { value = $input.user_input }

    text.trim $cleaned {
      value = " "
    }
  }

  response = {
    original: $input.user_input,
    cleaned: $cleaned
  }
}
```

### Remove Custom Characters

```xs
query "remove-dashes" verb=GET {
  input {}

  stack {
    var $code { value = "---ABC123---" }

    text.trim $code {
      value = "-"
    }
  }

  response = $code
}
// Returns: "ABC123"
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| trim-test | 2085 | Basic trim demonstration | ✅ Working |

## Related Functions

- `text.ltrim` - Remove from left side only
- `text.rtrim` - Remove from right side only
- `text.append` - Add text to end
- `text.prepend` - Add text to beginning
