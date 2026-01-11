# query

The `query` block defines an API endpoint for handling HTTP requests. It is the fundamental building block for creating REST APIs in XanoScript.

## Syntax

```xs
query "endpoint-name" verb=GET {
  description = "What this endpoint does"
  auth = "user"  // Optional: table name for auth

  input {
    // Request parameters
  }

  stack {
    // Processing logic
  }

  response = $result

  history = 100  // Optional: request logging
}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name` | Yes | Endpoint path (e.g., `"products"`, `"users/{id}"`) |
| `verb` | Yes | HTTP method: `GET`, `POST`, `PATCH`, `PUT`, `DELETE` |
| `description` | No | Documentation for the endpoint |
| `auth` | No | Table name for JWT authentication (e.g., `"user"`) |
| `input` | Yes | Block defining request parameters (can be empty) |
| `stack` | Yes | Block containing processing logic |
| `response` | Yes | Value or variable to return |
| `history` | No | Request logging: number, `"all"`, `"inherit"`, or `false` |

## Test Endpoints

**API Group:** xs-query (ID: 229)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:2k_c2-dM`

### 1. Basic GET Query

**Endpoint:** `GET /query/get-example` (ID: 1887)

```xs
query "query/get-example" verb=GET {
  description = "Basic GET query with query parameters"

  input {
    text search? {
      description = "Search term"
    }
    int limit?=10 {
      description = "Max results"
    }
  }

  stack {
    var $result {
      value = {
        search: $input.search,
        limit: $input.limit,
        message: "Query received"
      }
    }
  }

  response = $result
}
```

**Test:** `GET /query/get-example?search=test&limit=5`

### 2. POST Query with JSON Body

**Endpoint:** `POST /query/post-example` (ID: 1888)

```xs
query "query/post-example" verb=POST {
  description = "POST query with JSON body"

  input {
    text title {
      description = "Item title"
    }
    text content {
      description = "Item content"
    }
    json metadata? {
      description = "Additional data"
    }
  }

  stack {
    var $result {
      value = {
        received: {
          title: $input.title,
          content: $input.content,
          metadata: $input.metadata
        },
        created_at: now
      }
    }
  }

  response = $result
}
```

### 3. Path Parameters

**Endpoint:** `GET /query/path-param/{item_id}` (ID: 1889)

```xs
query "query/path-param/{item_id}" verb=GET {
  description = "Demonstrates path parameters"

  input {
    int item_id {
      description = "Item ID from path"
    }
  }

  stack {
    var $result {
      value = {
        item_id: $input.item_id,
        found: true,
        message: "Item " ~ $input.item_id ~ " retrieved"
      }
    }
  }

  response = $result
}
```

**Test:** `GET /query/path-param/42`

### 4. Authenticated Endpoint

**Endpoint:** `GET /query/with-auth` (ID: 1890)

```xs
query "query/with-auth" verb=GET {
  description = "Demonstrates authenticated endpoint"
  auth = "user"

  input {}

  stack {
    var $result {
      value = {
        user_id: $auth.id,
        message: "Authenticated successfully"
      }
    }
  }

  response = $result
}
```

**Note:** Requires JWT token in `Authorization: Bearer <token>` header.

### 5. History Logging

**Endpoint:** `GET /query/history-demo` (ID: 1891)

```xs
query "query/history-demo" verb=GET {
  description = "Demonstrates request history logging"

  input {
    int count?=5 {
      description = "Count parameter"
    }
  }

  stack {
    var $result {
      value = {
        count: $input.count,
        timestamp: now
      }
    }
  }

  response = $result

  history = 100  // Keep last 100 requests in history
}
```

## Key Patterns

### Pattern 1: Endpoint Naming

```xs
// Simple path
query "products" verb=GET { ... }
// → GET /products

// Nested path
query "products/featured" verb=GET { ... }
// → GET /products/featured

// Path parameters
query "products/{product_id}" verb=GET { ... }
// → GET /products/123

// Multiple path parameters
query "users/{user_id}/orders/{order_id}" verb=GET { ... }
// → GET /users/1/orders/42
```

### Pattern 2: HTTP Verbs and Use Cases

```xs
// GET - Retrieve data
query "users" verb=GET { ... }

// POST - Create new resource
query "users" verb=POST { ... }

// PATCH - Partial update
query "users/{id}" verb=PATCH { ... }

// PUT - Full replacement
query "users/{id}" verb=PUT { ... }

// DELETE - Remove resource
query "users/{id}" verb=DELETE { ... }
```

### Pattern 3: Input Types

```xs
input {
  // Required parameters
  text name { description = "User name" }
  int age { description = "User age" }

  // Optional with default
  int page?=1 { description = "Page number" }
  int per_page?=10 { description = "Items per page" }

  // Optional without default
  text search? { description = "Search term" }

  // With filters
  email user_email filters=trim { description = "Email" }
  text password filters=min:8 { description = "Password" sensitive = true }

  // Complex types
  json metadata? { description = "Additional data" }
  file avatar? { description = "Profile image" }
}
```

### Pattern 4: Authentication

```xs
// Public endpoint (default)
query "products" verb=GET {
  input {}
  stack { ... }
  response = $products
}

// Authenticated endpoint
query "my-profile" verb=GET {
  auth = "user"  // Uses 'user' table for JWT auth

  input {}
  stack {
    // $auth.id contains authenticated user's ID
    db.get "user" {
      field_name = "id"
      field_value = $auth.id
    } as $user
  }
  response = $user
}
```

### Pattern 5: History Options

```xs
// Keep last N requests
history = 100

// Keep all requests (use sparingly)
history = "all"

// Inherit from API group settings
history = "inherit"

// Disable history
history = false
```

### Pattern 6: Custom Response Types

```xs
query "page" verb=GET {
  input {}
  stack {
    // Set HTML content type
    util.set_header {
      value = "Content-Type: text/html; charset=utf-8"
      duplicates = "replace"
    }

    var $html {
      value = "<html><body><h1>Hello</h1></body></html>"
    }
  }
  response = $html
}
```

## Gotchas and Edge Cases

1. **Empty input block required**: Every query needs `input {}` even if no parameters.

2. **Path parameter naming**: Path params like `{user_id}` must match input variable name exactly.

3. **Optional vs Required**: Use `?` suffix for optional, `?=value` for optional with default.

4. **Auth variable**: When `auth` is set, `$auth.id` contains user ID, NOT the full user object.

5. **Response must be outside stack**: `response = $var` is a block-level property, not a stack statement.

6. **Sensitive data**: Use `sensitive = true` on password fields to prevent logging.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Missing block: input` | No input block | Add `input {}` even if empty |
| `Undefined variable: $auth` | Using $auth without auth setting | Add `auth = "user"` |
| `Invalid verb` | Typo in verb | Use GET, POST, PATCH, PUT, DELETE |

## Related Functions

- [input](../input/SKILL.md) - Request parameter definition
- [stack](../stack/SKILL.md) - Processing logic container
- [response](../response/SKILL.md) - API response handling
- [precondition](../precondition/SKILL.md) - Input validation
- [db.query](../db-query/SKILL.md) - Database queries
