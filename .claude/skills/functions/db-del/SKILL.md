# db.del

The `db.del` function deletes a record from a database table by matching a specific field value. Unlike other database operations, it does not return the deleted record.

## Syntax

```xs
db.del "table_name" {
  field_name = "field"
  field_value = $value
}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `table_name` | Yes | Name of the table to delete from |
| `field_name` | Yes | Field to match for finding record |
| `field_value` | Yes | Value to match |

**Note:** `db.del` does NOT return a value - don't use `as $variable`.

## Test Endpoints

**API Group:** xs-db-del (ID: 240)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:I_D9Oo5c`

### 1. Basic Delete

**Endpoint:** `DELETE /delete_task` (ID: 1932) ✅ Validated

```xs
query "db-del/basic/{task_id}" verb=DELETE {
  description = "Basic record deletion"

  input {
    int task_id {
      description = "Task ID to delete"
    }
  }

  stack {
    db.del "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    }
  }

  response = {
    success: true,
    deleted_id: $input.task_id
  }
}
```

**Request:** `DELETE /db-del/basic/42`

**Response:**
```json
{
  "success": true,
  "deleted_id": 42
}
```

### 2. Delete with Existence Check

**Endpoint:** `DELETE /db-del/checked/{task_id}` (ID: TBD)

```xs
query "db-del/checked/{task_id}" verb=DELETE {
  description = "Delete with 404 if not found"

  input {
    int task_id {
      description = "Task ID to delete"
    }
  }

  stack {
    // Verify record exists before deleting
    db.get "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    } as $existing

    precondition ($existing != null) {
      error_type = "notfound"
      error = "Task not found"
    }

    db.del "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    }
  }

  response = {
    success: true,
    deleted: $existing
  }
}
```

**Response (success):**
```json
{
  "success": true,
  "deleted": {
    "id": 42,
    "title": "Old Task",
    "status": "completed"
  }
}
```

**Response (404):**
```json
{
  "code": "ERROR_CODE_NOT_FOUND",
  "message": "Task not found"
}
```

### 3. Delete with Authorization

**Endpoint:** `DELETE /db-del/authorized/{task_id}` (ID: TBD)

```xs
query "db-del/authorized/{task_id}" verb=DELETE {
  description = "Delete with ownership check"

  input {
    int task_id {
      description = "Task ID to delete"
    }
  }

  stack {
    // Get record to check ownership
    db.get "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    } as $task

    precondition ($task != null) {
      error_type = "notfound"
      error = "Task not found"
    }

    // Check user owns the task
    precondition ($task.user_id == $auth.id) {
      error_type = "forbidden"
      error = "Not authorized to delete this task"
    }

    db.del "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    }
  }

  response = {
    success: true,
    message: "Task deleted"
  }
}
```

### 4. Soft Delete Pattern

**Endpoint:** `DELETE /db-del/soft/{task_id}` (ID: TBD)

```xs
query "db-del/soft/{task_id}" verb=DELETE {
  description = "Soft delete (mark as deleted)"

  input {
    int task_id {
      description = "Task ID to soft delete"
    }
  }

  stack {
    db.get "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    } as $existing

    precondition ($existing != null) {
      error_type = "notfound"
      error = "Task not found"
    }

    // Soft delete: update status instead of deleting
    db.edit "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
      data = {
        status: "deleted",
        deleted_at: "now"|timestamp
      }
    } as $deleted_task
  }

  response = {
    success: true,
    task: $deleted_task
  }
}
```

### 5. Cascade Delete

**Endpoint:** `DELETE /db-del/cascade/{project_id}` (ID: TBD)

```xs
query "db-del/cascade/{project_id}" verb=DELETE {
  description = "Delete project and all its tasks"

  input {
    int project_id {
      description = "Project ID to delete"
    }
  }

  stack {
    // Verify project exists
    db.get "mcp_project" {
      field_name = "id"
      field_value = $input.project_id
    } as $project

    precondition ($project != null) {
      error_type = "notfound"
      error = "Project not found"
    }

    // Get all tasks for this project
    db.query "mcp_task" {
      where = $db.mcp_task.project_id == $input.project_id
      return = {type: "list"}
    } as $tasks

    // Delete each task
    var $deleted_count { value = 0 }
    foreach ($tasks) {
      each as $task {
        db.del "mcp_task" {
          field_name = "id"
          field_value = $task.id
        }
        math.add $deleted_count { value = 1 }
      }
    }

    // Delete the project
    db.del "mcp_project" {
      field_name = "id"
      field_value = $input.project_id
    }
  }

  response = {
    success: true,
    project_deleted: $project.name,
    tasks_deleted: $deleted_count
  }
}
```

## Key Patterns

### Pattern 1: Basic Delete by ID

```xs
db.del "user" {
  field_name = "id"
  field_value = $input.user_id
}
```

### Pattern 2: Delete with 404 Check

```xs
db.get "product" {
  field_name = "id"
  field_value = $input.product_id
} as $existing

precondition ($existing != null) {
  error_type = "notfound"
  error = "Product not found"
}

db.del "product" {
  field_name = "id"
  field_value = $input.product_id
}
```

### Pattern 3: Delete with Authorization

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
  error = "Not authorized to delete"
}

db.del "document" {
  field_name = "id"
  field_value = $input.doc_id
}
```

### Pattern 4: Soft Delete (Recommended)

```xs
// Instead of hard delete:
db.edit "order" {
  field_name = "id"
  field_value = $input.order_id
  data = {
    is_deleted: true,
    deleted_at: "now"|timestamp
  }
} as $deleted
```

### Pattern 5: Bulk Delete

```xs
db.query "temp_files" {
  where = $db.temp_files.created_at < ("now"|timestamp_add_days:-30)
  return = {type: "list"}
} as $old_files

foreach ($old_files) {
  each as $file {
    db.del "temp_files" {
      field_name = "id"
      field_value = $file.id
    }
  }
}
```

## Hard Delete vs Soft Delete

| Hard Delete (`db.del`) | Soft Delete (`db.edit`) |
|-----------------------|------------------------|
| Permanently removes record | Marks record as deleted |
| Cannot be undone | Can be restored |
| Frees database space | Preserves audit trail |
| Use for: temp data, logs | Use for: user data, orders |

### Soft Delete Implementation

Add these columns to your table:
- `is_deleted` (boolean, default: false)
- `deleted_at` (timestamp, nullable)

Then filter queries:
```xs
db.query "orders" {
  where = $db.orders.is_deleted != true
  return = {type: "list"}
} as $active_orders
```

## Return Value

**`db.del` returns nothing.** If you need the deleted record's data, fetch it before deleting:

```xs
// Get record BEFORE deleting
db.get "task" {
  field_name = "id"
  field_value = $input.task_id
} as $to_delete

db.del "task" {
  field_name = "id"
  field_value = $input.task_id
}

response = {
  deleted: $to_delete
}
```

## Gotchas and Edge Cases

1. **No return value**: `db.del` does not return anything. Don't use `as $variable`.

2. **Silent failure**: If no record matches, nothing happens and no error is thrown.

3. **First match only**: If multiple records match, only the first is deleted.

4. **Cascading**: XanoScript doesn't auto-cascade. Delete related records manually.

5. **Foreign keys**: Deleting a parent record may fail if child records exist with foreign key constraints.

6. **No undo**: Hard deletes are permanent. Consider soft delete for important data.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown table` | Table name typo | Check table name spelling |
| `Unknown field` | Field doesn't exist | Verify column in schema |
| `Foreign key violation` | Child records exist | Delete children first or use soft delete |
| `Using as $variable` | db.del returns nothing | Remove the `as` clause |

## Security Best Practices

1. **Always check existence first** - Return proper 404 errors
2. **Always check authorization** - Verify user can delete the resource
3. **Consider soft delete** - For user-generated content
4. **Log deletions** - Create audit trail for important data
5. **Handle cascades** - Delete or update related records

## Related Functions

- [db.query](../db-query/SKILL.md) - Query records
- [db.get](../db-get/SKILL.md) - Get single record
- [db.add](../db-add/SKILL.md) - Insert new record
- [db.edit](../db-edit/SKILL.md) - Update existing record
- [db.truncate](../db-truncate/SKILL.md) - Delete all records
