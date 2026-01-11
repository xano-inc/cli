---
name: text-ends-with
description: XanoScript text.ends_with function - checks if a string ends with a specified suffix. Use when validating file extensions, URL domains, or filtering strings by their ending characters.
---

# text.ends_with

Checks if a text string ends with the specified value. Returns `true` if it does, `false` otherwise.

## Syntax

```xs
text.ends_with $variable {
  value = "suffix"
} as $result
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to check (must be a stack variable, NOT `$input.field`) |
| `value` | text | Yes | The suffix to look for |

## Return Value

Returns a boolean stored in the variable specified by `as`:
- `true` if the string ends with the suffix
- `false` otherwise

## Important Notes

1. **Case-sensitive**: `text.ends_with` is case-sensitive. Use `text.iends_with` for case-insensitive matching.
2. **Requires stack variable**: You CANNOT use `$input.field` directly. Copy input to a variable first.
3. **Result via `as`**: The boolean result must be captured with `as $varname`.

## Examples

### Basic Usage - Match Found

```xs
query "example" verb=GET {
  input {}

  stack {
    var $url { value = "https://example.com" }

    text.ends_with $url {
      value = ".com"
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
    var $filename { value = "document.pdf" }

    text.ends_with $filename {
      value = ".txt"
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
    var $filename { value = "Report.PDF" }

    text.ends_with $filename {
      value = ".pdf"
    } as $lowercase

    text.ends_with $filename {
      value = ".PDF"
    } as $uppercase
  }

  response = {
    lowercase_match: $lowercase,
    uppercase_match: $uppercase
  }
}
// Returns: { "lowercase_match": false, "uppercase_match": true }
```

### File Extension Validation

```xs
query "validate-file" verb=GET {
  input {
    text filename { description = "File to validate" }
  }

  stack {
    var $file { value = $input.filename }

    text.ends_with $file {
      value = ".pdf"
    } as $is_pdf

    text.ends_with $file {
      value = ".jpg"
    } as $is_jpg

    text.ends_with $file {
      value = ".png"
    } as $is_png

    conditional {
      if ($is_pdf) {
        var $type { value = "document" }
      }
      elseif ($is_jpg || $is_png) {
        var $type { value = "image" }
      }
      else {
        var $type { value = "unknown" }
      }
    }
  }

  response = {
    filename: $input.filename,
    file_type: $type
  }
}
```

## Common Gotchas

### Cannot Use $input Directly

```xs
// WRONG - Will fail with "Missing var entry: input"
text.ends_with $input.filename {
  value = ".pdf"
} as $result

// CORRECT - Copy to variable first
var $file { value = $input.filename }
text.ends_with $file {
  value = ".pdf"
} as $result
```

### Case Sensitivity

```xs
// This returns FALSE because ends_with is case-sensitive
var $file { value = "Document.PDF" }
text.ends_with $file {
  value = ".pdf"
} as $result  // Returns false

// Use text.iends_with for case-insensitive matching
text.iends_with $file {
  value = ".pdf"
} as $result  // Returns true
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| ends-with-basic | 2076 | Basic true case | ✅ Working |
| ends-with-false | 2077 | Returns false | ✅ Working |
| ends-with-case | 2078 | Case sensitivity demo | ✅ Working |

## Related Functions

- `text.iends_with` - Case-insensitive version
- `text.starts_with` - Check prefix instead of suffix
- `text.contains` - Check if substring exists anywhere
