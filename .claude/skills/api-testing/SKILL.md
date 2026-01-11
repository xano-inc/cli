---
name: api-testing
description: Use this skill when testing API endpoints, reviewing XanoScript code, debugging API errors, or validating API responses.
---

# API Testing & Validation Patterns

## Philosophy

**Every primitive (table, API endpoint) MUST be tested and validated before the task is complete.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    VALIDATION REQUIREMENTS                       │
├─────────────────────────────────────────────────────────────────┤
│  Every task completion MUST include:                             │
│  1. Actual test execution (call the API, check the table)        │
│  2. add_validation with resource linking                         │
│  3. actual_result showing what was verified                      │
│  4. Status = "passed" before completing                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Validation Types & Categories

### Test Categories

| Category | When to Use | Example |
|----------|-------------|---------|
| `schema` | Table/column verification | "user table has email column" |
| `api` | API endpoint testing | "GET /users returns list" |
| `integration` | Cross-resource tests | "User creation triggers welcome email" |
| `unit` | Function/logic tests | "Password hash function works" |
| `manual` | Requires human verification | "UI displays correctly" |

### Resource Types

| Type | Links To | Example |
|------|----------|---------|
| `table` | `workspace/{id}-0/database/{table_id}` | Table schema |
| `api` | `workspace/{id}-0/api/{group_id}/query/{api_id}` | API endpoint |
| `api_group` | `workspace/{id}-0/api/{group_id}/dashboard` | API group |
| `file` | Local file path | Source code file |

---

## Complete Validation Workflow

### For Table Tasks

```
1. CREATE TABLE
   xano_execute: "Create table called 'user' with columns..."

2. VERIFY TABLE EXISTS
   xano_execute: "List all tables" → Find table_id

3. ADD VALIDATION
   action="add_validation", task_id=X,
     name="user table created with correct schema",
     validation_type="test",
     test_category="schema",
     resource_type="table",
     resource_id=534,
     validation_status="passed",
     expected_result="Table with email, password, name columns",
     actual_result="Table 534 created with 5 columns: id, email, password, name, created_at"

4. COMPLETE TASK
   action="complete_task", task_id=X
```

### For API Endpoint Tasks

```
1. CREATE ENDPOINT
   xano_execute: "Create GET /users endpoint..."

2. GET ENDPOINT DETAILS
   xano_execute: "Get API endpoint details for /users"
   → Returns: api_id, apigroup_id, canonical

3. TEST THE ENDPOINT
   Use curl, fetch, or browser:
   curl "https://instance.xano.io/api:{canonical}/users"
   → Verify response status and data

4. ADD VALIDATION
   action="add_validation", task_id=X,
     name="GET /users returns paginated list",
     validation_type="test",
     test_category="api",
     resource_type="api",
     resource_id=1458,
     resource_group_id=198,
     validation_status="passed",
     expected_result="200 OK with array of users",
     actual_result="Returns 5 users with correct fields, pagination working"

5. COMPLETE TASK
   action="complete_task", task_id=X
```

---

## Understanding Xano API URLs

### URL Structure

Each API group has a unique base URL:

```
https://{instance}.xano.io/api:{canonical}
```

**Example**:
- Instance: `xhib-njau-6vza.d2.dev.xano.io`
- Canonical: `5yDoxDtQ` (from API group metadata)
- Base URL: `https://xhib-njau-6vza.d2.dev.xano.io/api:5yDoxDtQ`

### Getting the Canonical

```
xano_execute: "Get API group details for 'users'"
→ Returns: { canonical: "5yDoxDtQ", ... }
```

---

## Live API Testing

### Using cURL

**List endpoint (GET)**:
```bash
curl "https://xhib-njau-6vza.d2.dev.xano.io/api:5yDoxDtQ/users?page=1&per_page=5"
```

**Get by ID (GET)**:
```bash
curl "https://xhib-njau-6vza.d2.dev.xano.io/api:5yDoxDtQ/users/1"
```

**Create (POST)**:
```bash
curl -X POST "https://xhib-njau-6vza.d2.dev.xano.io/api:5yDoxDtQ/users" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "email": "test@example.com"}'
```

**Update (PATCH)**:
```bash
curl -X PATCH "https://xhib-njau-6vza.d2.dev.xano.io/api:5yDoxDtQ/users/1" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'
```

**Delete (DELETE)**:
```bash
curl -X DELETE "https://xhib-njau-6vza.d2.dev.xano.io/api:5yDoxDtQ/users/1"
```

---

## Test Checklist Per Endpoint Type

### GET /list

| Test | Expected | Validation |
|------|----------|------------|
| Returns data | Array of items | ✅ Check length > 0 |
| Pagination works | page, per_page honored | ✅ Check meta/pagination |
| No sensitive fields | No password, api_key | ✅ Check field names |

### GET /{id}

| Test | Expected | Validation |
|------|----------|------------|
| Valid ID returns record | 200 with data | ✅ Check response body |
| Invalid ID returns 404 | 404 status | ✅ Check http_code |
| No sensitive fields | No password | ✅ Check field names |

### POST /create

| Test | Expected | Validation |
|------|----------|------------|
| Creates record | 200/201 with new record | ✅ Check id returned |
| Returns created data | Full record in response | ✅ Check fields match input |
| Missing required fails | 400 error | ✅ Check validation errors |

### PATCH /{id}

| Test | Expected | Validation |
|------|----------|------------|
| Updates specified fields | Changed fields updated | ✅ Check updated values |
| Preserves unspecified | Other fields unchanged | ✅ Check unchanged fields |
| Invalid ID returns 404 | 404 status | ✅ Check http_code |

### DELETE /{id}

| Test | Expected | Validation |
|------|----------|------------|
| Deletes record | Success response | ✅ Check success flag |
| Record gone | Subsequent GET returns 404 | ✅ Verify deletion |
| Invalid ID returns 404 | 404 status | ✅ Check http_code |

---

## Security Testing Checklist

**CRITICAL**: Run these security checks on ALL new APIs before completion.

### 1. Sensitive Field Exposure

```bash
# Check LIST endpoint doesn't expose sensitive fields
curl -s "BASE_URL/users" | jq '.items[0] | keys'

# Should NOT include: password, api_key, secret, token
```

**Validation**:
```
action="add_validation", task_id=X,
  name="GET /users excludes password field",
  test_category="api",
  resource_type="api",
  resource_id=1458,
  validation_status="passed",
  actual_result="Response fields: id, name, email, role, created_at - no password"
```

### 2. Proper 404 Handling

```bash
# Check GET by ID returns 404 (not 200 with null)
curl -s -w "\nHTTP Status: %{http_code}" "BASE_URL/users/99999999"
```

**Validation**:
```
action="add_validation", task_id=X,
  name="GET /users/{id} returns 404 for invalid ID",
  test_category="api",
  resource_type="api",
  resource_id=1459,
  validation_status="passed",
  actual_result="Returns HTTP 404 with error message 'User not found'"
```

### 3. PATCH Field Preservation

```bash
# 1. Create record with multiple fields
# 2. Update only one field
# 3. Verify other fields preserved

curl -s "BASE_URL/users/1" | jq '{name, email, role}'
# All fields should have values, not null/empty
```

**Validation**:
```
action="add_validation", task_id=X,
  name="PATCH /users/{id} preserves existing fields",
  test_category="api",
  resource_type="api",
  resource_id=1460,
  validation_status="passed",
  actual_result="Updated name only, email and role preserved"
```

---

## Bulk Validation Pattern

After completing multiple related tasks, add validations in bulk:

```
action="bulk_add_validations", task_id=X, results=[
  {
    name: "user table exists",
    status: "passed",
    test_category: "schema",
    resource_type: "table",
    resource_id: 534,
    actual_result: "Table with 6 columns"
  },
  {
    name: "GET /users returns list",
    status: "passed",
    test_category: "api",
    resource_type: "api",
    resource_id: 1458,
    resource_group_id: 198,
    actual_result: "Returns 5 test users"
  },
  {
    name: "GET /users/{id} returns single",
    status: "passed",
    test_category: "api",
    resource_type: "api",
    resource_id: 1459,
    resource_group_id: 198,
    actual_result: "Returns user with all fields"
  }
]
```

---

## Dashboard Integration

Validations appear in the task dashboard with:
- Direct links to Xano resources (clickable table_id, api_id)
- Test status (passed/failed/pending)
- Actual results showing what was verified
- Test category for filtering

### Xano URL Patterns

| Resource | URL Pattern |
|----------|-------------|
| Table | `https://instance.xano.io/workspace/{ws}-0/database/{table_id}` |
| API Group | `https://instance.xano.io/workspace/{ws}-0/api/{group_id}/dashboard` |
| API Endpoint | `https://instance.xano.io/workspace/{ws}-0/api/{group_id}/query/{api_id}` |

---

## Common Testing Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| 500 on GET with invalid ID | Missing precondition | Add null check with 404 |
| List returns all records | No pagination | Add LIMIT/OFFSET |
| PATCH blanks fields | Not using NULLIF | Use `COALESCE(NULLIF(?, ''), column)` |
| Can create duplicates | No unique constraint | Add unique index on table |
| Password in response | Not filtering | Use Lambda to remove sensitive fields |

---

## Related Skills
- [sql-lambda-patterns](../sql-lambda-patterns/SKILL.md) - Primary development patterns
- [task-management](../task-management/SKILL.md) - Task and validation management
- [effective-intents](../effective-intents/SKILL.md) - MCP intent patterns
