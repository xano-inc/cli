---
name: text-append
description: XanoScript text.append function - adds text to end of a string variable. Use for building strings, concatenation, or adding suffixes.
---

# text.append

Adds the specified value to the end of a text string. Modifies the variable in place.

## Syntax

```xs
text.append $variable {
  value = "text to add"
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `$variable` | text | Yes | The string variable to modify (must be a stack variable) |
| `value` | text | Yes | The text to append to the end |

## Return Value

None - modifies the variable in place (no `as $result`).

## Important Notes

1. **Modifies in place**: Unlike `starts_with`/`contains`, this function does NOT use `as $result`. It directly modifies the variable.
2. **Requires stack variable**: You CANNOT use `$input.field` directly. Copy input to a variable first.
3. **Chainable**: You can call `text.append` multiple times on the same variable.

## Examples

### Basic Usage

```xs
query "example" verb=GET {
  input {}

  stack {
    var $greeting { value = "Hello" }

    text.append $greeting {
      value = " World"
    }

    text.append $greeting {
      value = "!"
    }
  }

  response = $greeting
}
// Returns: "Hello World!"
```

### Building a URL

```xs
query "build-url" verb=GET {
  input {
    text base_url { description = "Base URL" }
    text path { description = "Path to append" }
  }

  stack {
    var $url { value = $input.base_url }

    text.append $url {
      value = $input.path
    }
  }

  response = {
    url: $url
  }
}
```

### Building a Message

```xs
query "greet" verb=GET {
  input {
    text name { description = "User name" }
  }

  stack {
    var $message { value = "Welcome, " }

    text.append $message {
      value = $input.name
    }

    text.append $message {
      value = "! You have new notifications."
    }
  }

  response = {
    message: $message
  }
}
```

## Common Gotchas

### No `as` Keyword

```xs
// WRONG - append doesn't use 'as'
text.append $greeting {
  value = " World"
} as $result

// CORRECT - modifies variable directly
text.append $greeting {
  value = " World"
}
```

### Cannot Use $input Directly

```xs
// WRONG
text.append $input.message {
  value = " suffix"
}

// CORRECT
var $msg { value = $input.message }
text.append $msg {
  value = " suffix"
}
```

## Test API Group

**API Group:** xs-text (ID: 266)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SXF8d_9M`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| append-test | 2083 | Multiple appends demonstration | ✅ Working |

## Related Functions

- `text.prepend` - Add text to beginning instead
- `text.trim` - Remove whitespace from both ends
