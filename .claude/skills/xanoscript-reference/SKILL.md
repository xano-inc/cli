---
name: xanoscript-reference
description: Reference documentation for native XanoScript syntax. For primary development, use sql-lambda-patterns instead.
---

# XanoScript Reference (Legacy)

> **NOTE**: This is a reference document for XanoScript syntax used in control flow (preconditions, variables, input definitions). For actual endpoint logic, use SQL and Lambda as documented in [sql-lambda-patterns](../sql-lambda-patterns/SKILL.md).

## When to Use Native XanoScript

| Use Case | Use Native XanoScript? |
|----------|------------------------|
| Input definitions | Yes - required |
| Variable declarations (`var`) | Yes - simple cases |
| Preconditions for errors | Yes - recommended |
| Control flow (`conditional`) | Sometimes - prefer Lambda |
| Database operations | **NO** - use SQL instead |
| Data transformation | **NO** - use Lambda instead |
| Business logic | **NO** - use Lambda instead |

## Overview

XanoScript is a declarative DSL for defining Xano resources. Files use the `.xs` extension.

## Core Constructs

### 1. API Queries (Endpoints)

```xs
query "endpoint_name" verb=GET {
  description = "Brief description"
  auth = "user"  // Optional: require auth from this table

  input {
    int id {
      description = "Record ID"
    }
    text search? filters=trim {
      description = "Optional search term"
    }
    int page?=1 filters=min:1 {
      description = "Page number, defaults to 1"
    }
  }

  stack {
    // Processing logic here
    db.query "table_name" {
      where = $db.table_name.id == $input.id
      return = {type: "single"}
    } as $result
  }

  response = $result
}
```

### 2. Database Operations

```xs
// Query multiple records
db.query "table_name" {
  where = $db.table_name.status == "active" && $db.table_name.user_id == $auth.id
  sort = {table_name.created_at: "desc"}
  return = {
    type: "list"
    paging: {page: $input.page, per_page: 20, totals: true}
  }
} as $records

// Get single record
db.get "table_name" {
  field_name = "id"
  field_value = $input.id
} as $record

// Check existence
db.has "table_name" {
  field_name = "email"
  field_value = $input.email
} as $exists

// Add record
db.add "table_name" {
  data = {
    name: $input.name,
    email: $input.email,
    created_at: "now"
  }
} as $new_record

// Edit record
db.edit "table_name" {
  field_name = "id"
  field_value = $input.id
  data = {
    name: $input.name,
    updated_at: "now"
  }
} as $updated_record

// Delete record
db.del "table_name" {
  field_name = "id"
  field_value = $input.id
}
```

### 3. Query Operators

```xs
// Comparison operators
$db.table.field == value       // equals
$db.table.field != value       // not equals
$db.table.field > value        // greater than
$db.table.field >= value       // greater or equal
$db.table.field < value        // less than
$db.table.field <= value       // less or equal

// String operators
$db.table.field includes "text"    // contains substring

// Null-safe operators (ignore if null)
$db.table.field ==? $input.optional   // equals, ignore if input is null
$db.table.field includes? $input.q    // includes, ignore if null

// Logical operators
condition1 && condition2   // AND
condition1 || condition2   // OR
```

### 4. Input Types & Filters

```xs
input {
  // Basic types
  int id
  text name filters=trim
  email email_address filters=trim|lower
  password secret filters=min:8
  bool is_active?=true
  decimal price filters=min:0
  timestamp created_at
  json metadata

  // Optional with default
  int page?=1 filters=min:1

  // Nullable (can be null)
  text? optional_field

  // Arrays
  int[] ids filters=min:1
  text[] tags filters=trim|lower

  // Enum
  enum status {
    values = ["pending", "active", "completed"]
  }
}
```

**Common Filters:**
- `trim` - remove whitespace
- `lower` / `upper` - case conversion
- `min:N` - minimum value/length
- `max:N` - maximum value/length

### 5. Control Flow

```xs
// Conditionals
conditional {
  if ($user.role == "admin") {
    // admin logic
  }
  elseif ($user.role == "manager") {
    // manager logic
  }
  else {
    // default logic
  }
}

// Loops
foreach ($items) {
  each as $item {
    // process each item
  }
}
```

### 6. Error Handling

```xs
// Precondition (validation)
precondition ($input.age >= 18) {
  error_type = "inputerror"
  error = "Must be 18 or older"
}

// Throw error
throw {
  name = "ValidationError"
  value = "Invalid data provided"
}
```

---

## CRUD API Pattern

### Standard REST Endpoints

```xs
// GET /api/users - List all
query "users" verb=GET {
  input {
    int page?=1 filters=min:1
    int per_page?=20 filters=min:1|max:100
  }

  stack {
    db.query "user" {
      sort = {user.created_at: "desc"}
      return = {
        type: "list"
        paging: {page: $input.page, per_page: $input.per_page, totals: true}
      }
    } as $users
  }

  response = $users
}

// GET /api/users/{id} - Get single
query "users/{id}" verb=GET {
  input {
    int id
  }

  stack {
    db.get "user" {
      field_name = "id"
      field_value = $input.id
    } as $user

    precondition ($user != null) {
      error_type = "notfound"
      error = "User not found"
    }
  }

  response = $user
}

// POST /api/users - Create
query "users" verb=POST {
  input {
    text name filters=trim|min:1
    email email filters=trim|lower
  }

  stack {
    db.add "user" {
      data = {
        name: $input.name,
        email: $input.email,
        created_at: "now"
      }
    } as $new_user
  }

  response = $new_user
}

// PATCH /api/users/{id} - Update
query "users/{id}" verb=PATCH {
  input {
    int id
    text name? filters=trim|min:1
  }

  stack {
    db.get "user" {
      field_name = "id"
      field_value = $input.id
    } as $existing

    precondition ($existing != null) {
      error_type = "notfound"
      error = "User not found"
    }

    db.edit "user" {
      field_name = "id"
      field_value = $input.id
      data = {
        name: $input.name || $existing.name,
        updated_at: "now"
      }
    } as $updated
  }

  response = $updated
}

// DELETE /api/users/{id} - Delete
query "users/{id}" verb=DELETE {
  input {
    int id
  }

  stack {
    db.get "user" {
      field_name = "id"
      field_value = $input.id
    } as $user

    precondition ($user != null) {
      error_type = "notfound"
      error = "User not found"
    }

    db.del "user" {
      field_name = "id"
      field_value = $input.id
    }
  }

  response = {success: true}
}
```

---

## Security Best Practices

### CRITICAL: Never Expose Sensitive Fields

Tables with `password`, `api_key`, `secret` fields MUST filter these from responses.

### CRITICAL: Return 404 for Non-Existent Records

```xs
db.get "company" { field_name = "id", field_value = $input.id } as $company

precondition ($company != null) {
  error_type = "notfound"
  error = "Company not found"
}

response = $company
```

### CRITICAL: PATCH Must Preserve Existing Values

```xs
// First fetch existing record
db.get "company" { field_name = "id", field_value = $input.id } as $existing

// Use || to preserve existing values when input is null/empty
db.edit "company" {
  field_name = "id"
  field_value = $input.id
  data = {
    name: $input.name || $existing.name,
    industry: $input.industry || $existing.industry
  }
} as $updated
```

---

## Common Mistakes & Fixes

### Syntax Errors Quick Reference

| Error Message | Wrong | Correct |
|--------------|-------|---------|
| `"unexpected ','"` | `field_name = "id",` | `field_name = "id"` |
| `"unexpected '='"` | `db $result { table = company }` | `db.query "company" { } as $result` |
| `"unexpected 'set_var'"` | `set_var $x = 1` | `var $x { value = 1 }` |
| `"Invalid arg: as"` on db.del | `db.del "t" {} as $r` | `db.del "t" {}` |
| `"Missing block: input"` | Query without input block | Add `input {}` even if empty |

### CRITICAL: Comma Rules

**Block-level assignments (with =): NO COMMAS**
**Object literal fields (with :): YES COMMAS**

```xs
// WRONG (causes error):
db.get "table" {
  field_name = "id",      // WRONG!
  field_value = $input.id
}

// CORRECT:
db.get "table" {
  field_name = "id"       // No comma
  field_value = $input.id
}

// Object literals DO use commas:
data = {
  name: $input.name,      // Comma OK here
  email: $input.email
}
```

### CRITICAL: Variable Declaration

```xs
// WRONG - set_var doesn't exist in XanoScript
set_var $items = []

// CORRECT - use var block
var $items {
  value = []
}
```

### CRITICAL: db.del Does NOT Capture

```xs
// WRONG - db.del doesn't return anything
db.del "table" {
  field_name = "id"
  field_value = $input.id
} as $deleted    // ERROR!

// CORRECT - no "as" capture
db.del "table" {
  field_name = "id"
  field_value = $input.id
}
```

### CRITICAL: Query Structure

Every query MUST have these blocks:

```xs
query "endpoint_name" verb=GET {
  input {
    // Even if empty, this block must exist
  }

  stack {
    // Processing logic
  }

  response = $result
}
```

## Related Skills
- [sql-lambda-patterns](../sql-lambda-patterns/SKILL.md) - **PRIMARY** - SQL and Lambda development patterns
- [xanoscript-debugging](../xanoscript-debugging/SKILL.md) - Error recovery when XanoScript fails
- [effective-intents](../effective-intents/SKILL.md) - Writing MCP intents
- [api-testing](../api-testing/SKILL.md) - Testing API endpoints
