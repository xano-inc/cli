# db.add

The `db.add` function inserts a new record into a database table and returns the created record with all fields populated (including auto-generated ones like `id` and `created_at`).

## Syntax

```xs
db.add "table_name" {
  data = {
    field1: value1,
    field2: value2
  }
} as $new_record
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `table_name` | Yes | Name of the table to insert into |
| `data` | Yes | Object containing field:value pairs |

## Test Endpoints

**API Group:** xs-db-add (ID: 238)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:qN0wn1Ar`

### 1. Basic Insert

**Endpoint:** `POST /create_task` (ID: 1930) ✅ Validated

```xs
query "db-add/basic" verb=POST {
  description = "Basic record insert"

  input {
    text title {
      description = "Task title"
    }
  }

  stack {
    db.add "mcp_task" {
      data = {
        title: $input.title,
        status: "pending",
        priority: "medium"
      }
    } as $new_task
  }

  response = $new_task
}
```

**Request:**
```json
{ "title": "Build login page" }
```

**Response:**
```json
{
  "id": 42,
  "title": "Build login page",
  "status": "pending",
  "priority": "medium",
  "created_at": "2024-01-15T14:30:00Z"
}
```

### 2. Insert with All Fields

**Endpoint:** `POST /db-add/full` (ID: TBD)

```xs
query "db-add/full" verb=POST {
  description = "Insert with all fields specified"

  input {
    text title {
      description = "Task title"
    }
    text description? {
      description = "Task description"
    }
    text status?="pending" {
      description = "Task status"
    }
    text priority?="medium" {
      description = "Task priority"
    }
    int project_id? {
      description = "Project ID"
    }
  }

  stack {
    db.add "mcp_task" {
      data = {
        title: $input.title,
        description: $input.description,
        status: $input.status,
        priority: $input.priority,
        project_id: $input.project_id
      }
    } as $new_task
  }

  response = $new_task
}
```

### 3. Insert with Validation

**Endpoint:** `POST /db-add/validated` (ID: TBD)

```xs
query "db-add/validated" verb=POST {
  description = "Insert with validation checks"

  input {
    text title {
      description = "Task title"
    }
    text status {
      description = "Task status"
    }
  }

  stack {
    // Validate title is not empty
    precondition ($input.title != "" && $input.title != null) {
      error_type = "validation"
      error = "Title cannot be empty"
    }

    // Validate status is valid enum
    var $valid_statuses { value = ["pending", "in_progress", "completed"] }
    array.has $valid_statuses if ($this == $input.status) as $is_valid

    precondition ($is_valid) {
      error_type = "validation"
      error = "Status must be: pending, in_progress, or completed"
    }

    db.add "mcp_task" {
      data = {
        title: $input.title,
        status: $input.status,
        priority: "medium"
      }
    } as $new_task
  }

  response = $new_task
}
```

### 4. Insert with Related Data

**Endpoint:** `POST /db-add/with-project` (ID: TBD)

```xs
query "db-add/with-project" verb=POST {
  description = "Insert task under a project"

  input {
    text title {
      description = "Task title"
    }
    int project_id {
      description = "Project ID"
    }
  }

  stack {
    // Verify project exists
    db.get "mcp_project" {
      field_name = "id"
      field_value = $input.project_id
    } as $project

    precondition ($project != null) {
      error_type = "validation"
      error = "Project not found"
    }

    db.add "mcp_task" {
      data = {
        title: $input.title,
        project_id: $input.project_id,
        status: "pending",
        priority: "medium"
      }
    } as $new_task
  }

  response = {
    task: $new_task,
    project: $project
  }
}
```

### 5. Insert with Timestamp

**Endpoint:** `POST /db-add/with-timestamp` (ID: TBD)

```xs
query "db-add/with-timestamp" verb=POST {
  description = "Insert with explicit timestamp"

  input {
    text title {
      description = "Task title"
    }
    timestamp due_date? {
      description = "Due date for task"
    }
  }

  stack {
    var $now { value = "now"|timestamp }

    db.add "mcp_task" {
      data = {
        title: $input.title,
        status: "pending",
        priority: "medium",
        created_at: $now,
        due_date: $input.due_date
      }
    } as $new_task
  }

  response = $new_task
}
```

## Key Patterns

### Pattern 1: Basic Insert

```xs
db.add "user" {
  data = {
    name: $input.name,
    email: $input.email
  }
} as $new_user
```

### Pattern 2: Insert with Defaults

```xs
db.add "order" {
  data = {
    customer_id: $input.customer_id,
    status: "pending",           // default value
    total: 0,                    // default value
    created_at: "now"|timestamp  // current timestamp
  }
} as $new_order
```

### Pattern 3: Insert with Auth Context

```xs
db.add "post" {
  data = {
    user_id: $auth.id,           // current authenticated user
    title: $input.title,
    content: $input.content,
    status: "draft"
  }
} as $new_post
```

### Pattern 4: Insert with Computed Values

```xs
var $slug { value = $input.title|slugify }

db.add "article" {
  data = {
    title: $input.title,
    slug: $slug,
    content: $input.content
  }
} as $new_article
```

### Pattern 5: Bulk Insert (with loop)

```xs
var $results { value = [] }

foreach ($input.items) {
  each as $item {
    db.add "order_item" {
      data = {
        order_id: $input.order_id,
        product_id: $item.product_id,
        quantity: $item.quantity,
        price: $item.price
      }
    } as $new_item

    array.push $results { value = $new_item }
  }
}

response = $results
```

## Return Value

`db.add` returns the complete inserted record including:

| Field | Description |
|-------|-------------|
| `id` | Auto-generated primary key |
| All input fields | Values you provided in `data` |
| Auto-populated fields | `created_at`, default values |

Example return:
```json
{
  "id": 123,
  "title": "My Task",
  "status": "pending",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": null
}
```

## Gotchas and Edge Cases

1. **Auto-increment ID**: The `id` is auto-generated. Never include `id` in your data object.

2. **Required fields**: All non-nullable columns without defaults must be included in `data`.

3. **Null handling**: Passing `null` for a field stores `null`. Omitting a field uses the column default.

4. **Timestamps**: `created_at` is often auto-populated. Check your table schema.

5. **Return value**: Always use `as $variable` to capture the inserted record.

6. **Type coercion**: XanoScript automatically converts types (string "123" to int 123).

7. **Foreign keys**: Ensure referenced records exist before inserting (use `db.get` + `precondition`).

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown table` | Table name typo | Check table name spelling |
| `Unknown field` | Field doesn't exist | Verify column in schema |
| `NOT NULL violation` | Missing required field | Include all required fields |
| `Foreign key violation` | Referenced record missing | Verify foreign key exists |
| `Unique violation` | Duplicate unique value | Check uniqueness before insert |

## db.add vs db.add_or_edit

| Use `db.add` when... | Use `db.add_or_edit` when... |
|---------------------|------------------------------|
| Always creating new record | Upsert behavior needed |
| No duplicate check needed | May update existing |
| Simple inserts | Syncing external data |

```xs
// db.add: Always creates new
db.add "user" {
  data = { email: "test@test.com" }
} as $new_user

// db.add_or_edit: Creates OR updates
db.add_or_edit "user" {
  field_name = "email"
  field_value = "test@test.com"
  data = { name: "Updated Name" }
} as $user
```

## Related Functions

- [db.query](../db-query/SKILL.md) - Query records
- [db.get](../db-get/SKILL.md) - Get single record
- [db.edit](../db-edit/SKILL.md) - Update existing record
- [db.add_or_edit](../db-add-or-edit/SKILL.md) - Upsert record
- [db.del](../db-del/SKILL.md) - Delete record
