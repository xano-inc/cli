---
name: crud-templates
description: Use this skill when creating standard CRUD API endpoints or search/filter functionality for any database table.
---

# CRUD & Search API Templates

Reusable XanoScript templates for standard database operations.

> **Full Workflow Guide:** See [CRUD-WORKFLOW.md](./CRUD-WORKFLOW.md) for complete step-by-step instructions on creating a table with all CRUD endpoints.

---

## Automated CRUD Generation (Recommended)

The `generate_crud` MCP tool automatically creates all 5 CRUD endpoints for any table:

```
generate_crud with table_id=559, apigroup_id=217
```

**Features:**
- Fetches table schema automatically
- Generates LIST, GET, CREATE, UPDATE, DELETE endpoints
- Uses native Xano db operations (`db.query`, `db.get`, `db.add`, `db.patch`, `db.del`)
- Uses `dblink` to auto-sync inputs with table schema (inputs stay updated when schema changes)
- Smart PATCH with `util.get_raw_input` pattern for partial updates
- Options: `endpoint_prefix`, `soft_delete`

**Generated Patterns:**
| Endpoint | Uses |
|----------|------|
| GET /table | `db.query table { return = {type: "list"} }` |
| GET /table/{id} | `db.get table { field_name, field_value }` + 404 precondition |
| POST /table | `dblink { table }` + `db.add table { data }` |
| PATCH /table/{id} | `dblink { table }` + `db.patch` with raw input filtering |
| DELETE /table/{id} | `db.del table { field_name, field_value }` |

**Requirements:**
- Restart Claude Code after building to load the tool
- Provide `table_id` and `apigroup_id`

---

## Manual Templates (Alternative)

Use the templates below when you need custom logic or the automated tool isn't available.

## Quick Start

1. **Get workspace context first:**
   ```
   xano_execute: "Get full context for workspace 40"
   ```

2. **Copy the template** you need from below

3. **Replace placeholders:**
   | Placeholder | Replace With | Example |
   |-------------|--------------|---------|
   | `{TABLE_NAME}` | Your table name | `user` |
   | `{TABLE_ID}` | Table ID from context | `547` |
   | `{WORKSPACE_ID}` | Workspace ID | `40` |
   | `{API_GROUP_ID}` | API group ID (appId) | `217` |

4. **Run via xano_execute:**
   ```
   xano_execute: "Create API endpoint in group {API_GROUP_ID}. XanoScript: [paste template]"
   ```

---

## CRUD Templates

### 1. LIST - Paginated with Search

```xs
query "{TABLE_NAME}" verb=GET {
  input {
    int page?
    int per_page?
    text search?
  }

  stack {
    var $limit { value = $input.per_page || 20 }
    var $offset { value = (($input.page || 1) - 1) * $limit }

    db.direct_query {
      sql = """
        SELECT *, COUNT(*) OVER() as total_count
        FROM x{WORKSPACE_ID}_{TABLE_ID}
        WHERE (? IS NULL OR name ILIKE '%' || ? || '%')
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      """
      response_type = "list"
      arg = $input.search
      arg = $input.search
      arg = $limit
      arg = $offset
    } as $items

    api.lambda {
      code = """
        const items = $var.items;
        const total = items.length > 0 ? parseInt(items[0].total_count) : 0;

        return {
          items: items.map(({ total_count, ...item }) => item),
          pagination: {
            page: $input.page || 1,
            per_page: $var.limit,
            total: total,
            total_pages: Math.ceil(total / $var.limit)
          }
        };
      """
      timeout = 10
    } as $response
  }

  response = $response
}
```

### 2. GET - Single Record by ID

```xs
query "{TABLE_NAME}/{TABLE_NAME}_id" verb=GET {
  input {
    int {TABLE_NAME}_id
  }

  stack {
    db.direct_query {
      sql = "SELECT * FROM x{WORKSPACE_ID}_{TABLE_ID} WHERE id = ?"
      response_type = "single"
      arg = $input.{TABLE_NAME}_id
    } as $item

    precondition ($item != null) {
      error_type = "notfound"
      error = "{TABLE_NAME} not found"
    }
  }

  response = $item
}
```

### 3. CREATE - New Record

```xs
query "{TABLE_NAME}" verb=POST {
  input {
    text name
    text email?
    // Add your fields here
  }

  stack {
    db.add "{TABLE_NAME}" {
      data = {
        name: $input.name,
        email: $input.email,
        created_at: "now"
      }
    } as $new_record
  }

  response = $new_record
}
```

**Why db.add instead of SQL INSERT?** Handles JSON columns automatically without casting errors.

### 4. UPDATE - Partial Update (PATCH)

```xs
query "{TABLE_NAME}/{TABLE_NAME}_id" verb=PATCH {
  input {
    int {TABLE_NAME}_id
    text name?
    text email?
    // Add optional fields here
  }

  stack {
    db.direct_query {
      sql = """
        UPDATE x{WORKSPACE_ID}_{TABLE_ID} SET
          name = COALESCE(NULLIF(?, ''), name),
          email = COALESCE(NULLIF(?, ''), email),
          updated_at = NOW()
        WHERE id = ?
        RETURNING *
      """
      response_type = "single"
      arg = $input.name
      arg = $input.email
      arg = $input.{TABLE_NAME}_id
    } as $item

    precondition ($item != null) {
      error_type = "notfound"
      error = "{TABLE_NAME} not found"
    }
  }

  response = $item
}
```

**Why NULLIF?** Prevents empty strings from blanking out existing values. Only non-empty values update the field.

### 5. DELETE - Hard Delete (Permanent)

```xs
query "{TABLE_NAME}/{TABLE_NAME}_id" verb=DELETE {
  input {
    int {TABLE_NAME}_id
  }

  stack {
    db.direct_query {
      sql = "DELETE FROM x{WORKSPACE_ID}_{TABLE_ID} WHERE id = ? RETURNING id"
      response_type = "single"
      arg = $input.{TABLE_NAME}_id
    } as $deleted

    precondition ($deleted != null) {
      error_type = "notfound"
      error = "{TABLE_NAME} not found"
    }
  }

  response = { success: true, deleted_id: $deleted.id }
}
```

### 6. DELETE - Soft Delete (Sets deleted_at)

```xs
query "{TABLE_NAME}/{TABLE_NAME}_id" verb=DELETE {
  input {
    int {TABLE_NAME}_id
  }

  stack {
    db.direct_query {
      sql = """
        UPDATE x{WORKSPACE_ID}_{TABLE_ID}
        SET deleted_at = NOW()
        WHERE id = ? AND deleted_at IS NULL
        RETURNING id
      """
      response_type = "single"
      arg = $input.{TABLE_NAME}_id
    } as $deleted

    precondition ($deleted != null) {
      error_type = "notfound"
      error = "{TABLE_NAME} not found or already deleted"
    }
  }

  response = { success: true, deleted_id: $deleted.id }
}
```

**Note:** Requires `deleted_at` column (timestamp, nullable). Add `WHERE deleted_at IS NULL` to LIST/GET queries.

---

## Search Templates (PostgreSQL Native)

### Search Methods Overview

| Method | Use Case | Performance | Setup |
|--------|----------|-------------|-------|
| **ILIKE** | Substring match | Good for small tables | None |
| **Multi-field ILIKE** | Search across columns | Moderate | None |
| **Filtered** | Field-specific filters | Best with indexes | B-tree indexes |
| **Full-Text** | Word/phrase search | Fast with index | GIN index |
| **Trigram** | Fuzzy/typo tolerance | Fast with index | pg_trgm + GIN |

### 1. Basic ILIKE Search

Case-insensitive substring matching:

```xs
query "{TABLE_NAME}/search" verb=GET {
  input {
    text q?
    int limit?
  }

  stack {
    db.direct_query {
      sql = """
        SELECT * FROM x{WORKSPACE_ID}_{TABLE_ID}
        WHERE (? IS NULL OR name ILIKE '%' || ? || '%')
        ORDER BY created_at DESC
        LIMIT ?
      """
      response_type = "list"
      arg = $input.q
      arg = $input.q
      arg = $input.limit || 50
    } as $results
  }

  response = $results
}
```

### 2. Multi-Field Search

Search across multiple columns:

```xs
query "{TABLE_NAME}/search" verb=GET {
  input {
    text q?
    int limit?
  }

  stack {
    db.direct_query {
      sql = """
        SELECT * FROM x{WORKSPACE_ID}_{TABLE_ID}
        WHERE (? IS NULL OR
          name ILIKE '%' || ? || '%' OR
          email ILIKE '%' || ? || '%' OR
          description ILIKE '%' || ? || '%')
        ORDER BY created_at DESC
        LIMIT ?
      """
      response_type = "list"
      arg = $input.q
      arg = $input.q
      arg = $input.q
      arg = $input.q
      arg = $input.limit || 50
    } as $results
  }

  response = $results
}
```

### 3. Filtered Search (Field-Specific Filters)

Combine text search with field filters:

```xs
query "{TABLE_NAME}/search" verb=GET {
  input {
    text q?
    text status?
    text created_after?
    text created_before?
    int page?
    int per_page?
  }

  stack {
    var $limit { value = $input.per_page || 20 }
    var $offset { value = (($input.page || 1) - 1) * $limit }

    db.direct_query {
      sql = """
        SELECT *, COUNT(*) OVER() as total_count
        FROM x{WORKSPACE_ID}_{TABLE_ID}
        WHERE (? IS NULL OR name ILIKE '%' || ? || '%')
          AND (? IS NULL OR status = ?)
          AND (? IS NULL OR created_at >= ?::timestamp)
          AND (? IS NULL OR created_at <= ?::timestamp)
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      """
      response_type = "list"
      arg = $input.q
      arg = $input.q
      arg = $input.status
      arg = $input.status
      arg = $input.created_after
      arg = $input.created_after
      arg = $input.created_before
      arg = $input.created_before
      arg = $limit
      arg = $offset
    } as $items

    api.lambda {
      code = """
        const items = $var.items;
        const total = items.length > 0 ? parseInt(items[0].total_count) : 0;
        return {
          items: items.map(({ total_count, ...item }) => item),
          pagination: {
            page: $input.page || 1,
            per_page: $var.limit,
            total: total,
            total_pages: Math.ceil(total / $var.limit)
          }
        };
      """
      timeout = 10
    } as $response
  }

  response = $response
}
```

### 4. Full-Text Search (with Ranking)

Word-based search with relevance scoring:

```xs
query "{TABLE_NAME}/fulltext" verb=GET {
  input {
    text q
    int limit?
  }

  stack {
    db.direct_query {
      sql = """
        SELECT *,
          ts_rank(
            to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, '')),
            plainto_tsquery('english', ?)
          ) as rank
        FROM x{WORKSPACE_ID}_{TABLE_ID}
        WHERE to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, ''))
          @@ plainto_tsquery('english', ?)
        ORDER BY rank DESC
        LIMIT ?
      """
      response_type = "list"
      arg = $input.q
      arg = $input.q
      arg = $input.limit || 50
    } as $results
  }

  response = $results
}
```

**Performance:** Add GIN index for large tables:
```sql
CREATE INDEX idx_{TABLE_NAME}_search ON x{WORKSPACE_ID}_{TABLE_ID}
USING GIN(to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, '')));
```

### 5. Trigram Fuzzy Search

Handles typos and partial matches (requires pg_trgm extension):

```xs
query "{TABLE_NAME}/fuzzy" verb=GET {
  input {
    text q
    int limit?
  }

  stack {
    db.direct_query {
      sql = """
        SELECT *, similarity(name, ?) as sim
        FROM x{WORKSPACE_ID}_{TABLE_ID}
        WHERE similarity(name, ?) > 0.3
        ORDER BY sim DESC
        LIMIT ?
      """
      response_type = "list"
      arg = $input.q
      arg = $input.q
      arg = $input.limit || 50
    } as $results
  }

  response = $results
}
```

**Note:** Requires pg_trgm extension. Create index:
```sql
CREATE INDEX idx_{TABLE_NAME}_trgm ON x{WORKSPACE_ID}_{TABLE_ID} USING GIN(name gin_trgm_ops);
```

---

## Filter Pattern Library

Copy-paste WHERE clause patterns:

| Filter Type | SQL Pattern | Input Type |
|-------------|-------------|------------|
| **Text search** | `(? IS NULL OR field ILIKE '%' \|\| ? \|\| '%')` | `text?` |
| **Exact match** | `(? IS NULL OR field = ?)` | `text?` |
| **Enum/status** | `(? IS NULL OR status = ?)` | `text?` |
| **Date after** | `(? IS NULL OR created_at >= ?::timestamp)` | `text?` |
| **Date before** | `(? IS NULL OR created_at <= ?::timestamp)` | `text?` |
| **Number min** | `(? IS NULL OR amount >= ?::decimal)` | `decimal?` |
| **Number max** | `(? IS NULL OR amount <= ?::decimal)` | `decimal?` |
| **Boolean** | `(? IS NULL OR is_active = ?::boolean)` | `bool?` |
| **Foreign key** | `(? IS NULL OR company_id = ?)` | `int?` |
| **Array contains** | `(? IS NULL OR ? = ANY(tags))` | `text?` |
| **Is null** | `(? IS NULL OR (? = 'true' AND field IS NULL))` | `text?` |
| **Is not null** | `(? IS NULL OR (? = 'true' AND field IS NOT NULL))` | `text?` |

**Remember:** Each `?` placeholder needs a corresponding `arg = $input.field` line.

---

## Complete Example: User CRUD

Using table `user` (ID: 547) in workspace 40, API group 217:

### GET /user (List)

```xs
query "user" verb=GET {
  input {
    int page?
    int per_page?
    text search?
    text role?
  }

  stack {
    var $limit { value = $input.per_page || 20 }
    var $offset { value = (($input.page || 1) - 1) * $limit }

    db.direct_query {
      sql = """
        SELECT id, name, email, role, created_at, updated_at,
          COUNT(*) OVER() as total_count
        FROM x40_547
        WHERE (? IS NULL OR name ILIKE '%' || ? || '%' OR email ILIKE '%' || ? || '%')
          AND (? IS NULL OR role = ?)
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      """
      response_type = "list"
      arg = $input.search
      arg = $input.search
      arg = $input.search
      arg = $input.role
      arg = $input.role
      arg = $limit
      arg = $offset
    } as $items

    api.lambda {
      code = """
        const items = $var.items;
        const total = items.length > 0 ? parseInt(items[0].total_count) : 0;
        return {
          items: items.map(({ total_count, password, ...item }) => item),
          pagination: {
            page: $input.page || 1,
            per_page: $var.limit,
            total: total,
            total_pages: Math.ceil(total / $var.limit)
          }
        };
      """
      timeout = 10
    } as $response
  }

  response = $response
}
```

### GET /user/{user_id}

```xs
query "user/{user_id}" verb=GET {
  input {
    int user_id
  }

  stack {
    db.direct_query {
      sql = "SELECT id, name, email, role, created_at, updated_at FROM x40_547 WHERE id = ?"
      response_type = "single"
      arg = $input.user_id
    } as $user

    precondition ($user != null) {
      error_type = "notfound"
      error = "User not found"
    }
  }

  response = $user
}
```

### POST /user

```xs
query "user" verb=POST {
  input {
    text name
    text email
    text password
    text role?
  }

  stack {
    db.add "user" {
      data = {
        name: $input.name,
        email: $input.email,
        password: $input.password,
        role: $input.role || "user",
        created_at: "now"
      }
    } as $new_user

    api.lambda {
      code = """
        const { password, ...safe } = $var.new_user;
        return safe;
      """
      timeout = 5
    } as $response
  }

  response = $response
}
```

### PATCH /user/{user_id}

```xs
query "user/{user_id}" verb=PATCH {
  input {
    int user_id
    text name?
    text email?
    text role?
  }

  stack {
    db.direct_query {
      sql = """
        UPDATE x40_547 SET
          name = COALESCE(NULLIF(?, ''), name),
          email = COALESCE(NULLIF(?, ''), email),
          role = COALESCE(NULLIF(?, ''), role),
          updated_at = NOW()
        WHERE id = ?
        RETURNING id, name, email, role, created_at, updated_at
      """
      response_type = "single"
      arg = $input.name
      arg = $input.email
      arg = $input.role
      arg = $input.user_id
    } as $user

    precondition ($user != null) {
      error_type = "notfound"
      error = "User not found"
    }
  }

  response = $user
}
```

### DELETE /user/{user_id}

```xs
query "user/{user_id}" verb=DELETE {
  input {
    int user_id
  }

  stack {
    db.direct_query {
      sql = "DELETE FROM x40_547 WHERE id = ? RETURNING id"
      response_type = "single"
      arg = $input.user_id
    } as $deleted

    precondition ($deleted != null) {
      error_type = "notfound"
      error = "User not found"
    }
  }

  response = { success: true, deleted_id: $deleted.id }
}
```

---

## Security Reminders

- **Never expose passwords** - Filter `password`, `api_key`, `secret`, `token` from responses
- **Always return 404** - Use precondition for non-existent records
- **PATCH preserves values** - Use NULLIF pattern to avoid blanking fields
- **Use parameterized queries** - Always use `?` placeholders, never string concatenation

---

## ⚠️ Known Limitations & Gotchas

### 1. var Block Math Doesn't Work Reliably

**Problem:** Math expressions in var blocks cause "Not numeric" errors.

```xs
// ❌ FAILS - Math in var blocks
var $limit { value = $input.per_page || 20 }
var $offset { value = (($input.page || 1) - 1) * $limit }  // "Not numeric" error
```

**Solution:** Use hardcoded LIMIT or do pagination in Lambda:

```xs
// ✅ WORKS - Hardcode limit, paginate in Lambda
db.direct_query {
  sql = "SELECT * FROM table LIMIT 100"
  response_type = "list"
} as $all_items

api.lambda {
  code = """
    const page = $input.page || 1;
    const perPage = $input.per_page || 20;
    const offset = (page - 1) * perPage;
    return $var.all_items.slice(offset, offset + perPage);
  """
  timeout = 10
} as $paged_items
```

### 2. Boolean Filters Need Special Handling

**Problem:** `?::boolean` fails with empty string ("INVALID TEXT REPRESENTATION").

```xs
// ❌ FAILS - Direct boolean cast
AND (? IS NULL OR is_active = ?::boolean)  // Fails when input is empty string
```

**Solution:** Compare string value instead:

```xs
// ✅ WORKS - String comparison for optional booleans
AND (NULLIF(?, '') IS NULL OR field = (? = 'true'))
```

Input type should be `text?` not `bool?` for optional boolean filters.

### 3. Integer Filters Default to 0

**Problem:** Optional int inputs default to 0, not null.

```xs
// ❌ FAILS - 0 is treated as a valid filter value
AND (? IS NULL OR company_id = ?)  // Filters to company_id=0 when not provided
```

**Solution:** Use NULLIF to convert 0 to null:

```xs
// ✅ WORKS - Treat 0 as "no filter"
AND (NULLIF(?, 0) IS NULL OR company_id = ?)
```

### 4. Lambda Results Can't Be Used in SQL Args

**Problem:** Accessing Lambda result properties in SQL args returns null.

```xs
// ❌ FAILS - Lambda result in SQL arg
api.lambda { code = "return {limit: 20, offset: 0};" } as $params
db.direct_query {
  sql = "SELECT * FROM table LIMIT ? OFFSET ?"
  arg = $params.limit   // Returns null!
  arg = $params.offset  // Returns null!
}
```

**Solution:** Do all SQL first, then process in Lambda. Or use hardcoded values.

### 5. Full-Text Search Pattern

**Working pattern for optional full-text search:**

```xs
// ✅ WORKS - Optional full-text search
db.direct_query {
  sql = """
    SELECT * FROM x40_551
    WHERE (NULLIF(?, '') IS NULL OR
           to_tsvector('english', COALESCE(field1, '') || ' ' || COALESCE(field2, ''))
           @@ plainto_tsquery('english', ?))
    ORDER BY created_at DESC
    LIMIT 50
  """
  response_type = "list"
  arg = $input.q
  arg = $input.q
} as $results
```

**Requires:** Full-text search index on the table (see index-management skill).

---

## Working Search Endpoint Template

Based on real-world testing, here's a reliable search template:

```xs
query "{TABLE_NAME}/search" verb=GET {
  input {
    text q?
    text type?
    text status?
    int foreign_key_id?
    int page?=1
    int per_page?=20
  }

  stack {
    db.direct_query {
      sql = """
        SELECT a.*, COUNT(*) OVER() as total_count
        FROM x{WORKSPACE_ID}_{TABLE_ID} a
        WHERE 1=1
          AND (NULLIF(?, '') IS NULL OR
               to_tsvector('english', COALESCE(a.name, '') || ' ' || COALESCE(a.description, ''))
               @@ plainto_tsquery('english', ?))
          AND (NULLIF(?, '') IS NULL OR a.type = ?)
          AND (NULLIF(?, '') IS NULL OR a.status = ?)
          AND (NULLIF(?, 0) IS NULL OR a.foreign_key_id = ?)
        ORDER BY a.created_at DESC
        LIMIT 50
      """
      response_type = "list"
      arg = $input.q
      arg = $input.q
      arg = $input.type
      arg = $input.type
      arg = $input.status
      arg = $input.status
      arg = $input.foreign_key_id
      arg = $input.foreign_key_id
    } as $items
  }

  response = $items
}
```

**Notes:**
- `total_count` in each row for frontend pagination
- Uses LIMIT 50 hardcoded (reliable)
- All filters are optional
- Text filters: `NULLIF(?, '')`
- Int filters: `NULLIF(?, 0)`

---

## Tested Example: Product CRUD

The following endpoints were created and tested successfully:

| Endpoint | ID | Description |
|----------|-----|-------------|
| GET /products | 1783 | List with optional is_active filter |
| GET /products/{product_id} | 1792 | Get single with 404 |
| POST /products | 1784 | Create using db.add |
| PATCH /products/{product_id} | 1793 | Update with NULLIF pattern |
| DELETE /products/{product_id} | 1794 | Delete with 404 |

**Key Learnings:**
1. Boolean/decimal filters in LIST need `NULLIF(?, '')` + text input type
2. PATCH with optional decimals/booleans needs text input type + `::decimal`/`::boolean` cast
3. All endpoints tested against CRM API group (id: 217)

---

## Troubleshooting

### SQL Error: INDETERMINATE DATATYPE

**Problem:** Boolean or numeric filters cause PostgreSQL type errors.

```xs
// ❌ FAILS - Boolean input with IS NULL check
input { bool is_active? }
sql = "WHERE (? IS NULL OR is_active = ?)"  // Type error!
```

**Solution:** Use text input and compare as string:

```xs
// ✅ WORKS - Text input with string comparison
input { text is_active? }
sql = "WHERE (NULLIF(?, '') IS NULL OR is_active = (? = 'true'))"
```

### PATCH Zeros Out Decimal/Boolean Fields

**Problem:** Optional decimal/bool inputs default to 0/false, overwriting values.

```xs
// ❌ FAILS - Decimal/bool default to 0/false
input { decimal unit_price?, bool is_active? }
// When omitted, sends 0 and false instead of null
```

**Solution:** Use text inputs and cast in SQL:

```xs
// ✅ WORKS - Text inputs with casting
input { text unit_price?, text is_active? }
sql = """
  UPDATE table SET
    unit_price = COALESCE(NULLIF(?, '')::decimal, unit_price),
    is_active = COALESCE(NULLIF(?, '')::boolean, is_active)
  WHERE id = ?
"""
```

### var Block Math Errors

**Problem:** Math expressions in var blocks cause "Not numeric" errors.

**Solution:** Use hardcoded LIMIT or do pagination in Lambda (see Limitations section above).

---

## Related Skills

- [sql-lambda-patterns](../sql-lambda-patterns/SKILL.md) - Advanced SQL and Lambda patterns
- [effective-intents](../effective-intents/SKILL.md) - How to write MCP intents
- [api-testing](../api-testing/SKILL.md) - Testing your endpoints
