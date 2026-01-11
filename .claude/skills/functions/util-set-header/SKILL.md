---
name: util-set-header
description: XanoScript util.set_header function - sets HTTP response headers. Use for Content-Type, cookies, caching, and custom headers.
---

# util.set_header

Adds or modifies HTTP headers in the API response.

## Syntax

```xs
util.set_header {
  value = "Header-Name: header-value"
  duplicates = "replace"  // or "add"
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | text | Yes | Header in format `Name: value` |
| `duplicates` | text | No | How to handle duplicates: `"replace"` or `"add"` |

## Return Value

None - modifies response headers directly.

## Examples

### Set Content-Type for HTML

```xs
query "html-page" verb=GET {
  input {}

  stack {
    util.set_header {
      value = "Content-Type: text/html"
      duplicates = "replace"
    }
  }

  response = "<html><body><h1>Hello!</h1></body></html>"
}
```

### Set Cookie Header

```xs
query "set-cookie" verb=POST {
  input {
    text session_id { description = "Session ID" }
  }

  stack {
    util.set_header {
      value = `"Set-Cookie: sessionId=" ~ $input.session_id ~ "; HttpOnly; Secure; SameSite=Strict"`
      duplicates = "replace"
    }
  }

  response = { success: true }
}
```

### Cache Control

```xs
query "cached-data" verb=GET {
  input {}

  stack {
    util.set_header {
      value = "Cache-Control: public, max-age=3600"
      duplicates = "replace"
    }
  }

  response = { data: "This can be cached for 1 hour" }
}
```

### Multiple Headers

```xs
query "custom-headers" verb=GET {
  input {}

  stack {
    util.set_header {
      value = "X-Custom-Header: my-value"
    }

    util.set_header {
      value = "X-Request-Id: abc123"
    }
  }

  response = { status: "ok" }
}
```

## Common Headers

| Header | Purpose | Example |
|--------|---------|---------|
| `Content-Type` | Response format | `text/html`, `application/xml` |
| `Set-Cookie` | Set browser cookie | `name=value; HttpOnly` |
| `Cache-Control` | Caching behavior | `no-cache`, `max-age=3600` |
| `Location` | Redirect URL | `https://example.com` |
| `X-*` | Custom headers | `X-Api-Version: 1.0` |

## Important Notes

1. **Format** - Must be `Header-Name: value` format
2. **Duplicates** - Use `"replace"` to overwrite, `"add"` for multiple values
3. **No return value** - This is a void function
4. **Order matters** - Set headers before response

## Test API Group

**API Group:** xs-util (ID: 269)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:3KzrYiuB`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| set-header | 2128 | Set Content-Type header | Working |

## Related Functions

- `util.template_engine` - Generate HTML content
