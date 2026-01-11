---
name: xanoscript-debugging
description: Use this skill when XanoScript generation fails or produces errors. Provides debugging patterns, common error fixes, and fallback strategies.
---

# XanoScript Debugging & Error Recovery

## When to Use This Skill

Use this skill when you encounter XanoScript errors like:
- `"unexpected 'set_var'"` - Invalid keyword
- `"Missing block: input"` - Malformed query structure
- `"Syntax error, while parsing..."` - Grammar issues
- `"Invalid arg: as"` - Incorrect capture syntax

---

## Error Recovery Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                   XANOSCRIPT ERROR RECOVERY                      │
├─────────────────────────────────────────────────────────────────┤
│  1. IDENTIFY the error type from the message                     │
│  2. CHECK the Common Errors table below                          │
│  3. TRY a simpler approach (see Fallback Strategies)             │
│  4. DOCUMENT the issue in task comments                          │
│  5. CREATE endpoint shell if logic keeps failing                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Common Errors & Fixes

### 1. "unexpected 'set_var'" or "unexpected 'var'"

**Cause:** The AI router generated code using keywords that don't exist in XanoScript.

**Fix:** XanoScript uses `var` for variable declaration, not `set_var`:

```xs
// WRONG - set_var doesn't exist
set_var $items = []

// CORRECT
var $items {
  value = []
}
```

### 2. "Missing block: input"

**Cause:** Query definition is malformed or missing required blocks.

**Fix:** Ensure query has proper structure:

```xs
// CORRECT structure
query "endpoint_name" verb=GET {
  input {
    // inputs here (can be empty but block must exist)
  }

  stack {
    // logic here
  }

  response = $result
}
```

### 3. "Syntax error, while parsing: 'db.del...' - Invalid arg: as"

**Cause:** `db.del` doesn't support the `as` capture syntax.

**Fix:** `db.del` doesn't return a value:

```xs
// WRONG
db.del "table" {
  field_name = "id"
  field_value = $input.id
} as $deleted

// CORRECT
db.del "table" {
  field_name = "id"
  field_value = $input.id
}
```

### 4. "unexpected ','" after equals

**Cause:** Using commas in block-level assignments.

**Fix:** No commas after `=` assignments:

```xs
// WRONG
db.get "table" {
  field_name = "id",      // NO COMMA!
  field_value = $input.id
}

// CORRECT
db.get "table" {
  field_name = "id"       // No comma
  field_value = $input.id
}
```

### 5. XanoScript not being applied at all

**Cause:** The API endpoint was created but the PUT to update logic failed.

**Fix:** Create endpoint first, then update with XanoScript separately:

```
Step 1: Create endpoint shell (POST with name, verb, description)
Step 2: Update with XanoScript (PUT with body content)
```

---

## Fallback Strategies

### Level 1: Simplify the XanoScript

If complex logic fails, try minimal versions:

```xs
// Instead of complex filtering:
query "users" verb=GET {
  input {}
  stack {
    db.query "user" {
      return = {type: "list"}
    } as $users
  }
  response = $users
}
```

### Level 2: Create Shell Endpoints Only

If XanoScript keeps failing, create endpoint shells and document for manual completion:

```
1. Create endpoints with: name, verb, description only
2. Add comment to task: "Endpoints created as shells, need manual XanoScript"
3. Document the inputs that should be added
4. User can complete via Xano UI
```

### Level 3: Use Xano UI for Complex Logic

For complex XanoScript that keeps failing:
1. Create the endpoint shell via API
2. Note the endpoint ID and API group ID
3. Add validation: "Manual XanoScript required"
4. Provide the XanoScript that should be added
5. User completes via Xano dashboard

---

## Documenting XanoScript Issues in Tasks

When XanoScript fails, document it properly:

```
action="add_comment", task_id=X, content="
XANOSCRIPT ERROR:
- Endpoint: GET /users (id: 1234)
- Error: unexpected 'set_var'
- Status: Created endpoint shell only
- Manual step needed: Add function stack via Xano UI
", author="claude"
```

For validations:

```
action="add_validation", task_id=X,
name="GET /users endpoint - shell only",
validation_type="checklist",
validation_status="pending",
validation_description="Endpoint created but needs XanoScript logic added manually",
resource_type="api", resource_id=1234, resource_group_id=100
```

---

## XanoScript Grammar Quick Reference

### Valid Keywords
- `query`, `function`, `task`, `table`, `tool`
- `input`, `stack`, `response`
- `var`, `conditional`, `foreach`, `for`
- `db.query`, `db.get`, `db.add`, `db.edit`, `db.del`, `db.has`
- `precondition`, `throw`, `try_catch`

### Invalid Keywords (Common Mistakes)
- `set_var` - Use `var` instead
- `return` - Use `response =` instead
- `let`, `const` - Use `var` instead
- `function()` - Not a function call, use `function.run`

### Capture Syntax
```xs
// Most operations support "as $variable"
db.query "table" { } as $result
db.get "table" { } as $record
db.add "table" { } as $new_record
db.edit "table" { } as $updated

// db.del does NOT support as
db.del "table" { }  // No capture
```

---

## When to Escalate

If after 2-3 attempts XanoScript still fails:

1. **Stop trying** - Don't burn context on repeated failures
2. **Create shell** - Endpoint with metadata only
3. **Document** - Add detailed comment about what was attempted
4. **Move on** - Complete other tasks, note this for user
5. **Update task** - Mark as partially complete with notes

---

## Related Skills
- [xanoscript-patterns](../xanoscript-patterns/SKILL.md) - Valid XanoScript syntax
- [api-testing](../api-testing/SKILL.md) - Testing endpoints
- [task-management](../task-management/SKILL.md) - Documenting issues
