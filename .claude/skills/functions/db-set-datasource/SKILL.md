# db.set_datasource

The `db.set_datasource` function switches the database context between different data sources (e.g., live vs test). This allows you to maintain separate datasets for testing without affecting production data.

## Syntax

```xs
db.set_datasource { value = "datasource_name" }
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `value` | Yes | Data source name: `"live"` (default) or `"test"` |

## Test Endpoints

**API Group:** xs-db-set-datasource (ID: 245)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:4XliJGCp`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `datasource-test` | 1968 | Query using test datasource |
| `datasource-live` | 1969 | Query using default live datasource |
| `datasource-dynamic` | 1970 | Dynamic datasource from input |
| `datasource-add-test` | 1971 | Add record to test datasource |
| `datasource-get-by-id` | 1972 | Get by ID with datasource selection |

## Patterns

### Pattern 1: Hardcoded Test Datasource

```xs
query "datasource-test" verb=GET {
  input {}

  stack {
    db.set_datasource { value = "test" }

    db.query "mcp_task" {} as $tasks
  }

  response = $tasks
}
```

### Pattern 2: Dynamic Datasource from Input

```xs
query "datasource-dynamic" verb=GET {
  input {
    text source
  }

  stack {
    db.set_datasource { value = $input.source }

    db.query "mcp_task" {} as $tasks
  }

  response = $tasks
}
```

### Pattern 3: Get by ID with Datasource Selection

```xs
query "datasource-get-by-id" verb=GET {
  input {
    text source
    int id
  }

  stack {
    db.set_datasource { value = $input.source }

    db.get "mcp_task" {
      field_name = "id"
      field_value = $input.id
    } as $task

    precondition ($task != null) {
      error_type = "notfound"
      error = "Task not found"
    }
  }

  response = $task
}
```

### Pattern 4: Add to Test Datasource

```xs
query "datasource-add-test" verb=POST {
  input {}

  stack {
    db.set_datasource { value = "test" }

    db.add "mcp_task" {
      data = {
        title: "Test Task from Test DS"
      }
    } as $task
  }

  response = $task
}
```

## API Header Alternative

You can also switch datasources via HTTP header without modifying endpoint code:

```bash
# Use test datasource via header
curl -H "X-Data-Source: test" https://your-api/endpoint

# Use live datasource (default)
curl https://your-api/endpoint
```

The header approach is useful for:
- Testing existing endpoints without code changes
- Client-side datasource selection
- A/B testing scenarios

## Data Isolation

**Test and live datasources are completely isolated:**

| Datasource | Records | IDs |
|------------|---------|-----|
| `live` | Production data | ID sequences independent |
| `test` | Test data only | Starts at ID 1 |

**Example:**
```
live:  ID 1 = "Plan: New Application" (production task)
test:  ID 1 = "Test Task from Test DS" (test task)
```

Querying ID 1 returns different records based on datasource:
- `source=live&id=1` → Production task
- `source=test&id=1` → Test task
- `source=test&id=12` → 404 (doesn't exist in test)

## Scope and Persistence

- `db.set_datasource` affects **all subsequent db operations** in the same request
- Does NOT persist between requests
- Each request starts with the default datasource (live)
- Can be called multiple times in a single request to switch contexts

```xs
// Switch to test, query, switch back to live
db.set_datasource { value = "test" }
db.query "mcp_task" {} as $test_tasks

db.set_datasource { value = "live" }
db.query "mcp_task" {} as $live_tasks
```

## Use Cases

| Use Case | Approach |
|----------|----------|
| **Integration tests** | Use `test` datasource to avoid polluting production |
| **Demo data** | Pre-populate test datasource with sample records |
| **A/B testing** | Switch datasource based on user segment |
| **Data migration validation** | Compare results between datasources |
| **Development** | Work with test data locally |

## Gotchas and Limitations

### 1. Block Syntax Required

```xs
// WRONG - causes syntax error
db.set_datasource "test"

// CORRECT - use value block
db.set_datasource { value = "test" }
```

### 2. No Return Value

`db.set_datasource` does not return a value and cannot use `as $var`:

```xs
// WRONG
db.set_datasource { value = "test" } as $result

// CORRECT
db.set_datasource { value = "test" }
```

### 3. Case Sensitive

Datasource names are case-sensitive:

```xs
// CORRECT
db.set_datasource { value = "test" }

// May fail if capitalized differently
db.set_datasource { value = "Test" }
```

### 4. Header Precedence

When both `X-Data-Source` header and `db.set_datasource` are used:
- `db.set_datasource` in code overrides the header
- Code has final control over datasource selection

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Missing block: value` | Using `name =` instead of `value =` | Use `value = "test"` |
| `Invalid arg: name` | Using string argument | Use block syntax `{ value = "..." }` |
| Data not found | Wrong datasource selected | Verify datasource matches where data was inserted |

## Related Functions

- [db.query](../db-query/SKILL.md) - Query records (affected by datasource)
- [db.get](../db-get/SKILL.md) - Get single record (affected by datasource)
- [db.add](../db-add/SKILL.md) - Insert records (affected by datasource)
- [db.direct_query](../db-direct-query/SKILL.md) - Raw SQL (affected by datasource)
