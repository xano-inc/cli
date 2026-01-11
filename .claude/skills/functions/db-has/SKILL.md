# db.has

The `db.has` function checks if a record exists in a database table by matching a specific field value. It returns a boolean (`true`/`false`) rather than the record itself.

## Syntax

```xs
db.has "table_name" {
  field_name = "field"
  field_value = $value
} as $exists
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `table_name` | Yes | Name of the table to check |
| `field_name` | Yes | Field to match against |
| `field_value` | Yes | Value to match |

## Test Endpoints

**API Group:** xs-db-has (ID: 241)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:XBigjOBv`

### 1. Check Task Exists by ID

**Endpoint:** `GET /check_exists` (ID: 1933) ✅ Validated

```xs
query "check_exists" verb=GET {
  description = "Check if task exists by ID"

  input {
    int id {
      description = "Task ID to check"
    }
  }

  stack {
    db.has "mcp_task" {
      field_name = "id"
      field_value = $input.id
    } as $exists
  }

  response = $exists
}
```

**Request:** `?id=1`
**Response:** `true`

**Request:** `?id=99999`
**Response:** `false`

## Key Patterns

### Pattern 1: Basic Existence Check

```xs
db.has "user" {
  field_name = "id"
  field_value = $input.user_id
} as $user_exists
```

### Pattern 2: Check Before Insert (Uniqueness)

```xs
// Check if email already exists
db.has "user" {
  field_name = "email"
  field_value = $input.email
} as $email_taken

precondition (!$email_taken) {
  error_type = "validation"
  error = "Email already registered"
}

// Safe to insert
db.add "user" {
  data = { email: $input.email, name: $input.name }
} as $new_user
```

### Pattern 3: Conditional Logic Based on Existence

```xs
db.has "subscription" {
  field_name = "user_id"
  field_value = $auth.id
} as $has_subscription

conditional {
  if ($has_subscription) {
    var $access { value = "premium" }
  }
  else {
    var $access { value = "free" }
  }
}
```

### Pattern 4: Validate Foreign Key

```xs
// Check if referenced project exists
db.has "project" {
  field_name = "id"
  field_value = $input.project_id
} as $project_exists

precondition ($project_exists) {
  error_type = "validation"
  error = "Invalid project_id"
}
```

### Pattern 5: Check by Unique Field

```xs
db.has "user" {
  field_name = "email"
  field_value = $input.email
} as $email_exists

response = { email_available: !$email_exists }
```

## db.has vs db.get vs db.query

| Function | Returns | Use When |
|----------|---------|----------|
| `db.has` | `true`/`false` | Only need to know if record exists |
| `db.get` | Record or `null` | Need the record data |
| `db.query` with `exists` | `true`/`false` | Complex conditions needed |

```xs
// db.has: Simple, returns boolean
db.has "user" {
  field_name = "email"
  field_value = "test@test.com"
} as $exists  // true or false

// db.get: Returns record or null
db.get "user" {
  field_name = "email"
  field_value = "test@test.com"
} as $user  // {id: 1, ...} or null

// db.query: More flexible but verbose
db.query "user" {
  where = $db.user.email == "test@test.com"
  return = {type: "exists"}
} as $exists  // true or false
```

## Return Value

| Scenario | Return Value |
|----------|-------------|
| Record exists | `true` |
| No record matches | `false` |

## Gotchas and Edge Cases

1. **Boolean return**: Always returns `true` or `false`, never the record.

2. **First match**: Checks if ANY record matches, not how many.

3. **Case sensitivity**: String comparisons follow database collation settings.

4. **Null values**: Checking for `null` field values may have unexpected behavior.

5. **Performance**: More efficient than `db.get` when you don't need the record data.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Unknown table` | Table name typo | Check table name spelling |
| `Unknown field` | Field doesn't exist | Verify column in schema |
| Returns `false` unexpectedly | Wrong field value type | Ensure type matches |

## Related Functions

- [db.get](../db-get/SKILL.md) - Get single record
- [db.query](../db-query/SKILL.md) - Complex queries with `exists` return type
- [precondition](../precondition/SKILL.md) - Use with db.has for validation
