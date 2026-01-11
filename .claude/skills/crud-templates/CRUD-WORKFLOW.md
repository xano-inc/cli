# CRUD Auto-Generation Workflow

## Overview

This document defines the standard workflow for creating a table and automatically generating all CRUD endpoints.

## Intent Patterns

Claude should recognize these patterns and trigger the CRUD workflow:

```
"Create table X with CRUD endpoints"
"Create X table with full CRUD"
"Generate CRUD APIs for table X"
"Create X entity with all endpoints"
```

## Workflow Steps

### Step 1: Get Workspace Context

```
xano_execute: "Get full context for workspace 40"
```

This returns:
- All existing tables with IDs
- All API groups with IDs
- Use this to avoid naming conflicts and get correct IDs

### Step 2: Create the Table

```
xano_execute: "Create a table called '{TABLE_NAME}' with columns:
- name (text, required)
- description (text, optional)
- [additional columns as specified]
- created_at (timestamp)"
```

**Important:** Note the new table ID from the response.

### Step 3: Create or Identify API Group

Option A - Create new group:
```
xano_execute: "Create API group called '{TABLE_NAME}' with description 'CRUD endpoints for {TABLE_NAME}'"
```

Option B - Use existing group:
```
Use the apigroup_id from workspace context
```

### Step 4: Generate CRUD Endpoints

Execute these 5 endpoint creations in sequence:

#### 4.1 LIST Endpoint (GET /{table})
```
xano_execute: "Create endpoint in API group {GROUP_ID}. XanoScript:
query \"{TABLE_NAME}\" verb=GET {
  input {
    int page?
    int per_page?
    text search?
  }
  stack {
    db.direct_query {
      sql = \"SELECT *, COUNT(*) OVER() as total_count FROM x{WORKSPACE}_{TABLE_ID} WHERE (? IS NULL OR name ILIKE '%' || ? || '%') ORDER BY created_at DESC LIMIT 50\"
      response_type = \"list\"
      arg = $input.search
      arg = $input.search
    } as $items
  }
  response = $items
}"
```

#### 4.2 GET Single Endpoint (GET /{table}/{id})
```
xano_execute: "Create endpoint in API group {GROUP_ID}. XanoScript:
query \"{TABLE_NAME}/{TABLE_NAME}_id\" verb=GET {
  input {
    int {TABLE_NAME}_id
  }
  stack {
    db.direct_query {
      sql = \"SELECT * FROM x{WORKSPACE}_{TABLE_ID} WHERE id = ?\"
      response_type = \"single\"
      arg = $input.{TABLE_NAME}_id
    } as $item
    precondition ($item != null) {
      error_type = \"notfound\"
      error = \"{TABLE_NAME} not found\"
    }
  }
  response = $item
}"
```

#### 4.3 CREATE Endpoint (POST /{table})
```
xano_execute: "Create endpoint in API group {GROUP_ID}. XanoScript:
query \"{TABLE_NAME}\" verb=POST {
  input {
    text name
    text description?
    [other fields]
  }
  stack {
    db.add \"{TABLE_NAME}\" {
      data = {
        name: $input.name,
        description: $input.description,
        created_at: \"now\"
      }
    } as $new_record
  }
  response = $new_record
}"
```

#### 4.4 UPDATE Endpoint (PATCH /{table}/{id})
```
xano_execute: "Create endpoint in API group {GROUP_ID}. XanoScript:
query \"{TABLE_NAME}/{TABLE_NAME}_id\" verb=PATCH {
  input {
    int {TABLE_NAME}_id
    text name?
    text description?
  }
  stack {
    db.direct_query {
      sql = \"UPDATE x{WORKSPACE}_{TABLE_ID} SET name = COALESCE(NULLIF(?, ''), name), description = COALESCE(NULLIF(?, ''), description), updated_at = NOW() WHERE id = ? RETURNING *\"
      response_type = \"single\"
      arg = $input.name
      arg = $input.description
      arg = $input.{TABLE_NAME}_id
    } as $item
    precondition ($item != null) {
      error_type = \"notfound\"
      error = \"{TABLE_NAME} not found\"
    }
  }
  response = $item
}"
```

#### 4.5 DELETE Endpoint (DELETE /{table}/{id})
```
xano_execute: "Create endpoint in API group {GROUP_ID}. XanoScript:
query \"{TABLE_NAME}/{TABLE_NAME}_id\" verb=DELETE {
  input {
    int {TABLE_NAME}_id
  }
  stack {
    db.direct_query {
      sql = \"DELETE FROM x{WORKSPACE}_{TABLE_ID} WHERE id = ? RETURNING id\"
      response_type = \"single\"
      arg = $input.{TABLE_NAME}_id
    } as $deleted
    precondition ($deleted != null) {
      error_type = \"notfound\"
      error = \"{TABLE_NAME} not found\"
    }
  }
  response = { success: true, deleted_id: $deleted.id }
}"
```

### Step 5: Seed Test Data

```
xano_execute: "Insert 5 records into {TABLE_NAME} table:
1. name='Test Item 1', description='First test item'
2. name='Test Item 2', description='Second test item'
3. name='Test Item 3', description='Third test item'
4. name='Test Item 4', description='Fourth test item'
5. name='Test Item 5', description='Fifth test item'"
```

### Step 6: Test Endpoints

Test each endpoint to verify it works:

1. **LIST**: Call GET /{table} - should return 5 items
2. **GET**: Call GET /{table}/1 - should return first item
3. **CREATE**: Call POST /{table} with new data - should return new record
4. **UPDATE**: Call PATCH /{table}/1 with partial data - should update without blanking
5. **DELETE**: Call DELETE /{table}/{new_id} - should remove the created record

---

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `softDelete` | false | Use `deleted_at` timestamp instead of hard delete |
| `timestamps` | true | Add `created_at` and `updated_at` columns |
| `auth` | null | Table name for authentication (e.g., "user") |
| `searchFields` | ["name"] | Fields to include in search |

### Soft Delete Variant

If `softDelete: true`, the DELETE endpoint becomes:

```xs
db.direct_query {
  sql = "UPDATE x{WORKSPACE}_{TABLE_ID} SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL RETURNING id"
  ...
}
```

And LIST/GET queries add: `WHERE deleted_at IS NULL`

### Authenticated Endpoints

If `auth: "user"`, add to each endpoint:

```xs
query "..." verb=GET {
  auth = "user"
  ...
}
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    CRUD GENERATION CHECKLIST                │
├─────────────────────────────────────────────────────────────┤
│  □ 1. Get workspace context (table IDs, API group IDs)      │
│  □ 2. Create table with columns                             │
│  □ 3. Note new table ID                                     │
│  □ 4. Create/identify API group                             │
│  □ 5. Create GET /{table} (LIST)                            │
│  □ 6. Create GET /{table}/{id} (SINGLE)                     │
│  □ 7. Create POST /{table} (CREATE)                         │
│  □ 8. Create PATCH /{table}/{id} (UPDATE)                   │
│  □ 9. Create DELETE /{table}/{id} (DELETE)                  │
│  □ 10. Seed test data (5 records minimum)                   │
│  □ 11. Test all endpoints                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Placeholder Reference

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{TABLE_NAME}` | Snake_case table name | `product` |
| `{TABLE_ID}` | Numeric table ID from Xano | `547` |
| `{WORKSPACE}` | Workspace ID | `40` |
| `{GROUP_ID}` | API group ID | `217` |

---

## Verification Commands

Test your endpoints with curl (replace `{API_CANONICAL}` with your API group's canonical, e.g., `2MN0Qvi7`):

```bash
# Base URL pattern
BASE="https://xhib-njau-6vza.d2.dev.xano.io/api:{API_CANONICAL}"

# LIST - Get all records
curl -s "$BASE/{table}"

# GET - Single record
curl -s "$BASE/{table}/1"

# CREATE - New record
curl -s -X POST "$BASE/{table}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test", "description": "Test record"}'

# UPDATE - Partial update
curl -s -X PATCH "$BASE/{table}/1" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'

# DELETE - Remove record
curl -s -X DELETE "$BASE/{table}/6"

# Test 404 handling
curl -s "$BASE/{table}/999"
```

**Expected Responses:**
- LIST: Array of records
- GET: Single object with all fields
- CREATE: New object with generated ID
- UPDATE: Updated object (unmodified fields preserved)
- DELETE: `{"success": true, "deleted_id": N}`
- 404: `{"code": "ERROR_CODE_NOT_FOUND", "message": "... not found"}`

---

## Related Skills

- [SKILL.md](./SKILL.md) - Full CRUD templates with all variations
- [../sql-lambda-patterns/SKILL.md](../sql-lambda-patterns/SKILL.md) - SQL and Lambda reference
- [../effective-intents/SKILL.md](../effective-intents/SKILL.md) - Intent writing guide
