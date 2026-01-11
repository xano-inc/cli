---
name: task-management
description: Use this skill when creating tasks, tracking work progress, adding validations/tests, or managing development workflow in the MCP task system.
---

# Task Management & Testing System

## CRITICAL: Why MCP Tasks, Not TodoWrite

```
┌─────────────────────────────────────────────────────────────────┐
│  TodoWrite = EPHEMERAL (lost when session ends)                 │
│  task_manage = PERSISTENT (saved in Xano database)              │
│                                                                 │
│  ALWAYS use task_manage for ALL feature work!                   │
└─────────────────────────────────────────────────────────────────┘
```

### The Problem with TodoWrite
- Tasks stored in Claude's memory only
- When Claude Code session ends → **ALL TASKS LOST**
- User returns next day → No record of what was done
- No audit trail, no history, no validations preserved

### The Solution: MCP Task System
- Tasks stored in Xano database
- Session ends → **TASKS SURVIVE**
- User returns → Can query dashboard, see all progress
- Full audit trail with timestamps, comments, validations

---

## CRITICAL: Task Granularity Rules

### The "AND" Rule
**If your task title contains "and", it's probably multiple tasks!**

```
❌ BAD:  "Test Pokemon APIs and Build Dashboard"
✅ GOOD: Two separate tasks:
         1. "Test Pokemon API endpoints"
         2. "Build Pokemon battle dashboard"
```

### One Task = One Deliverable

Each task should have:
- **ONE clear outcome** (a table, an endpoint, a test, a file)
- **Completable in a focused work session**
- **Independently verifiable** with a validation

### Task Size Guidelines

| Too Big (Split It) | Just Right | Too Small (Combine) |
|--------------------|------------|---------------------|
| "Build user system" | "Create user table" | "Add id column" |
| "Test and deploy API" | "Test GET /users endpoint" | "Check response code" |
| "Create CRUD and UI" | "Build user list page" | "Add CSS class" |

### Breaking Down Large Work

```
EPIC: Build Pokemon Battle App
  ├── SUBTASK: Create pokemon table
  ├── SUBTASK: Create battle table
  ├── SUBTASK: Build GET /pokemon endpoint
  ├── SUBTASK: Build POST /battle endpoint
  ├── SUBTASK: Test GET /pokemon endpoint
  ├── SUBTASK: Test POST /battle endpoint
  └── SUBTASK: Create battle dashboard HTML
```

### Red Flags - Split These Tasks

- Title longer than 8 words
- Contains "and", "then", "also"
- Multiple verbs: "Create, test, and deploy"
- Multiple nouns: "tables, APIs, and dashboard"
- Estimated to take more than 30 minutes

### Re-evaluate When Starting (Not Just Creating!)

**Before calling `start_task`, ask:**
1. Does this task have ONE clear deliverable?
2. Can I complete this in under 30 minutes?
3. Will I know exactly when it's "done"?

**If NO to any → Split the task BEFORE starting!**

```
// Don't do this:
action="start_task", task_id=5  // "Build auth system" - too big!

// Do this instead:
action="create_task", title="Create user table", parent_id=5
action="create_task", title="Build login endpoint", parent_id=5
action="create_task", title="Test login flow", parent_id=5
action="start_task", task_id=6  // Start first subtask
```

---

## Prerequisites

**The MCP System must be installed before using this skill.**

Run the onboarding check first:
```bash
npm run onboard:check
```

If not installed, see: `.claude/skills/onboarding/SKILL.md`

---

## Overview

The MCP System provides a complete task management and test tracking system stored directly in your Xano workspace. This enables:
- Structured task tracking (epics, tasks, subtasks)
- Test/validation tracking linked to Xano resources
- Development workflow with comments and status changes
- Dashboard for project visibility

## When to Use

| Scenario | Action |
|----------|--------|
| Starting a new feature | Create an epic or task |
| Breaking down work | Create subtasks under a parent |
| Beginning work | Start the task |
| Verifying implementation | Add validations/tests |
| Documenting progress | Add comments |
| Finishing work | Complete the task |

---

## Task Hierarchy

```
Project (optional grouping)
- Epic (large feature)
  - Task (implementable unit)
    - Subtask (small piece)
```

### Task Statuses

| Status | Meaning |
|--------|---------|
| `backlog` | Not started, in queue |
| `planned` | Scheduled for work |
| `in_progress` | Currently being worked on |
| `in_review` | Awaiting review |
| `blocked` | Waiting on dependency |
| `completed` | Done |
| `cancelled` | Won't be done |

### Task Priorities

`critical` > `high` > `medium` > `low` > `none`

---

## Task Dependencies (Blocking Relationships)

Dependencies track when one task must be completed before another can start.

### Dependency Types

| Type | Meaning | Example |
|------|---------|---------|
| `blocks` | Task A must complete before Task B starts | "Create table" blocks "Create API" |
| `relates_to` | Tasks are related but not blocking | "Login API" relates to "Signup API" |
| `duplicates` | Task is a duplicate of another | Bug report duplicates existing issue |

### Adding a Dependency

```
# Task 5 depends on Task 3 (Task 3 blocks Task 5)
action="add_dependency", task_id=5, depends_on_id=3, dependency_type="blocks"
```

**Reading this:** "Task 5 is blocked by Task 3" or "Task 3 must complete before Task 5 can start"

### Listing Dependencies

```
action="list_dependencies", task_id=5

# Returns:
{
  "blocked_by": [
    {"id": 1, "task_id": 5, "depends_on_id": 3, "dependency_type": "blocks"}
  ],
  "blocks": []
}
```

- **blocked_by**: Tasks that must complete before this task
- **blocks**: Tasks that are waiting on this task

### Removing a Dependency

```
action="remove_dependency", task_id=5, dependency_id=1
```

### Dependency Workflow Example

```
# Building a feature with dependencies:

1. Create the table task:
   action="create_task", title="Create pokemon table", type="subtask"
   → Returns task_id=10

2. Create the API task:
   action="create_task", title="Create GET /pokemon endpoint", type="subtask"
   → Returns task_id=11

3. Add dependency (API depends on table):
   action="add_dependency", task_id=11, depends_on_id=10, dependency_type="blocks"

4. When starting task 11, check dependencies:
   action="list_dependencies", task_id=11
   → Shows task 10 must complete first

5. Complete task 10, then start task 11
```

### When to Use Dependencies

| Scenario | Dependency Type |
|----------|-----------------|
| Table must exist before API | `blocks` |
| Test data needs table first | `blocks` |
| Two APIs share same pattern | `relates_to` |
| Bug is duplicate of another | `duplicates` |

### get_task Returns Dependency Info

When you call `get_task`, it automatically includes:
```json
{
  "id": 5,
  "title": "Create GET /pokemon endpoint",
  "blocked_by": [{"id": 3, "title": "Create pokemon table"}],
  "blocks": []
}
```

---

## Development Workflow

### Standard Flow

```
1. CREATE TASK
   action="create_task", title="...", type="task"

2. START TASK (re-evaluate size first!)
   action="start_task", task_id=N
   -> Sets status to "in_progress"
   -> Records started_at timestamp

3. DO THE WORK
   Build the feature, endpoint, table, etc.

4. TEST THE WORK (required!)
   Call the API, verify the table, check the UI

5. ADD VALIDATIONS with test results
   action="add_validation", task_id=N, name="API returns 200",
   validation_status="passed", actual_result="Returns expected data"

6. COMPLETE TASK (only after validation passes!)
   action="complete_task", task_id=N
   -> Sets status to "completed"
   -> Records completed_at timestamp
```

---

## Task Completion Criteria

**⚠️ A task is NOT complete until it has been TESTED and VALIDATED!**

### Required Validations by Task Type

| Task Type | Must Validate Before Completing |
|-----------|--------------------------------|
| **API Endpoint** | Test endpoint, verify response data |
| **Table/Schema** | Verify table exists with correct columns |
| **Bug Fix** | Verify bug no longer occurs |
| **UI/Dashboard** | Visually confirm it renders correctly |
| **Data Seed** | Verify data exists in table |

### API Task Completion Example

```
❌ WRONG - Completing without testing:
   xano_execute: "Create GET /users endpoint"
   action="complete_task", task_id=5  // NO! Not tested!

✅ RIGHT - Test before completing:
   xano_execute: "Create GET /users endpoint"

   // TEST IT (browser, curl, fetch, dashboard)
   // Verify: Status 200, returns user array

   action="add_validation", task_id=5,
     name="GET /users returns user list",
     validation_status="passed",
     test_category="api",
     actual_result="Returns 5 users with id, name, email fields"

   action="complete_task", task_id=5  // NOW it's valid
```

### Completion Checklist

Before calling `complete_task`, verify:

- [ ] Work is actually done (not just started)
- [ ] Work has been tested/verified
- [ ] Validation added with `status="passed"`
- [ ] `actual_result` documents what was verified

---

## Validation/Test System

Validations track tests and verification items for tasks. They can link directly to Xano resources.

### Validation Types

| Type | Use Case |
|------|----------|
| `test` | Automated or manual test result |
| `checklist` | Verification checklist item |

### Test Categories

| Category | Description |
|----------|-------------|
| `unit` | Unit tests for isolated functions |
| `integration` | Integration tests between components |
| `api` | API endpoint tests |
| `schema` | Database schema validations |
| `manual` | Manual verification items |
| `other` | Other validations |

### Validation Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Not yet run/checked |
| `passed` | Test passed |
| `failed` | Test failed |
| `skipped` | Intentionally skipped |

---

## Linking Validations to Xano Resources

### Resource Types

| Type | Links To | URL Pattern |
|------|----------|-------------|
| `table` | Database table | `/workspace/{ws}-0/database/{table_id}` |
| `api_group` | API group dashboard | `/workspace/{ws}-0/api/{group_id}/dashboard` |
| `api` | Specific API endpoint | `/workspace/{ws}-0/api/{group_id}/query/{api_id}` |
| `file` | Local file path | N/A (uses resource_path) |
| `other` | Generic reference | N/A |

### Validation Fields for Evidence

| Field | Purpose | What to Store |
|-------|---------|---------------|
| `expected_result` | What should happen | "Returns 200 with user array" |
| `actual_result` | Summary of what happened | "Returns 5 users with correct fields" |
| `output` | **Raw evidence/sample data** | JSON response, schema dump, error logs |

**Key insight:** Use `output` to store the actual sample response or schema so users can see exactly what was returned!

---

### Examples with Sample Data

#### API Test with Sample Response
```
action="add_validation", task_id=1,
  name="GET /users returns user list",
  validation_type="test",
  validation_status="passed",
  test_category="api",
  resource_type="api",
  resource_id=1458,
  resource_group_id=199,
  expected_result="200 OK with array of users containing id, name, email",
  actual_result="Returns 5 users with correct fields, pagination working",
  output='{"items":[{"id":1,"name":"John Doe","email":"john@example.com"},{"id":2,"name":"Jane Smith","email":"jane@example.com"}],"itemsReceived":2,"curPage":1,"nextPage":null}'
```

**The `output` field stores the actual JSON response** - this is what users see in the dashboard to verify the test passed.

#### Schema Validation with Column Info
```
action="add_validation", task_id=1,
  name="users table has required columns",
  validation_type="test",
  validation_status="passed",
  test_category="schema",
  resource_type="table",
  resource_id=480,
  expected_result="Table with id, email, password, name, created_at columns",
  actual_result="Table exists with 5 columns, all correct types",
  output='{"columns":[{"name":"id","type":"int","nullable":false},{"name":"email","type":"text","nullable":false},{"name":"password","type":"text","nullable":false},{"name":"name","type":"text","nullable":true},{"name":"created_at","type":"timestamp","nullable":false}]}'
```

**The `output` field stores the schema info** - column names, types, and constraints.

#### POST API Test with Request/Response
```
action="add_validation", task_id=1,
  name="POST /users creates new user",
  validation_type="test",
  validation_status="passed",
  test_category="api",
  resource_type="api",
  resource_id=1459,
  resource_group_id=199,
  expected_result="201 Created with new user object including generated ID",
  actual_result="User created successfully with id=6",
  output='{"request":{"name":"Test User","email":"test@example.com"},"response":{"id":6,"name":"Test User","email":"test@example.com","created_at":1767790000000}}'
```

#### Error Case Validation
```
action="add_validation", task_id=1,
  name="GET /users/{id} returns 404 for invalid ID",
  validation_type="test",
  validation_status="passed",
  test_category="api",
  resource_type="api",
  resource_id=1460,
  resource_group_id=199,
  expected_result="404 Not Found with error message",
  actual_result="Returns 404 with 'User not found' message",
  output='{"status":404,"error":"User not found","code":"NOT_FOUND"}'
```

---

### What Makes a Good Validation

| Component | Bad Example | Good Example |
|-----------|-------------|--------------|
| **name** | "test1" | "GET /users returns paginated list" |
| **expected_result** | "works" | "200 OK with array of {id, name, email}" |
| **actual_result** | "passed" | "Returns 5 users, pagination meta correct" |
| **output** | (empty) | Actual JSON response or schema |

### Bulk Add Test Results
```
action="bulk_add_validations", task_id=1, results=[
  {
    "name": "pokemon table schema correct",
    "status": "passed",
    "test_category": "schema",
    "resource_type": "table",
    "resource_id": 534,
    "actual_result": "5 columns: id, name, type, hp, attack",
    "output": "{\"columns\":[{\"name\":\"id\",\"type\":\"int\"},{\"name\":\"name\",\"type\":\"text\"},{\"name\":\"type\",\"type\":\"text\"},{\"name\":\"hp\",\"type\":\"int\"},{\"name\":\"attack\",\"type\":\"int\"}]}"
  },
  {
    "name": "GET /pokemon returns list",
    "status": "passed",
    "test_category": "api",
    "resource_type": "api",
    "resource_id": 1500,
    "resource_group_id": 200,
    "actual_result": "Returns 4 Pokemon with correct fields",
    "output": "{\"items\":[{\"id\":1,\"name\":\"Pikachu\",\"type\":\"electric\",\"hp\":35,\"attack\":55}],\"curPage\":1}"
  }
]
```

---

## Dashboard

Get summary statistics:

```
action="dashboard"
```

Response:
```json
{
  "tasks": {
    "total": 5,
    "in_progress": 1,
    "completed": 2
  }
}
```

---

## Best Practices

### 1. Always Create Tasks Before Starting Work
```
BAD:  Just start coding
GOOD: Create task -> Start task -> Code -> Add validations -> Complete
```

### 2. Use Meaningful Validation Names
```
BAD:  "test1", "check", "works"
GOOD: "users table has email column", "GET /auth/login returns JWT"
```

### 3. Link Validations to Resources
When testing Xano resources, always include:
- `resource_type`: What kind of resource
- `resource_id`: The Xano ID
- `resource_group_id`: For API endpoints, the group ID

### 4. Use Expected/Actual Results
```json
{
  "expected_result": "Returns 200 with user array",
  "actual_result": "Returns 200 with 5 users"
}
```

### 5. Add Comments for Context
Document decisions, blockers, and progress.

---

## Common Mistakes

### 1. Forgetting to Start Tasks
Starting a task records the timestamp and creates an audit trail.

### 2. Not Linking Resources
Without `resource_type` and `resource_id`, the dashboard can't link to Xano.

### 3. Skipping Validations
Always add at least one validation before completing a task.

### 4. Vague Descriptions
Be specific in validation names and descriptions.

## Related Skills
- [effective-intents](../effective-intents/SKILL.md) - Writing MCP intents
- [api-testing](../api-testing/SKILL.md) - Testing API endpoints
