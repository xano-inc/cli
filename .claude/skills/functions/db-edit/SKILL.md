# db.edit

The `db.edit` function updates an existing record in a database table by matching a specific field value. It returns the updated record with all fields.

## Syntax

```xs
db.edit "table_name" {
  field_name = "field"
  field_value = $value
  data = {
    field1: new_value1,
    field2: new_value2
  }
} as $updated_record
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `table_name` | Yes | Name of the table to update |
| `field_name` | Yes | Field to match for finding record |
| `field_value` | Yes | Value to match |
| `data` | Yes | Object with fields to update |

## Test Endpoints

**API Group:** xs-db-edit (ID: 239)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:-YIscTU7`

### 1. Basic Update

**Endpoint:** `PATCH /update_task` (ID: 1931) ✅ Validated

```xs
query "db-edit/basic" verb=PATCH {
  description = "Basic record update"

  input {
    int task_id {
      description = "Task ID to update"
    }
    text title {
      description = "New title"
    }
  }

  stack {
    db.edit "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
      data = {
        title: $input.title
      }
    } as $updated_task
  }

  response = $updated_task
}
```

**Request:**
```json
{ "task_id": 1, "title": "Updated Task Title" }
```

**Response:**
```json
{
  "id": 1,
  "title": "Updated Task Title",
  "status": "pending",
  "priority": "high",
  "created_at": "2024-01-15T10:00:00Z"
}
```

### 2. Update Multiple Fields

**Endpoint:** `PATCH /db-edit/multi` (ID: TBD)

```xs
query "db-edit/multi" verb=PATCH {
  description = "Update multiple fields at once"

  input {
    int task_id {
      description = "Task ID"
    }
    text title {
      description = "New title"
    }
    text status {
      description = "New status"
    }
    text priority {
      description = "New priority"
    }
  }

  stack {
    db.edit "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
      data = {
        title: $input.title,
        status: $input.status,
        priority: $input.priority
      }
    } as $updated_task
  }

  response = $updated_task
}
```

### 3. Update with Validation

**Endpoint:** `PATCH /db-edit/validated` (ID: TBD)

```xs
query "db-edit/validated" verb=PATCH {
  description = "Update with precondition checks"

  input {
    int task_id {
      description = "Task ID"
    }
    text status {
      description = "New status"
    }
  }

  stack {
    // First verify record exists
    db.get "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    } as $existing

    precondition ($existing != null) {
      error_type = "notfound"
      error = "Task not found"
    }

    // Validate status transition
    var $valid_statuses { value = ["pending", "in_progress", "completed"] }
    array.has $valid_statuses if ($this == $input.status) as $is_valid

    precondition ($is_valid) {
      error_type = "validation"
      error = "Invalid status value"
    }

    db.edit "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
      data = {
        status: $input.status
      }
    } as $updated_task
  }

  response = $updated_task
}
```

### 4. Preserve Existing Values (PATCH Semantics)

**Endpoint:** `PATCH /db-edit/preserve` (ID: TBD)

```xs
query "db-edit/preserve" verb=PATCH {
  description = "Update only provided fields, preserve others"

  input {
    int task_id {
      description = "Task ID"
    }
    text title? {
      description = "New title (optional)"
    }
    text status? {
      description = "New status (optional)"
    }
    text priority? {
      description = "New priority (optional)"
    }
  }

  stack {
    // Get existing record
    db.get "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
    } as $existing

    precondition ($existing != null) {
      error_type = "notfound"
      error = "Task not found"
    }

    // Use || to preserve existing values if input is null
    db.edit "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
      data = {
        title: $input.title || $existing.title,
        status: $input.status || $existing.status,
        priority: $input.priority || $existing.priority
      }
    } as $updated_task
  }

  response = $updated_task
}
```

### 5. Update with Timestamp

**Endpoint:** `PATCH /db-edit/timestamp` (ID: TBD)

```xs
query "db-edit/timestamp" verb=PATCH {
  description = "Update with auto-timestamp"

  input {
    int task_id {
      description = "Task ID"
    }
    text status {
      description = "New status"
    }
  }

  stack {
    var $now { value = "now"|timestamp }

    db.edit "mcp_task" {
      field_name = "id"
      field_value = $input.task_id
      data = {
        status: $input.status,
        updated_at: $now
      }
    } as $updated_task
  }

  response = $updated_task
}
```

## db.edit vs db.patch

XanoScript has two update methods:

### db.edit
- Data fields must be specified inline
- Cannot pass a variable for data object
- Use when update fields are known at design time

```xs
db.edit "task" {
  field_name = "id"
  field_value = $input.id
  data = {
    title: $input.title,
    status: $input.status
  }
} as $updated
```

### db.patch
- Can pass a variable for data object
- Better for dynamic updates
- Use when update fields are built dynamically

```xs
var $payload {
  value = { status: "active" }
}

conditional {
  if ($input.is_featured) {
    var.update $payload.featured { value = true }
  }
}

db.patch "task" {
  field_name = "id"
  field_value = $input.id
  data = $payload
} as $updated
```

## Key Patterns

### Pattern 1: Basic Update by ID

```xs
db.edit "user" {
  field_name = "id"
  field_value = $input.user_id
  data = {
    name: $input.name
  }
} as $updated_user
```

### Pattern 2: Update with Existence Check

```xs
db.get "product" {
  field_name = "id"
  field_value = $input.product_id
} as $existing

precondition ($existing != null) {
  error_type = "notfound"
  error = "Product not found"
}

db.edit "product" {
  field_name = "id"
  field_value = $input.product_id
  data = { price: $input.price }
} as $updated
```

### Pattern 3: Preserve Fields with ||

```xs
// CRITICAL: Use || to avoid blanking fields
db.edit "user" {
  field_name = "id"
  field_value = $input.user_id
  data = {
    name: $input.name || $existing.name,
    email: $input.email || $existing.email,
    phone: $input.phone || $existing.phone
  }
} as $updated_user
```

### Pattern 4: Update by Non-ID Field

```xs
db.edit "user" {
  field_name = "email"
  field_value = $input.email
  data = {
    password: $input.new_password|bcrypt
  }
} as $updated_user
```

### Pattern 5: Status Transition Update

```xs
db.edit "order" {
  field_name = "id"
  field_value = $input.order_id
  data = {
    status: "shipped",
    shipped_at: "now"|timestamp
  }
} as $updated_order
```

## Return Value

`db.edit` returns the complete updated record including:

| Field | Description |
|-------|-------------|
| All fields | Current values after update |
| Auto-updated fields | `updated_at` if configured |

## Gotchas and Edge Cases

1. **Blanking fields**: If you pass `null` for a field, it sets that field to `null`. Use `||` to preserve existing values.

2. **No upsert**: If no record matches, nothing is updated and no error is thrown. Check existence first.

3. **First match only**: If multiple records match `field_name/field_value`, only the first is updated.

4. **Return value**: The returned record reflects the state AFTER the update.

5. **Partial updates**: You only need to include fields you want to change. Other fields remain unchanged.

6. **No ID update**: You cannot update the primary key `id` field.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown table` | Table name typo | Check table name spelling |
| `Unknown field` | Field doesn't exist | Verify column in schema |
| Field becomes null | Passed null value | Use `||` pattern to preserve |
| No update happens | No matching record | Add existence check first |

## Security Note

Always verify the user has permission to update the record:

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
  error = "Not authorized to edit this document"
}

db.edit "document" { ... } as $updated
```

## Related Functions

- [db.query](../db-query/SKILL.md) - Query records
- [db.get](../db-get/SKILL.md) - Get single record
- [db.add](../db-add/SKILL.md) - Insert new record
- [db.add_or_edit](../db-add-or-edit/SKILL.md) - Upsert record
- [db.del](../db-del/SKILL.md) - Delete record
