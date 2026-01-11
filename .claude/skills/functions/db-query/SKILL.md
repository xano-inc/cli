# db.query

The `db.query` function retrieves records from a database table. It's the most flexible database operation, supporting filtering, sorting, pagination, joins, and multiple return types.

## Syntax

```xs
db.query "table_name" {
  where = condition
  sort = {field: "asc"}
  return = {type: "list", paging: {...}}
} as $result
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `table_name` | Yes | Name of the table to query |
| `where` | No | Filter condition |
| `sort` | No | Sorting configuration |
| `return` | No | Return type and pagination |
| `join` | No | Join related tables |
| `eval` | No | Computed fields |
| `addon` | No | Related data fetching |

## Test Endpoints

**API Group:** xs-db-query (ID: 236)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:O7dZINYZ`

### 1. Basic List Query

**Endpoint:** `GET /db-query/list` (ID: 1922)

```xs
query "db-query/list" verb=GET {
  description = "Basic db.query returning list of tasks"

  input {}

  stack {
    db.query "mcp_task" {
      return = {type: "list"}
    } as $tasks
  }

  response = $tasks
}
```

### 2. Query with Where Filter

**Endpoint:** `GET /db-query/filter` (ID: 1923)

```xs
query "db-query/filter" verb=GET {
  description = "db.query with where filter by status"

  input {
    text status {
      description = "Status to filter by"
    }
  }

  stack {
    db.query "mcp_task" {
      where = $db.mcp_task.status == $input.status
      return = {type: "list"}
    } as $tasks
  }

  response = $tasks
}
```

### 3. Query with Pagination

**Endpoint:** `GET /db-query/paginated` (ID: 1924)

```xs
query "db-query/paginated" verb=GET {
  description = "db.query with pagination"

  input {
    int page?=1 {
      description = "Page number"
    }
    int per_page?=10 {
      description = "Items per page"
    }
  }

  stack {
    db.query "mcp_task" {
      sort = {mcp_task.created_at: "desc"}
      return = {
        type: "list",
        paging: {
          page: $input.page,
          per_page: $input.per_page,
          totals: true
        }
      }
    } as $tasks
  }

  response = $tasks
}
```

**Paginated Response Structure:**
```json
{
  "itemsReceived": 10,
  "curPage": 1,
  "nextPage": 2,
  "prevPage": null,
  "offset": 0,
  "perPage": 10,
  "items": [...]
}
```

### 4. Query Returning Count

**Endpoint:** `GET /db-query/count` (ID: 1925)

```xs
query "db-query/count" verb=GET {
  description = "db.query returning count"

  input {
    text status? {
      description = "Optional status filter"
    }
  }

  stack {
    db.query "mcp_task" {
      where = $db.mcp_task.status ==? $input.status
      return = {type: "count"}
    } as $count
  }

  response = { total_tasks: $count }
}
```

### 5. Query with Optional Filters

**Endpoint:** `GET /db-query/search` (ID: 1926)

```xs
query "db-query/search" verb=GET {
  description = "db.query with optional filters"

  input {
    text search? {
      description = "Search in title"
    }
    text status? {
      description = "Filter by status"
    }
    text priority? {
      description = "Filter by priority"
    }
  }

  stack {
    db.query "mcp_task" {
      where = $db.mcp_task.title includes? $input.search
           && $db.mcp_task.status ==? $input.status
           && $db.mcp_task.priority ==? $input.priority
      sort = {mcp_task.created_at: "desc"}
      return = {type: "list"}
    } as $tasks
  }

  response = $tasks
}
```

## Where Clause Operators

### Comparison Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equals | `$db.task.status == "active"` |
| `!=` | Not equals | `$db.task.status != "deleted"` |
| `>` | Greater than | `$db.task.priority > 5` |
| `>=` | Greater or equal | `$db.task.created_at >= $start_date` |
| `<` | Less than | `$db.task.count < 100` |
| `<=` | Less or equal | `$db.task.price <= $max_price` |

### String Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `includes` | String contains | `$db.task.title includes "bug"` |
| `includes?` | Contains (ignore if null) | `$db.task.title includes? $input.search` |

### Array Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `contains` | Array has value | `$db.post.tags contains "featured"` |
| `not contains` | Array lacks value | `$db.post.tags not contains "draft"` |
| `overlaps` | Arrays share elements | `$db.post.tags overlaps ["js", "react"]` |

### Optional Filter Operators

Add `?` after operator to ignore if value is null:

| Operator | Ignores if null |
|----------|-----------------|
| `==?` | `$db.task.status ==? $input.status` |
| `!=?` | `$db.task.type !=? $input.exclude_type` |
| `>=?` | `$db.task.date >=? $input.start_date` |
| `includes?` | `$db.task.title includes? $input.search` |

### Logical Operators

```xs
// AND
where = $db.task.status == "active" && $db.task.priority == "high"

// OR
where = $db.task.status == "active" || $db.task.status == "pending"

// Combined
where = ($db.task.status == "active" || $db.task.status == "pending")
     && $db.task.priority == "high"
```

## Return Types

### List (default)

```xs
db.query "task" {
  return = {type: "list"}
} as $tasks  // Returns array of records
```

### Single

```xs
db.query "task" {
  where = $db.task.id == $input.id
  return = {type: "single"}
} as $task  // Returns single record or null
```

### Count

```xs
db.query "task" {
  return = {type: "count"}
} as $count  // Returns integer
```

### Exists

```xs
db.query "task" {
  where = $db.task.email == $input.email
  return = {type: "exists"}
} as $exists  // Returns boolean
```

## Sorting

```xs
// Single field ascending
sort = {task.created_at: "asc"}

// Single field descending
sort = {task.created_at: "desc"}

// Random order
sort = {task.id: "rand"}

// Multiple fields
sort = {task.priority: "desc", task.created_at: "asc"}
```

## Pagination

```xs
return = {
  type: "list",
  paging: {
    page: $input.page,      // Current page number
    per_page: 25,           // Items per page
    totals: true            // Include total count
  }
}
```

## Joins

```xs
db.query "comment" {
  join = {
    post: {
      table: "post",
      type: "inner",  // inner, left, or right
      where: $db.comment.post_id == $db.post.id
    }
  }
  where = $db.post.status == "published"
} as $comments
```

**Note:** Joins allow filtering by joined table fields but don't return those fields. Use `eval` or `addon` to include related data.

## Eval (Computed Fields)

```xs
db.query "task" {
  join = {
    user: {table: "user", where: $db.task.user_id == $db.user.id}
  }
  eval = {
    author_name: $db.user.name,
    author_email: $db.user.email
  }
  return = {type: "list"}
} as $tasks
```

## Addon (Related Data)

```xs
db.query "post" {
  return = {type: "list"}
  addon = [
    {
      name: "comment_count",
      input: {post_id: $output.id},
      as: "items.comment_count"
    }
  ]
} as $posts
```

## Key Patterns

### Pattern 1: Simple List

```xs
db.query "user" {
  return = {type: "list"}
} as $users
```

### Pattern 2: Filtered and Sorted

```xs
db.query "task" {
  where = $db.task.status == "active"
  sort = {task.priority: "desc"}
  return = {type: "list"}
} as $active_tasks
```

### Pattern 3: Search with Optional Filters

```xs
db.query "product" {
  where = $db.product.category_id ==? $input.category
       && $db.product.name includes? $input.search
       && $db.product.price >=? $input.min_price
       && $db.product.price <=? $input.max_price
  return = {type: "list"}
} as $products
```

### Pattern 4: Paginated with Totals

```xs
db.query "order" {
  sort = {order.created_at: "desc"}
  return = {
    type: "list",
    paging: {
      page: $input.page,
      per_page: $input.per_page,
      totals: true
    }
  }
} as $orders
```

### Pattern 5: Check Existence

```xs
db.query "user" {
  where = $db.user.email == $input.email
  return = {type: "exists"}
} as $email_taken
```

## Gotchas and Edge Cases

1. **Table reference format**: Use `$db.tablename.field` in where clauses, not `$tablename`.

2. **Case sensitivity**: `includes` is case-insensitive by default. Don't use `icontains` - it's not valid.

3. **Null handling**: Use `==?` operators when input might be null to skip that condition.

4. **Empty result**: `type: "list"` returns `[]`, `type: "single"` returns `null`.

5. **Pagination changes structure**: When using `paging`, results are wrapped in metadata object.

6. **Join doesn't return fields**: Joins only allow filtering. Use `eval` or `addon` to get related fields.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown table` | Table name typo | Check table name spelling |
| `Unknown field` | Field doesn't exist | Verify field in schema |
| `icontains` invalid | Using wrong operator | Use `includes` instead |

## Related Functions

- [db.get](../db-get/SKILL.md) - Get single record by ID
- [db.add](../db-add/SKILL.md) - Insert new record
- [db.edit](../db-edit/SKILL.md) - Update existing record
- [db.del](../db-del/SKILL.md) - Delete record
- [db.has](../db-has/SKILL.md) - Check if record exists
