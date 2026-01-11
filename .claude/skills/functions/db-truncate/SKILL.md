# db.truncate

The `db.truncate` function removes all records from a table. This is faster than deleting records one by one and resets auto-increment counters.

## Syntax

```xs
db.truncate "table_name"
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `table_name` | Yes | The table name as a literal string |

## Return Value

None. The function does not return a value and cannot use `as $var`.

## Test Endpoints

**API Group:** xs-db-truncate (ID: 247)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:SlSFxCxm`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `truncate-test` | 1976 | Execute truncate on test table |
| `truncate-count` | 1977 | Count records in test table |

## Patterns

### Pattern 1: Basic Truncate

```xs
query "truncate-test" verb=POST {
  input {}

  stack {
    db.truncate "truncate_test"
  }

  response = { success: true }
}
```

### Pattern 2: Truncate with Confirmation

```xs
query "truncate-with-confirm" verb=POST {
  input {
    bool confirm
  }

  stack {
    precondition ($input.confirm == true) {
      error_type = "forbidden"
      error = "Must confirm truncate operation"
    }

    db.truncate "temp_data"
  }

  response = { truncated: true }
}
```

### Pattern 3: Truncate in Transaction (for multiple tables)

```xs
query "truncate-multiple" verb=POST {
  input {}

  stack {
    db.transaction {}

    db.truncate "temp_table_1"
    db.truncate "temp_table_2"
    db.truncate "temp_table_3"
  }

  response = { success: true, tables_cleared: 3 }
}
```

### Pattern 4: Clear and Reseed

```xs
query "reset-test-data" verb=POST {
  input {}

  stack {
    // Clear existing data
    db.truncate "test_users"

    // Insert fresh seed data
    db.add "test_users" {
      data = { name: "Test User 1", email: "test1@example.com" }
    } as $user1

    db.add "test_users" {
      data = { name: "Test User 2", email: "test2@example.com" }
    } as $user2
  }

  response = { reset: true, seeded: 2 }
}
```

## Use Cases

| Use Case | Why Truncate |
|----------|--------------|
| **Test data reset** | Clear test tables between test runs |
| **Cache tables** | Flush cached/temporary data |
| **Development** | Reset tables to empty state |
| **Data migration** | Clear destination before import |
| **Session cleanup** | Remove expired session data |

## Truncate vs Delete

| Operation | Speed | Resets ID | Logged | Rollback |
|-----------|-------|-----------|--------|----------|
| `db.truncate` | Fast | Yes | Minimal | Yes (in transaction) |
| `DELETE FROM` | Slow | No | Full | Yes |

Use `db.truncate` when:
- You want to remove ALL records
- You want IDs to restart from 1
- Performance matters

Use `DELETE` when:
- You need to delete specific records
- You need to preserve ID sequence
- You need detailed audit logging

## Gotchas and Limitations

### 1. No Block or Return Value

```xs
// WRONG - no block needed
db.truncate "table" {}

// WRONG - cannot capture result
db.truncate "table" as $result

// CORRECT - simple statement
db.truncate "table"
```

### 2. Literal Table Name Required

```xs
// WRONG - variable not allowed
db.truncate $input.table_name

// CORRECT - literal string
db.truncate "my_table"
```

### 3. Cannot Truncate Tables with Foreign Key References

If other tables reference this table via foreign keys, truncate may fail:

```
ERROR: cannot truncate a table referenced in a foreign key constraint
```

**Solutions:**
1. Truncate referencing tables first
2. Use `DELETE FROM` instead
3. Temporarily disable foreign key checks (not recommended)

### 4. Resets Auto-Increment

After truncate, the next inserted record will have ID = 1:

```
Before truncate: IDs were 1, 2, 3, 4, 5
After truncate + insert: New ID is 1 (not 6)
```

### 5. Affected by Datasource

```xs
// Truncates in current datasource
db.set_datasource { value = "test" }
db.truncate "my_table"  // Only affects test datasource
```

## Safety Considerations

**DANGER:** Truncate is irreversible (outside of transactions)!

Protect truncate endpoints:
1. **Authentication** - Require auth for truncate endpoints
2. **Confirmation** - Require explicit confirmation input
3. **Audit logging** - Log who truncated what
4. **Transaction** - Wrap in transaction for rollback capability

```xs
// Safe truncate pattern
query "admin-truncate" verb=POST {
  input {
    text table_name
    bool i_understand_this_deletes_everything
  }

  stack {
    // Require confirmation
    precondition ($input.i_understand_this_deletes_everything == true) {
      error_type = "forbidden"
      error = "Must confirm you understand this deletes all data"
    }

    // Use switch for allowed tables only
    switch ($input.table_name) {
      case "temp_cache": { db.truncate "temp_cache" }
      case "test_data": { db.truncate "test_data" }
      default: {
        precondition (false) {
          error_type = "forbidden"
          error = "Table not allowed for truncate"
        }
      }
    }
  }

  response = { truncated: $input.table_name }
}
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `foreign key constraint` | Table is referenced by FK | Truncate child tables first |
| `permission denied` | Insufficient privileges | Check database permissions |
| `relation does not exist` | Wrong table name | Verify table name spelling |

## Related Functions

- [db.del](../db-del/SKILL.md) - Delete specific records
- [db.query](../db-query/SKILL.md) - Query records (use to verify truncate)
- [db.transaction](../db-transaction/SKILL.md) - Wrap truncate for rollback
- [db.add](../db-add/SKILL.md) - Reseed data after truncate
