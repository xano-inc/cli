---
name: text-contains
description: XanoScript text.contains function - checks if a string contains a substring. Use for searching within strings, log parsing, or content filtering.
---

# text.contains

Checks if a text string contains the specified substring. Returns `true` if found, `false` otherwise.

## Syntax

```xs
text.contains $variable {
  value = "substring"
} as $result
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to search in (must be a stack variable) |
| `value` | text | Yes | The substring to look for |

## Return Value

Returns a boolean stored in the variable specified by `as`:
- `true` if the substring is found anywhere in the string
- `false` otherwise

## Important Notes

1. **Case-sensitive**: `text.contains` is case-sensitive. Use `text.icontains` for case-insensitive matching.
2. **Requires stack variable**: You CANNOT use `$input.field` directly. Copy input to a variable first.

## Examples

### Basic Usage

```xs
query "example" verb=GET {
  input {}

  stack {
    var $log { value = "ERROR: Connection failed at 10:30" }

    text.contains $log {
      value = "ERROR"
    } as $has_error

    text.contains $log {
      value = "WARNING"
    } as $has_warning

    // Case-sensitive - "error" won't match "ERROR"
    text.contains $log {
      value = "error"
    } as $lowercase_error
  }

  response = {
    has_error: $has_error,
    has_warning: $has_warning,
    lowercase_error: $lowercase_error
  }
}
// Returns: { "has_error": true, "has_warning": false, "lowercase_error": false }
```

### Log Level Detection

```xs
query "check-log" verb=GET {
  input {
    text log_entry { description = "Log line to check" }
  }

  stack {
    var $log { value = $input.log_entry }

    text.contains $log {
      value = "ERROR"
    } as $is_error

    text.contains $log {
      value = "WARN"
    } as $is_warning

    text.contains $log {
      value = "INFO"
    } as $is_info

    conditional {
      if ($is_error) {
        var $level { value = "error" }
      }
      elseif ($is_warning) {
        var $level { value = "warning" }
      }
      elseif ($is_info) {
        var $level { value = "info" }
      }
      else {
        var $level { value = "unknown" }
      }
    }
  }

  response = {
    log: $input.log_entry,
    level: $level
  }
}
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| contains-test | 2081 | Basic contains with case sensitivity | ✅ Working |

## Related Functions

- `text.icontains` - Case-insensitive version
- `text.starts_with` - Check if string starts with prefix
- `text.ends_with` - Check if string ends with suffix
