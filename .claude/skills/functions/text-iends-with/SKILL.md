---
name: text-iends-with
description: XanoScript text.iends_with function - case-insensitive check if string ends with suffix. Use when validating file extensions regardless of case, like .PDF/.pdf/.Pdf.
---

# text.iends_with

Case-insensitive check if a text string ends with the specified value. Returns `true` if it does (ignoring case), `false` otherwise.

## Syntax

```xs
text.iends_with $variable {
  value = "suffix"
} as $result
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to check (must be a stack variable) |
| `value` | text | Yes | The suffix to look for (case is ignored) |

## Return Value

Returns a boolean stored in the variable specified by `as`:
- `true` if the string ends with the suffix (case-insensitive)
- `false` otherwise

## Examples

### Case-Insensitive Matching

```xs
query "example" verb=GET {
  input {}

  stack {
    var $filename { value = "Report.PDF" }

    text.iends_with $filename {
      value = "pdf"
    } as $lowercase

    text.iends_with $filename {
      value = ".PDF"
    } as $uppercase

    // Compare with case-sensitive version
    text.ends_with $filename {
      value = ".pdf"
    } as $case_sensitive
  }

  response = {
    iends_with_lowercase: $lowercase,
    iends_with_uppercase: $uppercase,
    ends_with_lowercase: $case_sensitive
  }
}
// Returns: { "iends_with_lowercase": true, "iends_with_uppercase": true, "ends_with_lowercase": false }
```

### File Extension Validation (Case-Insensitive)

```xs
query "validate-image" verb=GET {
  input {
    text filename { description = "File to validate" }
  }

  stack {
    var $file { value = $input.filename }

    // Accepts .jpg, .JPG, .Jpg, etc.
    text.iends_with $file {
      value = ".jpg"
    } as $is_jpg

    text.iends_with $file {
      value = ".png"
    } as $is_png

    text.iends_with $file {
      value = ".gif"
    } as $is_gif

    var $is_image { value = `$is_jpg || $is_png || $is_gif` }
  }

  response = {
    filename: $input.filename,
    is_valid_image: $is_image
  }
}
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| iends-with-test | 2080 | Case-insensitive vs sensitive comparison | ✅ Working |

## Related Functions

- `text.ends_with` - Case-sensitive version
- `text.istarts_with` - Case-insensitive prefix check
- `text.icontains` - Case-insensitive contains check
