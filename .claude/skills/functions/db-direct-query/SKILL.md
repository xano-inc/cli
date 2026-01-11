# db.direct_query

The `db.direct_query` function executes raw SQL queries directly against the PostgreSQL database. This is the PRIMARY method for database operations in XanoScript, offering full SQL power for SELECT, UPDATE, DELETE, and complex queries.

## Syntax

```xs
db.direct_query {
  sql = "SQL_QUERY_HERE"
  response_type = "list" | "single"
  arg = $value1
  arg = $value2
} as $result
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `sql` | Yes | Raw SQL query string with `?` placeholders |
| `response_type` | Yes | `"list"` for multiple rows, `"single"` for one row |
| `arg` | No | Argument for each `?` placeholder (repeat for multiple) |

## Test Endpoints

**API Group:** xs-db-direct-query (ID: 243)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:XyfXO9-p`

**Validation Status:** Patterns validated via sql-lambda-patterns skill. MCP deployment has limitations with empty input blocks - manual Xano dashboard deployment recommended for complex endpoints.

**Reference:** See [sql-lambda-patterns](../../sql-lambda-patterns/SKILL.md) for extensively validated db.direct_query patterns including:
- All CRUD operations
- JOINs and CTEs
- Pagination
- Search with ILIKE
- Dashboard analytics

## Key Patterns

### Pattern 1: Basic SELECT (No Parameters)

```xs
db.direct_query {
  sql = "SELECT * FROM x40_564 ORDER BY id DESC LIMIT 10"
  response_type = "list"
} as $tasks
```

### Pattern 2: SELECT with Single Parameter

```xs
db.direct_query {
  sql = "SELECT * FROM x40_564 WHERE id = ?"
  response_type = "single"
  arg = $input.id
} as $task

precondition ($task != null) {
  error_type = "notfound"
  error = "Task not found"
}
```

### Pattern 3: SELECT with Multiple Parameters

**CRITICAL: Use multiple `arg =` lines, NOT arrays!**

```xs
db.direct_query {
  sql = "SELECT * FROM x40_564 WHERE status = ? AND priority = ? LIMIT ?"
  response_type = "list"
  arg = $input.status
  arg = $input.priority
  arg = $input.limit
} as $tasks
```

### Pattern 4: UPDATE with NULLIF (PATCH semantics)

**Use NULLIF to preserve existing values when field is empty:**

```xs
db.direct_query {
  sql = """
    UPDATE x40_564 SET
      title = COALESCE(NULLIF(?, ''), title),
      status = COALESCE(NULLIF(?, ''), status),
      updated_at = NOW()
    WHERE id = ?
    RETURNING *
  """
  response_type = "single"
  arg = $input.title
  arg = $input.status
  arg = $input.id
} as $updated
```

### Pattern 5: DELETE with RETURNING

```xs
db.direct_query {
  sql = "DELETE FROM x40_564 WHERE id = ? RETURNING id"
  response_type = "single"
  arg = $input.id
} as $deleted

precondition ($deleted != null) {
  error_type = "notfound"
  error = "Task not found"
}
```

### Pattern 6: JOIN Query

```xs
db.direct_query {
  sql = """
    SELECT
      t.*,
      p.name as project_name
    FROM x40_564 t
    LEFT JOIN x40_563 p ON t.project_id = p.id
    WHERE t.id = ?
  """
  response_type = "single"
  arg = $input.task_id
} as $task_with_project
```

### Pattern 7: Aggregation Query

```xs
db.direct_query {
  sql = """
    SELECT
      status,
      COUNT(*) as count,
      AVG(estimate_points) as avg_points
    FROM x40_564
    GROUP BY status
    ORDER BY count DESC
  """
  response_type = "list"
} as $stats
```

### Pattern 8: Search with ILIKE

```xs
db.direct_query {
  sql = """
    SELECT * FROM x40_564
    WHERE (? IS NULL OR title ILIKE '%' || ? || '%')
    ORDER BY created_at DESC
    LIMIT 50
  """
  response_type = "list"
  arg = $input.q
  arg = $input.q
} as $results
```

### Pattern 9: Pagination with COUNT

```xs
db.direct_query {
  sql = """
    SELECT *, COUNT(*) OVER() as total_count
    FROM x40_564
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  """
  response_type = "list"
  arg = $input.per_page
  arg = $input.offset
} as $tasks
```

### Pattern 10: CTE (Common Table Expression)

```xs
db.direct_query {
  sql = """
    WITH task_stats AS (
      SELECT
        project_id,
        COUNT(*) as task_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done_count
      FROM x40_564
      GROUP BY project_id
    )
    SELECT
      p.name,
      COALESCE(s.task_count, 0) as tasks,
      COALESCE(s.done_count, 0) as done,
      CASE WHEN s.task_count > 0
        THEN ROUND(s.done_count::numeric / s.task_count * 100, 1)
        ELSE 0
      END as completion_pct
    FROM x40_563 p
    LEFT JOIN task_stats s ON p.id = s.project_id
    ORDER BY s.task_count DESC NULLS LAST
  """
  response_type = "list"
} as $project_progress
```

## Table Name Format

**CRITICAL: Always look up table IDs first!**

| Prefix | Format | Use Case |
|--------|--------|----------|
| `x` | `x{workspace}_{table_id}` | Read-only, flattened columns (recommended) |
| `mvpw` | `mvpw{workspace}_{table_id}` | Raw data with id + xdo columns |

### Workflow:
1. Get table ID: `"List all tables"` via MCP
2. Construct name: `x40_564` (workspace 40, table 564)
3. Use in SQL: `SELECT * FROM x40_564`

## db.direct_query vs Native db.* Functions

| Operation | Use | Reason |
|-----------|-----|--------|
| **SELECT** (any) | `db.direct_query` | Full SQL power, JOINs, CTEs |
| **INSERT** (single) | `db.add` | Handles JSON types automatically |
| **INSERT** (bulk) | `foreach + db.add` | Better for JSON columns |
| **UPDATE** (partial) | `db.direct_query` | NULLIF pattern for PATCH |
| **UPDATE** (full) | `db.edit` | Simple field updates |
| **DELETE** | `db.direct_query` | Simple, with RETURNING |
| **Aggregations** | `db.direct_query` | COUNT, SUM, AVG, etc. |
| **Exists check** | `db.has` | More efficient than SELECT |

## Return Value

| response_type | Match | Return |
|---------------|-------|--------|
| `"list"` | Multiple rows | Array of records |
| `"list"` | No matches | Empty array `[]` |
| `"single"` | One row | Record object |
| `"single"` | No match | `null` |

## Gotchas and Edge Cases

1. **Table name format**: Use `x{workspace}_{table_id}`, NOT table name string.
   - Correct: `SELECT * FROM x40_564`
   - Wrong: `SELECT * FROM mcp_task`

2. **Multiple args**: Use repeated `arg =` lines, NOT array syntax.
   ```xs
   // CORRECT
   arg = $input.status
   arg = $input.priority

   // WRONG - Arrays fail!
   arg = [$input.status, $input.priority]
   ```

3. **NULLIF for PATCH**: Always use `COALESCE(NULLIF(?, ''), column)` to preserve values.

4. **No INSERT**: Avoid SQL INSERT for JSON columns - use `db.add` instead.

5. **PostgreSQL dialect**: Xano uses PostgreSQL syntax (ILIKE, ::type, etc.).

6. **INTERVAL syntax**: May fail inline. Calculate timestamp in Lambda first:
   ```xs
   api.lambda {
     code = "return Date.now() - (7 * 24 * 60 * 60 * 1000);"
   } as $week_ago

   db.direct_query {
     sql = "SELECT * FROM x40_564 WHERE created_at >= ?"
     arg = $week_ago
   } as $recent
   ```

7. **NULL vs empty string**: `?` with empty string doesn't match NULL. Use `NULLIF(?, '')`.

8. **Foreign key 0**: Use `NULLIF(?::int, 0)` to convert 0 to NULL.

9. **Array parameters**: For IN clause, use `ANY(?::int[])`.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `relation does not exist` | Wrong table name | Use `x{workspace}_{table_id}` format |
| `syntax error at or near` | SQL syntax issue | Check PostgreSQL syntax |
| `parameter $N not found` | Mismatched `?` and `arg` count | Match placeholders to args |
| `DATATYPE MISMATCH` | JSON in SQL INSERT | Use `db.add` instead |

## Security Note

**Always use parameterized queries!** Never concatenate user input into SQL strings.

```xs
// SECURE - Use ? placeholders
db.direct_query {
  sql = "SELECT * FROM x40_564 WHERE id = ?"
  arg = $input.id
} as $record

// INSECURE - SQL injection risk!
db.direct_query {
  sql = "SELECT * FROM x40_564 WHERE id = " + $input.id
} as $record
```

## Complete Endpoint Example

```xs
query "tasks" verb=GET {
  description = "List tasks with pagination and search"

  input {
    int page?
    int per_page?
    text search?
    text status?
  }

  stack {
    var $limit { value = $input.per_page || 20 }
    var $offset { value = (($input.page || 1) - 1) * $limit }

    db.direct_query {
      sql = """
        SELECT *, COUNT(*) OVER() as total_count
        FROM x40_564
        WHERE (? IS NULL OR title ILIKE '%' || ? || '%')
          AND (? IS NULL OR status = ?)
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      """
      response_type = "list"
      arg = $input.search
      arg = $input.search
      arg = $input.status
      arg = $input.status
      arg = $limit
      arg = $offset
    } as $tasks

    api.lambda {
      code = """
        const items = $var.tasks;
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

## Related Functions

- [db.query](../db-query/SKILL.md) - XanoScript native query (simpler but less powerful)
- [db.add](../db-add/SKILL.md) - Insert records (better for JSON columns)
- [db.edit](../db-edit/SKILL.md) - Update records
- [db.get](../db-get/SKILL.md) - Get single record by field
- [db.has](../db-has/SKILL.md) - Check record existence
