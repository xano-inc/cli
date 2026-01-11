---
name: text-prepend
description: XanoScript text.prepend function - adds text to beginning of a string variable. Use for adding prefixes or building strings from the front.
---

# text.prepend

Adds the specified value to the beginning of a text string. Modifies the variable in place.

## Syntax

```xs
text.prepend $variable {
  value = "text to add"
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to modify (must be a stack variable) |
| `value` | text | Yes | The text to prepend to the beginning |

## Return Value

None - modifies the variable in place (no `as $result`).

## Important Notes

1. **Modifies in place**: Unlike `starts_with`/`contains`, this function does NOT use `as $result`. It directly modifies the variable.
2. **Requires stack variable**: You CANNOT use `$input.field` directly. Copy input to a variable first.
3. **Chainable**: You can call `text.prepend` multiple times on the same variable.

## Examples

### Basic Usage

```xs
query "example" verb=GET {
  input {}

  stack {
    var $message { value = "World" }

    text.prepend $message {
      value = "Hello "
    }

    text.prepend $message {
      value = ">>> "
    }
  }

  response = $message
}
// Returns: ">>> Hello World"
```

### Adding Prefixes

```xs
query "format-id" verb=GET {
  input {
    text id { description = "Raw ID" }
  }

  stack {
    var $formatted_id { value = $input.id }

    text.prepend $formatted_id {
      value = "ID-"
    }
  }

  response = {
    original: $input.id,
    formatted: $formatted_id
  }
}
```

### Log Formatting

```xs
query "log" verb=GET {
  input {
    text message { description = "Log message" }
    text level { description = "Log level (INFO, WARN, ERROR)" }
  }

  stack {
    var $log { value = $input.message }

    // Add timestamp prefix
    text.prepend $log {
      value = "] "
    }

    var $level_prefix { value = $input.level }
    text.prepend $level_prefix {
      value = "["
    }
    text.append $level_prefix {
      value = $log
    }
  }

  response = {
    formatted_log: $level_prefix
  }
}
```

## Common Gotchas

### No `as` Keyword

```xs
// WRONG - prepend doesn't use 'as'
text.prepend $message {
  value = "prefix: "
} as $result

// CORRECT - modifies variable directly
text.prepend $message {
  value = "prefix: "
}
```

### Cannot Use $input Directly

```xs
// WRONG
text.prepend $input.message {
  value = "prefix: "
}

// CORRECT
var $msg { value = $input.message }
text.prepend $msg {
  value = "prefix: "
}
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| prepend-test | 2084 | Multiple prepends demonstration | ✅ Working |

## Related Functions

- `text.append` - Add text to end instead
- `text.trim` - Remove whitespace from both ends
