# db.get

The `db.get` function retrieves a single record from a database table by matching a specific field value. It's a simpler alternative to `db.query` when you need to fetch exactly one record by a known field.

## Syntax

```xs
db.get "table_name" {
  field_name = "field"
  field_value = $value
} as $result
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `table_name` | Yes | Name of the table to query |
| `field_name` | Yes | Field to match against |
| `field_value` | Yes | Value to match |

## Test Endpoints

**API Group:** xs-db-get (ID: 237)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:rSwrAMH0`

### 1. Get Task by ID

**Endpoint:** `GET /get_task` (ID: 1927) ✅ Validated

```xs
query "db-get/by-id" verb=GET {
  description = "Get single task by ID"

  input {
    int task_id {
      description = "Task ID to fetch"
    }
  }

  stack {
    db.get "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    } as $task
  }

  response = $task
}
```

**Request:** `?task_id=1`

**Response:**
```json
{
  "id": 1,
  "title": "Build user auth",
  "status": "pending",
  "priority": "high",
  "created_at": "2024-01-15T10:00:00Z"
}
```

**Response (not found):**
```json
null
```

### 2. Get Task by Status

**Endpoint:** `GET /get_task_by_status` (ID: 1928) ✅ Validated

```xs
query "db-get/by-status" verb=GET {
  description = "Get first task matching status"

  input {
    text status {
      description = "Status to search for"
    }
  }

  stack {
    db.get "mcp_task" {
      field_name = "status"
      field_value = $input.status
    } as $task
  }

  response = $task
}
```

**Note:** When multiple records match, `db.get` returns the first one found (usually by primary key order).

### 3. Get with Precondition

**Endpoint:** `GET /db-get/with-check` (ID: TBD)

```xs
query "db-get/with-check" verb=GET {
  description = "Get task with 404 if not found"

  input {
    int task_id {
      description = "Task ID to fetch"
    }
  }

  stack {
    db.get "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    } as $task

    precondition ($task != null) {
      error_type = "notfound"
      error = "Task not found"
    }
  }

  response = $task
}
```

**Request:** `?task_id=999`

**Response (404):**
```json
{
  "code": "ERROR_CODE_NOT_FOUND",
  "message": "Task not found"
}
```

### 4. Get Related Record

**Endpoint:** `GET /db-get/related` (ID: TBD)

```xs
query "db-get/related" verb=GET {
  description = "Get task then fetch related project"

  input {
    int task_id {
      description = "Task ID"
    }
  }

  stack {
    db.get "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    } as $task

    precondition ($task != null) {
      error_type = "notfound"
      error = "Task not found"
    }

    db.get "mcp_project" {
      field_name = "id"
      field_value = $task.project_id
    } as $project
  }

  response = {
    task: $task,
    project: $project
  }
}
```

### 5. Get by UUID/Unique Field

**Endpoint:** `GET /db-get/by-uuid` (ID: TBD)

```xs
query "db-get/by-uuid" verb=GET {
  description = "Get record by unique field"

  input {
    text email {
      description = "User email address"
    }
  }

  stack {
    db.get "user" {
      field_name = "email"
      field_value = $input.email
    } as $user

    precondition ($user != null) {
      error_type = "notfound"
      error = "User not found"
    }

    // Filter sensitive fields
    var $safe_user {
      value = {
        id: $user.id,
        name: $user.name,
        email: $user.email
      }
    }
  }

  response = $safe_user
}
```

## Key Patterns

### Pattern 1: Basic Get by ID

```xs
db.get "user" {
  field_name = "id"
  field_value = $input.user_id
} as $user
```

### Pattern 2: Get with 404 Handling

```xs
db.get "product" {
  field_name = "id"
  field_value = $input.product_id
} as $product

precondition ($product != null) {
  error_type = "notfound"
  error = "Product not found"
}
```

### Pattern 3: Get by Unique Field

```xs
db.get "user" {
  field_name = "email"
  field_value = $input.email
} as $user
```

### Pattern 4: Chained Gets for Related Data

```xs
// Get main record
db.get "order" {
  field_name = "id"
  field_value = $input.order_id
} as $order

// Get related customer
db.get "customer" {
  field_name = "id"
  field_value = $order.customer_id
} as $customer
```

### Pattern 5: Get for Authorization Check

```xs
db.get "document" {
  field_name = "id"
  field_value = $input.doc_id
} as $doc

precondition ($doc != null) {
  error_type = "notfound"
  error = "Document not found"
}

precondition ($doc.owner_id == $auth.id) {
  error_type = "forbidden"
  error = "Not authorized to access this document"
}
```

## db.get vs db.query

| Use `db.get` when... | Use `db.query` when... |
|---------------------|------------------------|
| Fetching one record by field | Complex filtering |
| Simple lookup by ID/unique field | Multiple conditions |
| No sorting/pagination needed | Need list of records |
| Maximum simplicity | Need joins or eval |

```xs
// db.get: Simple, returns single record or null
db.get "user" {
  field_name = "id"
  field_value = 123
} as $user

// db.query: More flexible but verbose
db.query "user" {
  where = $db.user.id == 123
  return = {type: "single"}
} as $user
```

Both return the same result, but `db.get` is cleaner for simple lookups.

## Return Value

| Scenario | Return Value |
|----------|-------------|
| Record found | The full record object |
| No record matches | `null` |
| Multiple matches | First record found |

## Gotchas and Edge Cases

1. **Returns null, not error**: If no record matches, `db.get` returns `null`. Use `precondition` for 404 errors.

2. **First match only**: When multiple records match the field value, only the first is returned (by primary key order).

3. **Field must exist**: The `field_name` must be a valid column in the table.

4. **Case sensitivity**: String comparisons are typically case-sensitive unless the database column is configured otherwise.

5. **Type matching**: `field_value` type should match the column type (string for text, number for int/id).

6. **No filtering**: Unlike `db.query`, you cannot add multiple conditions or complex filters.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown table` | Table name typo | Check table name spelling |
| `Unknown field` | Field doesn't exist | Verify field in schema |
| Returns null unexpectedly | Wrong field value type | Ensure type matches (string vs int) |
| Wrong record returned | Multiple matches | Use db.query if you need specific filtering |

## Related Functions

- [db.query](../db-query/SKILL.md) - Complex queries with filtering
- [db.has](../db-has/SKILL.md) - Check if record exists
- [db.add](../db-add/SKILL.md) - Insert new record
- [db.edit](../db-edit/SKILL.md) - Update existing record
- [db.del](../db-del/SKILL.md) - Delete record
