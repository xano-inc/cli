---
name: sql-lambda-patterns
description: Use this skill when writing XanoScript code for API endpoints, database operations, functions, or understanding XanoScript syntax.
---

# SQL & Lambda Development Patterns

## Philosophy

**SQL and Lambda are the PRIMARY development methods for Xano.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT HIERARCHY                         │
├─────────────────────────────────────────────────────────────────┤
│  1. SQL (db.direct_query)  → SELECT, DELETE, COUNT, complex ops  │
│  2. Native db.add          → INSERT (handles JSON types well)    │
│  3. Lambda (api.lambda)    → Logic, validation, transformations  │
│  4. XanoScript control     → preconditions, variables only       │
└─────────────────────────────────────────────────────────────────┘
```

**Why this order?**
- SQL and JavaScript/TypeScript are well-known languages
- Claude is natively fluent in these, reducing generation errors
- XanoScript DSL has unique syntax that causes frequent errors
- SQL handles complex JOINs, CTEs, aggregations elegantly
- **Native `db.add` handles JSON columns better than SQL INSERT**
- Lambda handles any logic that SQL can't express

## CRITICAL: SQL vs db.add for Database Operations

| Operation | Use | Reason |
|-----------|-----|--------|
| **SELECT** | `db.direct_query` | Full SQL power, JOINs, CTEs |
| **INSERT** | `db.add` | Better JSON/complex type handling |
| **UPDATE** | `db.direct_query` | NULLIF pattern for partial updates |
| **DELETE** | `db.direct_query` | Simple and reliable |
| **COUNT/SUM** | `db.direct_query` | Aggregations are SQL strength |

**Why `db.add` over SQL INSERT?**
SQL INSERT with JSON columns requires complex casting (`?::jsonb`, `?::json`) that often fails with "DATATYPE MISMATCH" errors. Native `db.add` handles JSON automatically.

---

## Default Endpoint Pattern

Every endpoint should follow this structure:

```xs
query "endpoint-name" verb=GET {
  input {
    // Input parameters (XanoScript syntax required here)
  }

  stack {
    // 1. SQL for database operations
    db.direct_query {
      sql = "SELECT ... FROM ... WHERE ..."
      response_type = "list" | "single"
      arg = $input.param
    } as $db_result

    // 2. Preconditions for error handling (XanoScript)
    precondition ($db_result != null) {
      error_type = "notfound"
      error = "Record not found"
    }

    // 3. Lambda for transformation/logic
    api.lambda {
      code = """
        // JavaScript/TypeScript processing
        return transformedResult;
      """
      timeout = 10
    } as $final_result
  }

  // Response references a variable from the stack
  response = $final_result
}
```

---

## Table Name Resolution

**CRITICAL: Always look up table IDs before writing SQL.**

### Table Name Formats (VERIFIED via direct PostgreSQL access)

| Prefix | Format | Type | Use Case |
|--------|--------|------|----------|
| `x` | `x{workspace}_{table_id}` | **VIEW** | SELECT only (read-only) |
| `mvpw` | `mvpw{workspace}_{table_id}` | **TABLE** | INSERT/UPDATE/DELETE (read-write) |

**CRITICAL DISCOVERY:**
- `x40_564` is a PostgreSQL VIEW - you CANNOT UPDATE or DELETE from it!
- `mvpw40_564` is the actual TABLE - use this for all write operations!

### Timestamp Columns (CRITICAL!)

**Xano stores timestamps as `bigint` (Unix epoch in milliseconds), NOT as `timestamp` type!**

| Operation | WRONG | CORRECT |
|-----------|-------|---------|
| Current time | `NOW()` | `(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint` |
| Compare dates | `created_at > '2024-01-01'` | `created_at > 1704067200000` |

Example:
```sql
-- WRONG: Will cause DATATYPE MISMATCH error
UPDATE mvpw40_564 SET updated_at = NOW() WHERE id = ?

-- CORRECT: Use epoch milliseconds
UPDATE mvpw40_564 SET updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint WHERE id = ?
```

### Operation-to-Table Matrix

| SQL Operation | Table Prefix | Example |
|---------------|--------------|---------|
| SELECT | `x` (view) | `SELECT * FROM x40_564` |
| INSERT | `mvpw` (table) | `INSERT INTO mvpw40_564 (...)` |
| UPDATE | `mvpw` (table) | `UPDATE mvpw40_564 SET ...` |
| DELETE | `mvpw` (table) | `DELETE FROM mvpw40_564 WHERE ...` |
| JOINs (read) | `x` (view) | `SELECT * FROM x40_564 t JOIN x40_563 p ON ...` |

### Workflow

1. **Get table ID first** via MCP intent: `"List all tables"` or `"Get table named 'users'"`
2. **For SELECT**: Use `x{workspace_id}_{table_id}` (e.g., `x40_534`)
3. **For INSERT/UPDATE/DELETE**: Use `mvpw{workspace_id}_{table_id}` (e.g., `mvpw40_534`)

### Example Intent Flow

```
Step 1: "List all tables"
→ Returns: [{id: 534, name: "user"}, {id: 535, name: "company"}]

Step 2: Write SQL using IDs
→ SELECT: "SELECT * FROM x40_534 WHERE role = ?"
→ UPDATE: "UPDATE mvpw40_534 SET status = ? WHERE id = ?"
→ DELETE: "DELETE FROM mvpw40_534 WHERE id = ?"
```

---

# PART 1: SQL (db.direct_query)

## Core Syntax

```xs
db.direct_query {
  sql = "SELECT * FROM x40_534 WHERE id = ?"
  response_type = "single"  // or "list"
  arg = $input.id
} as $result
```

### Key Rules

1. **Use `?` placeholders** for parameters (never concatenate input)
2. **Multiple args**: Use repeated `arg =` lines (NOT arrays)
3. **Always specify `response_type`**: "list" or "single"
4. **PostgreSQL syntax**: Xano uses PostgreSQL

### Multiple Parameters

```xs
// CORRECT - Multiple arg lines
db.direct_query {
  sql = "SELECT * FROM x40_534 WHERE role = ? AND status = ? LIMIT ?"
  response_type = "list"
  arg = $input.role
  arg = $input.status
  arg = $input.limit
} as $results

// WRONG - Array syntax fails
db.direct_query {
  sql = "SELECT * FROM x40_534 WHERE role = ?"
  arg = [$input.role, $input.status]  // FAILS!
} as $results
```

---

## Dynamic SQL with TWIG Templating

**For complex dynamic queries with optional filters, use TWIG templating instead of parameter binding.**

### Enabling TWIG

Add `parser = "template_engine"` to enable TWIG:

```xs
db.direct_query {
  sql = """
    SELECT * FROM x40_564
    WHERE 1=1
    {% if $input.status %}
      AND status = '{{ $input.status }}'
    {% endif %}
    ORDER BY created_at DESC
    LIMIT 10
  """
  parser = "template_engine"
  response_type = "list"
} as $tasks
```

### CRITICAL: Optional Input Defaults

**Xano sets default values for optional inputs - they're NEVER null!**

| Input Type | Default Value | TWIG Truthiness |
|------------|---------------|-----------------|
| `text field?` | `""` (empty string) | Falsy |
| `int field?` | `0` | Falsy |

This means:
- `{% if $input.status %}` → FALSE for empty string ✓
- `{{ $input.per_page\|default(10) }}` → Returns 0 NOT 10! ✗

### Pattern: Integer Defaults

**DON'T use `|default()` for integers - use conditional instead:**

```xs
{# WRONG - |default() won't work because value is 0, not null #}
LIMIT {{ $input.per_page|default(10) }}

{# CORRECT - Use conditional to check for 0 #}
LIMIT {% if $input.per_page > 0 %}{{ $input.per_page }}{% else %}10{% endif %}
```

### Pattern: Text Conditionals

**Empty strings are falsy in TWIG, so this works:**

```xs
{% if $input.status %}
  AND status = '{{ $input.status }}'
{% endif %}
```

### Complete Dynamic Search Example

```xs
query "tasks-search" verb=GET {
  input {
    text search?
    text status?
    text priority?
    int per_page?
    int page?
  }

  stack {
    db.direct_query {
      sql = """
        SELECT id, title, status, priority, created_at
        FROM x40_564
        WHERE 1=1
        {% if $input.search %}
          AND title ILIKE '%{{ $input.search }}%'
        {% endif %}
        {% if $input.status %}
          AND status = '{{ $input.status }}'
        {% endif %}
        {% if $input.priority %}
          AND priority = '{{ $input.priority }}'
        {% endif %}
        ORDER BY created_at DESC
        LIMIT {% if $input.per_page > 0 %}{{ $input.per_page }}{% else %}10{% endif %}
        OFFSET {% if $input.page > 0 %}{{ ($input.page - 1) * ($input.per_page > 0 ? $input.per_page : 10) }}{% else %}0{% endif %}
      """
      parser = "template_engine"
      response_type = "list"
    } as $tasks
  }

  response = $tasks
}
```

### TWIG vs Parameter Binding

| Approach | Use When | Security |
|----------|----------|----------|
| **Parameter binding** (`arg = $input.x`) | Required parameters, simple queries | SQL injection safe |
| **TWIG templating** (`parser = "template_engine"`) | Optional filters, dynamic WHERE clauses | Use `\|sql_esc` for user input |

### TWIG Security: sql_esc Filter

When interpolating user input directly, use the `|sql_esc` filter:

```xs
{# For string values - escapes quotes #}
AND name = {{ $input.name|sql_esc }}

{# For LIKE patterns - build the pattern then escape #}
AND title ILIKE {{ ("%" ~ $input.search ~ "%")|sql_esc }}
```

**Note:** Simple `{{ $input.value }}` works for values you control, but ALWAYS use `|sql_esc` for user input.

### TWIG Operators and Filters

| Operator/Filter | Purpose | Example |
|-----------------|---------|---------|
| `~` | String concatenation | `"%" ~ $input.search ~ "%"` |
| `\|sql_esc` | SQL escape (prevents injection) | `{{ $input.name\|sql_esc }}` |
| `\|default(val)` | Default for null only | `{{ $var\|default("N/A") }}` |
| `? :` | Ternary operator | `{{ $x > 0 ? $x : 10 }}` |

### When to Use TWIG vs `arg`

**Use `arg` (parameter binding):**
- Required parameters
- Simple queries with fixed structure
- Maximum security

**Use TWIG (`parser = "template_engine"`):**
- Optional WHERE clauses
- Dynamic ORDER BY
- Complex search with multiple optional filters
- Dynamic LIMIT/OFFSET

---

## CRUD Patterns

### CREATE (INSERT) - Use db.add

**CRITICAL: Use `db.add` for inserts, especially with JSON columns!**

```xs
// Single record insert
db.add "user" {
  data = {
    name: $input.name,
    email: $input.email,
    role: $input.role || "user",
    metadata: $input.metadata,  // JSON handled automatically
    created_at: "now"
  }
} as $new_record
```

**Why not SQL INSERT?**
```xs
// AVOID - SQL INSERT with JSON columns often fails
db.direct_query {
  sql = "INSERT INTO x40_534 (name, types) VALUES (?, ?::jsonb)"  // DATATYPE MISMATCH error!
  arg = $input.name
  arg = $input.types
} as $record
```

### Bulk Insert (Multiple Records)

Use `foreach` with `db.add` for inserting multiple records:

```xs
// First, prepare data in Lambda
api.lambda {
  code = """
    // Example: Transform API response to records
    return $var.api_response.map(item => ({
      name: item.name,
      external_id: item.id,
      metadata: item.details,
      synced_at: new Date().toISOString()
    }));
  """
  timeout = 10
} as $records_to_insert

// Then insert each record
var $inserted_ids { value = [] }

foreach ($records_to_insert) {
  each as $record {
    db.add "item" {
      data = {
        name: $record.name,
        external_id: $record.external_id,
        metadata: $record.metadata,
        synced_at: $record.synced_at
      }
    } as $new_item

    array.push $inserted_ids {
      value = $new_item.id
    }
  }
}
```

### Upsert (Add or Update)

Use `db.add_or_edit` when you want to insert if not exists, or update if exists:

```xs
db.add_or_edit "user" {
  field_name = "email"
  field_value = $input.email
  data = {
    name: $input.name,
    email: $input.email,
    last_login: "now"
  }
} as $user_record
```

### Bulk Operations

For updating/patching multiple records at once, use the bulk functions:

**Bulk Update (replaces entire records):**
```xs
db.bulk.update "note" {
  items = [
    {id: 1, title: "Updated Note 1", content: "New content"},
    {id: 2, title: "Updated Note 2", content: "New content"}
  ]
} as $updated_notes
```

**Bulk Patch (partial updates, preserves existing fields):**
```xs
db.bulk.patch "note" {
  items = [
    {id: 1, status: "completed"},
    {id: 2, status: "archived"},
    {id: 3, status: "pending"}
  ]
} as $patched_notes
```

**Building bulk items from Lambda:**
```xs
// First, prepare the update items in Lambda
api.lambda {
  code = """
    return $var.records_to_update.map(record => ({
      id: record.id,
      status: 'processed',
      processed_at: new Date().toISOString()
    }));
  """
  timeout = 10
} as $bulk_items

// Then bulk patch
db.bulk.patch "order" {
  items = $bulk_items
} as $results
```

### READ (SELECT) - Use SQL

**List with pagination:**
```xs
db.direct_query {
  sql = """
    SELECT id, name, email, role, created_at
    FROM x40_534
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  """
  response_type = "list"
  arg = $input.per_page
  arg = $input.offset
} as $records
```

**Get by ID:**
```xs
db.direct_query {
  sql = "SELECT * FROM x40_534 WHERE id = ?"
  response_type = "single"
  arg = $input.id
} as $record

precondition ($record != null) {
  error_type = "notfound"
  error = "Record not found"
}
```

### UPDATE (PATCH)

**CRITICAL: Use `mvpw` prefix for writes, NULLIF for optional fields, and epoch milliseconds for timestamps!**

```xs
db.direct_query {
  sql = """
    UPDATE mvpw40_534 SET
      name = COALESCE(NULLIF(?, ''), name),
      email = COALESCE(NULLIF(?, ''), email),
      updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
    WHERE id = ?
    RETURNING *
  """
  response_type = "single"
  arg = $input.name
  arg = $input.email
  arg = $input.id
} as $updated
```

**Key Patterns:**
- **`mvpw` prefix**: Views (`x40_*`) are read-only! Use `mvpw40_*` for writes
- **NULLIF**: Empty strings (`''`) are NOT NULL. Without NULLIF, PATCH blanks out fields
- **Timestamp**: Xano stores as `bigint` epoch ms, NOT `timestamp`. `NOW()` will fail with DATATYPE MISMATCH

### DELETE

**CRITICAL: Use `mvpw` prefix for writes!**

```xs
db.direct_query {
  sql = "DELETE FROM mvpw40_534 WHERE id = ? RETURNING id"
  response_type = "single"
  arg = $input.id
} as $deleted

precondition ($deleted != null) {
  error_type = "notfound"
  error = "Record not found"
}
```

**Note:** Views (`x40_*`) are read-only. DELETE operations MUST use the `mvpw40_*` table prefix.

---

## Advanced SQL Patterns

### JOINs

```xs
db.direct_query {
  sql = """
    SELECT
      d.*,
      c.name as company_name,
      u.name as owner_name
    FROM x40_536 d
    LEFT JOIN x40_535 c ON d.company_id = c.id
    LEFT JOIN x40_534 u ON d.owner_id = u.id
    WHERE d.id = ?
  """
  response_type = "single"
  arg = $input.deal_id
} as $deal
```

### Aggregations

```xs
db.direct_query {
  sql = """
    SELECT
      stage,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as total_value
    FROM x40_536
    GROUP BY stage
    ORDER BY count DESC
  """
  response_type = "list"
} as $pipeline
```

### CTEs (Common Table Expressions)

**NOTE:** Since timestamps are stored as `bigint` (epoch ms), calculate time boundaries in Lambda first:

```xs
// First, calculate 30 days ago in Lambda
api.lambda {
  code = "return Date.now() - (30 * 24 * 60 * 60 * 1000);"
  timeout = 5
} as $thirty_days_ago

// Then use in CTE
db.direct_query {
  sql = """
    WITH monthly_stats AS (
      SELECT
        owner_id,
        COUNT(*) as deals,
        SUM(CASE WHEN stage = 'won' THEN amount ELSE 0 END) as revenue
      FROM x40_536
      WHERE created_at >= ?
      GROUP BY owner_id
    )
    SELECT u.name, ms.*
    FROM monthly_stats ms
    JOIN x40_534 u ON ms.owner_id = u.id
    ORDER BY ms.revenue DESC
    LIMIT 10
  """
  response_type = "list"
  arg = $thirty_days_ago
} as $top_performers
```

### Search with ILIKE

```xs
db.direct_query {
  sql = """
    SELECT * FROM x40_534
    WHERE (? IS NULL OR name ILIKE '%' || ? || '%' OR email ILIKE '%' || ? || '%')
    ORDER BY created_at DESC
    LIMIT 50
  """
  response_type = "list"
  arg = $input.q
  arg = $input.q
  arg = $input.q
} as $results
```

---

# PART 2: Lambda (api.lambda)

## Core Syntax

```xs
api.lambda {
  code = """
    // Full JavaScript/TypeScript support
    // Access: $input, $var, $auth, $env

    // MUST return a value
    return result;
  """
  timeout = 10  // seconds (max ~30)
} as $result
```

### Key Rules

1. **Lambda can ONLY be used in the stack** (not in input or response)
2. **Must return a value** - this becomes the captured variable
3. **Access context**: `$input`, `$var`, `$auth`, `$env`
4. **Stack variables**: Use `$var.variableName` (not `$variableName`)
5. **Synchronous only**: No async/await
6. **Always set timeout**: Default to 10 seconds

### Lambda Placement

```xs
query "example" verb=GET {
  input {
    // Lambda CANNOT be used here
  }

  stack {
    // Lambda CAN be used here
    api.lambda { code = "return 'hello';" } as $greeting

    // Reference the result
    var $message { value = $greeting }
  }

  // Lambda CANNOT be used here
  // Reference stack variable instead
  response = $greeting
}
```

---

## Lambda Use Cases

### 1. Data Transformation

```xs
api.lambda {
  code = """
    return $var.users.map(user => ({
      id: user.id,
      display_name: user.name,
      initials: user.name.split(' ').map(n => n[0]).join('').toUpperCase(),
      role_label: user.role.charAt(0).toUpperCase() + user.role.slice(1)
    }));
  """
  timeout = 10
} as $formatted_users
```

### 2. Input Validation

```xs
api.lambda {
  code = """
    const errors = [];

    // Email validation
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    if (!$input.email || !emailRegex.test($input.email)) {
      errors.push({ field: 'email', message: 'Valid email required' });
    }

    // Name validation
    if (!$input.name || $input.name.trim().length < 2) {
      errors.push({ field: 'name', message: 'Name must be at least 2 characters' });
    }

    return { valid: errors.length === 0, errors };
  """
  timeout = 5
} as $validation

precondition ($validation.valid) {
  error_type = "validation"
  error = $validation.errors
}
```

### 3. Response Building

```xs
api.lambda {
  code = """
    const items = $var.db_results;
    const total = items.length > 0 ? parseInt(items[0].total_count) : 0;

    return {
      items: items.map(({ total_count, ...item }) => item),
      meta: {
        page: $input.page || 1,
        per_page: $input.per_page || 20,
        total: total,
        total_pages: Math.ceil(total / ($input.per_page || 20))
      }
    };
  """
  timeout = 10
} as $response
```

### 4. Business Logic

```xs
api.lambda {
  code = """
    const deal = $var.deal;
    const stages = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
    const currentIndex = stages.indexOf(deal.stage);

    // Can only move forward one stage (except to lost)
    const allowedNextStages = [];
    if (currentIndex < stages.length - 2) {
      allowedNextStages.push(stages[currentIndex + 1]);
    }
    allowedNextStages.push('lost');

    const requestedStage = $input.new_stage;
    const isAllowed = allowedNextStages.includes(requestedStage);

    return {
      allowed: isAllowed,
      current_stage: deal.stage,
      requested_stage: requestedStage,
      allowed_stages: allowedNextStages,
      error: isAllowed ? null : 'Invalid stage transition'
    };
  """
  timeout = 10
} as $stage_check
```

### 5. External API Requests

```xs
api.lambda {
  code = """
    // Lambda supports fetch for external APIs
    const response = await fetch('https://api.example.com/data', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + $env.EXTERNAL_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: $input.search_term })
    });

    const data = await response.json();
    return data;
  """
  timeout = 30
} as $external_data
```

### 6. Removing Sensitive Fields

```xs
api.lambda {
  code = """
    const sensitiveFields = ['password', 'api_key', 'secret', 'token'];

    return $var.users.map(user => {
      const safe = { ...user };
      sensitiveFields.forEach(field => delete safe[field]);
      return safe;
    });
  """
  timeout = 10
} as $safe_users
```

---

# PART 3: Complete Endpoint Examples

## Full CRUD API

### GET /items (List)

```xs
query "items" verb=GET {
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
        FROM x40_537
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

### GET /items/{id} (Single)

```xs
query "items/{item_id}" verb=GET {
  input {
    int item_id
  }

  stack {
    db.direct_query {
      sql = "SELECT * FROM x40_537 WHERE id = ?"
      response_type = "single"
      arg = $input.item_id
    } as $item

    precondition ($item != null) {
      error_type = "notfound"
      error = "Item not found"
    }
  }

  response = $item
}
```

### POST /items (Create) - Uses db.add

```xs
query "items" verb=POST {
  input {
    text name
    text description?
    decimal price?
    json metadata?
  }

  stack {
    // Validate
    api.lambda {
      code = """
        const errors = [];
        if (!$input.name || $input.name.trim().length < 1) {
          errors.push({ field: 'name', message: 'Name is required' });
        }
        if ($input.price && $input.price < 0) {
          errors.push({ field: 'price', message: 'Price must be positive' });
        }
        return { valid: errors.length === 0, errors };
      """
      timeout = 5
    } as $validation

    precondition ($validation.valid) {
      error_type = "validation"
      error = $validation.errors
    }

    // Insert using db.add (handles JSON automatically)
    db.add "item" {
      data = {
        name: $input.name,
        description: $input.description,
        price: $input.price,
        metadata: $input.metadata,
        created_at: "now"
      }
    } as $item
  }

  response = $item
}
```

### PATCH /items/{id} (Update)

```xs
query "items/{item_id}" verb=PATCH {
  input {
    int item_id
    text name?
    text description?
    decimal price?
  }

  stack {
    // Check exists
    db.direct_query {
      sql = "SELECT id FROM x40_537 WHERE id = ?"
      response_type = "single"
      arg = $input.item_id
    } as $existing

    precondition ($existing != null) {
      error_type = "notfound"
      error = "Item not found"
    }

    // Update with NULLIF to preserve existing values
    // NOTE: Use mvpw prefix for writes, epoch ms for timestamps!
    db.direct_query {
      sql = """
        UPDATE mvpw40_537 SET
          name = COALESCE(NULLIF(?, ''), name),
          description = COALESCE(NULLIF(?, ''), description),
          price = COALESCE(NULLIF(?::text, '')::decimal, price),
          updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint
        WHERE id = ?
        RETURNING *
      """
      response_type = "single"
      arg = $input.name
      arg = $input.description
      arg = $input.price
      arg = $input.item_id
    } as $item
  }

  response = $item
}
```

### DELETE /items/{id}

```xs
query "items/{item_id}" verb=DELETE {
  input {
    int item_id
  }

  stack {
    // NOTE: Use mvpw prefix for writes!
    db.direct_query {
      sql = "DELETE FROM mvpw40_537 WHERE id = ? RETURNING id"
      response_type = "single"
      arg = $input.item_id
    } as $deleted

    precondition ($deleted != null) {
      error_type = "notfound"
      error = "Item not found"
    }
  }

  response = {success: true, deleted_id: $deleted.id}
}
```

---

## Dashboard/Analytics Endpoint

```xs
query "dashboard" verb=GET {
  input {
    int user_id?
  }

  stack {
    db.direct_query {
      sql = """
        WITH stats AS (
          SELECT
            COUNT(*) as total_deals,
            COUNT(*) FILTER (WHERE stage = 'won') as won_deals,
            COALESCE(SUM(amount) FILTER (WHERE stage = 'won'), 0) as revenue,
            COALESCE(SUM(amount) FILTER (WHERE stage NOT IN ('won', 'lost')), 0) as pipeline
          FROM x40_536
          WHERE (? IS NULL OR owner_id = ?)
        ),
        recent AS (
          SELECT json_agg(row_to_json(d)) as deals
          FROM (
            SELECT id, name, amount, stage, created_at
            FROM x40_536
            WHERE (? IS NULL OR owner_id = ?)
            ORDER BY created_at DESC
            LIMIT 5
          ) d
        )
        SELECT s.*, r.deals as recent_deals
        FROM stats s, recent r
      """
      response_type = "single"
      arg = $input.user_id
      arg = $input.user_id
      arg = $input.user_id
      arg = $input.user_id
    } as $data

    api.lambda {
      code = """
        const d = $var.data;
        const winRate = d.total_deals > 0
          ? ((d.won_deals / d.total_deals) * 100).toFixed(1)
          : 0;

        return {
          summary: {
            total_deals: d.total_deals,
            won_deals: d.won_deals,
            win_rate: parseFloat(winRate),
            revenue: { value: d.revenue, formatted: '$' + d.revenue.toLocaleString() },
            pipeline: { value: d.pipeline, formatted: '$' + d.pipeline.toLocaleString() }
          },
          recent_deals: d.recent_deals || []
        };
      """
      timeout = 10
    } as $dashboard
  }

  response = $dashboard
}
```

---

## Decision Matrix

| Task | Use SQL | Use Native DB | Use Lambda | Use XanoScript |
|------|---------|---------------|------------|----------------|
| SELECT (read) | * | | | |
| JOINs, CTEs, aggregations | * | | | |
| COUNT, SUM, AVG | * | | | |
| INSERT single record | | `db.add` | | |
| INSERT with JSON columns | | `db.add` | | |
| Bulk INSERT (foreach) | | `foreach + db.add` | | |
| Upsert (add or edit) | | `db.add_or_edit` | | |
| Bulk UPDATE (full replace) | | `db.bulk.update` | | |
| Bulk PATCH (partial) | | `db.bulk.patch` | | |
| UPDATE partial (single) | * (NULLIF) | | | |
| DELETE | * | | | |
| Pagination | * | | | |
| Input validation | | | * | |
| Data transformation | | | * | |
| Business logic | | | * | |
| External API calls (fetch) | | | * | |
| Remove sensitive fields | | | * | |
| 404 error handling | | | | * (precondition) |
| Variable declaration | | | | * (var) |
| Control flow only | | | | * (conditional) |

---

## Common Gotchas

### SQL (db.direct_query)

**CRITICAL TABLE PREFIX RULES:**
1. **SELECT → `x` prefix** (view): `SELECT * FROM x40_534`
2. **INSERT/UPDATE/DELETE → `mvpw` prefix** (table): `UPDATE mvpw40_534 SET ...`
   - **`x40_*` are VIEWS (read-only!)** - UPDATE/DELETE will fail with permission errors
   - **`mvpw40_*` are TABLES (read-write)** - use for all write operations

**CRITICAL TIMESTAMP RULES:**
- Xano stores timestamps as `bigint` (Unix epoch in **milliseconds**)
- **WRONG:** `updated_at = NOW()` → DATATYPE MISMATCH error
- **CORRECT:** `updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::bigint`

**Other Gotchas:**
1. **NULLIF for PATCH**: `COALESCE(NULLIF(?, ''), existing_column)`
2. **Foreign key 0**: Use `NULLIF(?::int, 0)` to convert 0 to NULL
3. **Case-insensitive search**: Use `ILIKE` not `LIKE`
4. **Array params**: `ANY(?::int[])` for IN clause with arrays
5. **JSON columns**: AVOID SQL INSERT with JSON - use `db.add` instead
6. **INTERVAL syntax fails**: Don't use `NOW() - INTERVAL '7 days'` inline. Instead, calculate timestamp in Lambda first:
   ```xs
   // Calculate in Lambda first
   api.lambda {
     code = "return Date.now() - (7 * 24 * 60 * 60 * 1000);"
     timeout = 5
   } as $week_ago

   // Then use as parameter
   db.direct_query {
     sql = "SELECT * FROM x40_548 WHERE created_at >= ?"
     arg = $week_ago
   } as $result
   ```

### db.add / db.add_or_edit / db.bulk.*
1. **Table name**: Use table name string, NOT x-prefixed SQL table name
   - Correct: `db.add "user" { ... }`
   - Wrong: `db.add "x40_534" { ... }`
2. **Timestamps**: Use `"now"` for current time in data block
3. **Returns full record**: Always returns the inserted/updated record
4. **JSON automatic**: JSON fields are handled automatically, no casting needed
5. **Bulk items require id**: Each item in `db.bulk.update`/`db.bulk.patch` must have an `id` field
6. **Bulk vs foreach**: Use `db.bulk.*` for efficiency when updating many records at once

### Lambda
1. **Stack variables**: Use `$var.name` not `$name`
2. **Must return**: Lambda without return gives undefined
3. **JSON input**: Already parsed, don't use `JSON.parse()`
4. **Escape backslashes**: In regex, use `\\s` not `\s`
5. **Async supported**: `fetch` and `await` work in Lambda
6. **Quote escaping in complex code**: Keep Lambda compact when sent via MCP. Avoid:
   - Triple-quoted template strings inside Lambda
   - Deep nesting of string concatenation with mixed quotes
   - Build strings incrementally: `let s = 'A: ' + a + '\\n'; s += 'B: ' + b;`
7. **Newlines in strings**: Use `\\n` (double backslash) for newlines in Lambda strings
8. **Break complex logic into multiple Lambdas**: For readability and debugging, split complex operations into separate Lambda blocks with descriptive variable names:
   ```xs
   // BAD: One massive Lambda doing everything
   api.lambda {
     code = "/* 50 lines of mixed logic */"
   } as $result

   // GOOD: Logical separation with clear names
   api.lambda {
     code = "return Date.now() - (7 * 24 * 60 * 60 * 1000);"
   } as $week_ago_timestamp

   api.lambda {
     code = "return $var.deals.filter(d => d.stage !== 'lost');"
   } as $active_deals

   api.lambda {
     code = "return $var.active_deals.reduce((sum, d) => sum + d.value, 0);"
   } as $pipeline_value

   api.lambda {
     code = "return { timestamp: $var.week_ago_timestamp, deals: $var.active_deals, total: $var.pipeline_value };"
   } as $final_result
   ```
   Benefits:
   - Easier to debug (isolate which step fails)
   - Clearer intent from variable names
   - Simpler code in each block (less quote escaping issues)
   - Can inspect intermediate values

### XanoScript
1. **No commas** after `=` assignments
2. **db.del** doesn't support `as $var`
3. **precondition** for error handling, not Lambda throw

---

## Real-World Example: External API Sync

This pattern demonstrates fetching data from an external API and storing it - the recommended approach using Lambda for API calls and `db.add` for inserts:

```xs
query "pokemon/sync" verb=POST {
  description = "Sync Pokemon data from PokeAPI"

  input {
    int start_id?=1 {
      description = "Starting Pokemon ID"
    }
    int count?=3 {
      description = "Number of Pokemon to sync"
    }
  }

  stack {
    // 1. Lambda: Fetch from external API
    api.lambda {
      code = """
        const results = [];
        const startId = $input.start_id || 1;
        const count = $input.count || 3;

        for (let i = startId; i < startId + count; i++) {
          const response = await fetch('https://pokeapi.co/api/v2/pokemon/' + i);
          if (response.ok) {
            const data = await response.json();
            results.push({
              name: data.name,
              pokedex_id: data.id,
              height: data.height,
              weight: data.weight,
              types: data.types.map(t => t.type.name),
              sprite_url: data.sprites.front_default
            });
          }
        }
        return results;
      """
      timeout = 30
    } as $pokemon_data

    // 2. Foreach + db.add: Insert each record
    var $synced_pokemon { value = [] }

    foreach ($pokemon_data) {
      each as $pokemon {
        db.add "pokemon" {
          data = {
            name: $pokemon.name,
            pokedex_id: $pokemon.pokedex_id,
            height: $pokemon.height,
            weight: $pokemon.weight,
            types: $pokemon.types,         // JSON handled automatically!
            sprite_url: $pokemon.sprite_url,
            synced_at: "now"
          }
        } as $new_pokemon

        array.push $synced_pokemon {
          value = $new_pokemon
        }
      }
    }
  }

  response = {
    synced: $synced_pokemon,
    count: $synced_pokemon|length
  }
}
```

**Key Pattern Points:**
1. **Lambda for external API**: Use `fetch` with `await` to call external APIs
2. **Transform in Lambda**: Shape the data before inserting
3. **db.add for inserts**: JSON columns (like `types` array) handled automatically
4. **foreach for batch**: Loop with `db.add` for multiple records
5. **Collect results**: Use `array.push` to gather inserted records

---

## Related Skills
- [xanoscript-reference](../xanoscript-reference/SKILL.md) - Legacy XanoScript syntax (reference only)
- [api-testing](../api-testing/SKILL.md) - Testing endpoints
- [file-management](../file-management/SKILL.md) - File operations (placeholder)
- [xanoscript-debugging](../xanoscript-debugging/SKILL.md) - Error recovery patterns
