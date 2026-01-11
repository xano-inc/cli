# db.add_or_edit

The `db.add_or_edit` function performs an "upsert" operation - it inserts a new record if no match is found, or updates an existing record if one matches the specified field. This is useful for syncing data or ensuring idempotent operations.

## Syntax

```xs
db.add_or_edit "table_name" {
  field_name = "field"
  field_value = $value
  data = {
    field1: value1,
    field2: value2
  }
} as $result
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `table_name` | Yes | Name of the table |
| `field_name` | Yes | Field to match for finding existing record |
| `field_value` | Yes | Value to match |
| `data` | Yes | Object with fields to set (both insert and update) |

## Test Endpoints

**API Group:** xs-db-add-or-edit (ID: 242)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:Aa2hPVWC`

### 1. Upsert Task by Title

**Endpoint:** `POST /upsert_record` (ID: 1934) ✅ Validated

```xs
query "upsert_record" verb=POST {
  description = "Upsert task matching by title"

  input {
    text title {
      description = "Task title (match field)"
    }
    text status {
      description = "Task status"
    }
    text priority {
      description = "Task priority"
    }
  }

  stack {
    db.add_or_edit "mcp_task" {
      field_name = "title"
      field_value = $input.title
      data = {
        title: $input.title,
        status: $input.status,
        priority: $input.priority
      }
    } as $result
  }

  response = $result
}
```

**First Call (creates new):**
```json
{"title":"Upsert Test","status":"planned","priority":"low"}
→ {"id": 10, "title": "Upsert Test", "status": "planned", "priority": "low"}
```

**Second Call (updates existing):**
```json
{"title":"Upsert Test","status":"in_progress","priority":"high"}
→ {"id": 10, "title": "Upsert Test", "status": "in_progress", "priority": "high"}
```

Same ID, different status/priority - the existing record was updated.

## Key Patterns

### Pattern 1: Sync External Data

```xs
// Sync user from external system
db.add_or_edit "user" {
  field_name = "external_id"
  field_value = $input.external_id
  data = {
    external_id: $input.external_id,
    name: $input.name,
    email: $input.email,
    synced_at: "now"|timestamp
  }
} as $synced_user
```

### Pattern 2: Upsert by Email

```xs
db.add_or_edit "subscriber" {
  field_name = "email"
  field_value = $input.email
  data = {
    email: $input.email,
    preferences: $input.preferences,
    updated_at: "now"|timestamp
  }
} as $subscriber
```

### Pattern 3: Idempotent API

```xs
// Same request can be sent multiple times safely
db.add_or_edit "order" {
  field_name = "idempotency_key"
  field_value = $input.idempotency_key
  data = {
    idempotency_key: $input.idempotency_key,
    amount: $input.amount,
    status: "pending"
  }
} as $order
```

### Pattern 4: User Settings

```xs
// Create or update user settings
db.add_or_edit "user_settings" {
  field_name = "user_id"
  field_value = $auth.id
  data = {
    user_id: $auth.id,
    theme: $input.theme,
    notifications: $input.notifications
  }
} as $settings
```

### Pattern 5: Counter/Stats Table

```xs
// Increment page views, creating record if first view
db.add_or_edit "page_stats" {
  field_name = "page_url"
  field_value = $input.url
  data = {
    page_url: $input.url,
    view_count: 1  // Note: This overwrites, see gotchas
  }
} as $stats
```

## Behavior Details

| Scenario | Action |
|----------|--------|
| No matching record | Inserts new record with `data` values |
| Matching record exists | Updates record with `data` values |
| Multiple matches | Updates first matching record |

## db.add_or_edit vs db.add + db.edit

| Use `db.add_or_edit` when... | Use separate add/edit when... |
|------------------------------|-------------------------------|
| Syncing external data | Different logic for insert vs update |
| Idempotent operations | Need to know if created or updated |
| Settings/preferences | Complex conditional updates |
| Single atomic operation | Partial updates only |

```xs
// db.add_or_edit: Single atomic operation
db.add_or_edit "config" {
  field_name = "key"
  field_value = "theme"
  data = { key: "theme", value: "dark" }
} as $config

// Separate: More control but two operations
db.has "config" {
  field_name = "key"
  field_value = "theme"
} as $exists

conditional {
  if ($exists) {
    db.edit "config" { ... } as $config
  }
  else {
    db.add "config" { ... } as $config
  }
}
```

## Return Value

Returns the record after the operation:

| Scenario | Return |
|----------|--------|
| New record created | The inserted record with new ID |
| Existing updated | The updated record with same ID |

## Gotchas and Edge Cases

1. **Full replacement**: The `data` object replaces all specified fields - it doesn't merge with existing values.

2. **Include match field in data**: Always include `field_name` value in `data` to ensure consistency.

3. **No partial update**: Unlike PATCH, this sets all fields in `data`, potentially overwriting existing values.

4. **First match wins**: If multiple records match, only the first is updated.

5. **Empty field_value**: If `field_value` is empty/null, behavior may vary - typically creates new record.

6. **Type matching**: Ensure `field_value` type matches the column type.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown table` | Table name typo | Check table name |
| `Unknown field` | Field doesn't exist | Verify column exists |
| Creates duplicate | Match field not unique | Use unique field for matching |
| Overwrites data | Not including all fields | Include all fields you want to preserve |

## Related Functions

- [db.add](../db-add/SKILL.md) - Insert only
- [db.edit](../db-edit/SKILL.md) - Update only
- [db.has](../db-has/SKILL.md) - Check existence
- [db.get](../db-get/SKILL.md) - Get before update
