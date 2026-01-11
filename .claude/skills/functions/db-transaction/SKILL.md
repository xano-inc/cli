# db.transaction

The `db.transaction` function wraps database operations in an atomic transaction. If any operation fails or an error is thrown, all changes are rolled back automatically.

## Syntax

```xs
db.transaction {}
```

The `db.transaction {}` statement starts a transaction context. All subsequent database operations in the same stack are part of this transaction until the endpoint completes or an error occurs.

## Parameters

None. The empty block `{}` is required.

## Test Endpoints

**API Group:** xs-db-transaction (ID: 246)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:dxp-E-fe`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `transaction-basic` | 1973 | Single insert in transaction |
| `transaction-multi` | 1974 | Multiple inserts atomically |
| `transaction-rollback` | 1975 | Rollback on precondition failure |

## Patterns

### Pattern 1: Basic Transaction

```xs
query "transaction-basic" verb=POST {
  input {}

  stack {
    db.transaction {}

    db.add "mcp_task" {
      data = { title: "Task 1" }
    } as $task
  }

  response = $task
}
```

### Pattern 2: Multiple Operations (Atomic)

All operations succeed or none do:

```xs
query "transaction-multi" verb=POST {
  input {}

  stack {
    db.transaction {}

    db.add "mcp_task" {
      data = { title: "Trans Task A" }
    } as $task1

    db.add "mcp_task" {
      data = { title: "Trans Task B" }
    } as $task2

    var $result {
      value = { first: $task1, second: $task2 }
    }
  }

  response = $result
}
```

**Response:**
```json
{
  "first": {"id": 16, "title": "Trans Task A", ...},
  "second": {"id": 17, "title": "Trans Task B", ...}
}
```

### Pattern 3: Automatic Rollback on Error

When a precondition fails, the transaction is automatically rolled back:

```xs
query "transaction-rollback" verb=POST {
  input {}

  stack {
    db.transaction {}

    db.add "mcp_task" {
      data = { title: "Should Rollback" }
    } as $task

    // This will fail, causing rollback
    precondition (1 == 0) {
      error_type = "notfound"
      error = "Forced failure to test rollback"
    }
  }

  response = $task
}
```

**Result:** Error returned, task NOT created (rolled back)

### Pattern 4: Transfer Between Records (Classic Use Case)

```xs
query "transfer" verb=POST {
  input {
    int from_id
    int to_id
    int amount
  }

  stack {
    db.transaction {}

    // Deduct from source
    db.get "account" { field_name = "id", field_value = $input.from_id } as $from
    precondition ($from.balance >= $input.amount) {
      error_type = "forbidden"
      error = "Insufficient balance"
    }

    db.edit "account" {
      field_name = "id"
      field_value = $input.from_id
      data = { balance: $from.balance - $input.amount }
    } as $updated_from

    // Add to destination
    db.get "account" { field_name = "id", field_value = $input.to_id } as $to

    db.edit "account" {
      field_name = "id"
      field_value = $input.to_id
      data = { balance: $to.balance + $input.amount }
    } as $updated_to
  }

  response = { from: $updated_from, to: $updated_to }
}
```

## How It Works

1. `db.transaction {}` begins a PostgreSQL transaction
2. All subsequent `db.*` operations are part of this transaction
3. On successful completion → **COMMIT** (all changes saved)
4. On any error (precondition, validation, etc.) → **ROLLBACK** (no changes saved)

## Automatic vs Manual Control

XanoScript only supports automatic transaction management:

| Feature | Support |
|---------|---------|
| Auto-commit on success | ✅ Yes |
| Auto-rollback on error | ✅ Yes |
| Manual commit | ❌ No `db.transaction.commit` |
| Manual rollback | ❌ No `db.transaction.rollback` |
| Savepoints | ❌ Not supported |

To trigger a rollback, throw an error using `precondition`.

## Use Cases

| Use Case | Why Transaction Needed |
|----------|------------------------|
| **Money transfers** | Debit and credit must both succeed |
| **Order creation** | Order + line items + inventory update |
| **User signup** | User + profile + preferences |
| **Bulk updates** | All-or-nothing batch operations |
| **Data migration** | Multiple related changes |

## Gotchas and Limitations

### 1. Empty Block Required

```xs
// WRONG - no block
db.transaction

// CORRECT - empty block
db.transaction {}
```

### 2. No Nested Transactions

Only one transaction per request. Nested `db.transaction {}` calls are ignored.

### 3. Transaction Scope

The transaction covers ALL subsequent db operations in the stack, not just those immediately after:

```xs
db.transaction {}

db.add "table1" { ... } as $a    // In transaction
db.add "table2" { ... } as $b    // Also in transaction
db.add "table3" { ... } as $c    // Also in transaction
// All 3 commit or rollback together
```

### 4. Cannot Combine with db.set_datasource

Transactions are per-datasource. If you switch datasources mid-transaction, behavior is undefined:

```xs
// AVOID - undefined behavior
db.transaction {}
db.add "table1" { ... }          // live
db.set_datasource { value = "test" }
db.add "table1" { ... }          // test - different connection!
```

### 5. Performance Consideration

Transactions hold locks. Keep transaction scope minimal:

```xs
// GOOD - transaction only around DB ops
var $prepared_data { value = complex_calculation() }
db.transaction {}
db.add "table" { data = $prepared_data } as $result

// AVOID - external calls in transaction
db.transaction {}
api.call { url = "https://external-api..." }  // Slow!
db.add "table" { ... }
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Syntax error | Missing `{}` block | Use `db.transaction {}` |
| Partial commit | No transaction wrapper | Add `db.transaction {}` before operations |
| Deadlock | Long-running transaction | Minimize transaction scope |

## Testing Rollback

To verify rollback works:

1. Start transaction
2. Insert a record
3. Force an error with `precondition (false) { ... }`
4. Check that record was NOT created

```bash
# Count before
curl api/tasks | jq 'length'  # 17

# Trigger rollback
curl -X POST api/transaction-rollback  # Returns error

# Count after - should be same
curl api/tasks | jq 'length'  # Still 17 (rolled back!)
```

## Related Functions

- [db.add](../db-add/SKILL.md) - Insert records (can be in transaction)
- [db.edit](../db-edit/SKILL.md) - Update records (can be in transaction)
- [db.del](../db-del/SKILL.md) - Delete records (can be in transaction)
- [db.direct_query](../db-direct-query/SKILL.md) - Raw SQL (can be in transaction)
