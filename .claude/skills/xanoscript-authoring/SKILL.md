---
name: xanoscript-authoring
description: Use this skill when creating, editing, or debugging XanoScript code. This skill provides a comprehensive map of reference documentation and efficient search strategies.
---

# XanoScript Authoring Guide

This skill provides guidance for creating valid XanoScript code. Use the reference documentation map below to find the right syntax, patterns, and examples.

---

## Reference Documentation Map

All XanoScript reference files are located in:
```
.claude/reference/xanoscript-ai-documentation/
```

### Quick Reference by Task

| Task | Primary File | Secondary File |
|------|-------------|----------------|
| **Create API endpoint** | `api_query_guideline.md` | `api_query_examples.md` |
| **Create function** | `function_guideline.md` | `function_examples.md` |
| **Create table** | `table_guideline.md` | `table_examples.md` |
| **Create scheduled task** | `task_guideline.md` | `task_examples.md` |
| **Create agent** | `agent_guideline.md` | `agent_examples.md` |
| **Create MCP server** | `mcp_server_guideline.md` | `mcp_server_examples.md` |
| **Create tool** | `tool_guideline.md` | `tool_examples.md` |
| **Database queries** | `db_query_guideline.md` | `query_filter.md` |
| **Input parameters** | `input_guideline.md` | `functions.md` |
| **Expressions & filters** | `expression_guideline.md` | `functions.md` |
| **Unit testing** | `unit_testing_guideline.md` | - |
| **Workspace setup** | `workspace.md` | `ephemeral_environment_guideline.md` |
| **Function reference** | `functions.md` | - |

---

## File Contents Overview

### Core Documentation

| File | Contents |
|------|----------|
| `functions.md` | **Complete function reference** - All XanoScript functions with syntax and examples (2000+ lines). Covers: `var`, `db.*`, `array.*`, `math.*`, `text.*`, `security.*`, `redis.*`, `cloud.*`, `storage.*`, `stream.*`, etc. |
| `query_filter.md` | Database query filter operators (`where` clause syntax) |
| `expression_guideline.md` | Expression syntax, filters, and operators |
| `input_guideline.md` | Input block syntax, data types, filters, validation |

### Resource-Specific Guidelines

| File | When to Read |
|------|-------------|
| `api_query_guideline.md` | Creating API endpoints (`query` blocks) |
| `function_guideline.md` | Creating reusable functions |
| `table_guideline.md` | Creating database tables with schema |
| `task_guideline.md` | Creating scheduled tasks |
| `agent_guideline.md` | Creating AI agents |
| `mcp_server_guideline.md` | Creating MCP servers |
| `tool_guideline.md` | Creating tools |

### Example Files

| File | Contains |
|------|----------|
| `api_query_examples.md` | Real API endpoint examples |
| `function_examples.md` | Real function examples |
| `table_examples.md` | Real table schema examples |
| `task_examples.md` | Real task examples |
| `agent_examples.md` | Real agent examples |
| `mcp_server_examples.md` | Real MCP server examples |
| `tool_examples.md` | Real tool examples |

### Specialized Topics

| File | Purpose |
|------|---------|
| `db_query_guideline.md` | Deep dive into `db.query`, `db.add`, `db.edit`, `db.del` |
| `unit_testing_guideline.md` | How to write workflow tests |
| `ephemeral_environment_guideline.md` | Running temporary jobs/services |
| `workspace.md` | Workspace structure and configuration |
| `frontend_guideline.md` | Building frontend integrations |
| `build_from_lovable.md` | Integration patterns |

### Agent-Specific Documentation

| File | Contents |
|------|----------|
| `AGENTS.md` | Overview of agent types |
| `API_AGENTS.md` | API-focused agents |
| `FUNCTION_AGENTS.md` | Function-focused agents |
| `TABLE_AGENTS.md` | Table-focused agents |
| `TASK_AGENTS.md` | Task-focused agents |
| `tips_and_tricks.md` | Advanced patterns and tips |

---

## Search Strategies

### Finding Function Syntax

To find how to use a specific function:

1. **Search `functions.md` first** - Contains all function syntax
   ```
   Search pattern: "# <function_name>" (e.g., "# db.query", "# array.filter")
   ```

2. **Look for examples in `*_examples.md` files**
   ```
   Search pattern: "<function_name>" across all example files
   ```

### Finding Resource Structure

To understand how to structure a resource:

1. **Read the guideline first**: `<resource>_guideline.md`
2. **Check examples**: `<resource>_examples.md`

### Common Search Patterns

| Looking for... | Search in | Pattern |
|---------------|-----------|---------|
| Function syntax | `functions.md` | `# <function_name>` |
| Input type | `input_guideline.md`, `functions.md` | `<type>` (e.g., `text`, `int`) |
| Filter syntax | `functions.md`, `expression_guideline.md` | `filters=` |
| Query where clause | `db_query_guideline.md`, `query_filter.md` | `where =` |
| Error handling | `functions.md` | `try_catch`, `throw` |
| Control flow | `functions.md` | `conditional`, `for`, `foreach`, `while` |

---

## XanoScript Structure Reference

### API Query (`query`)

```xs
query "/endpoint" verb=GET {
  description = "Description"
  auth = "user"  // Optional: requires authentication

  input {
    text param filters=trim {
      description = "Parameter description"
    }
  }

  stack {
    // Logic here
  }

  response = $result
}
```

**File location**: `apis/<api-group>/<endpoint>.xs`

### Function (`function`)

```xs
function "namespace/name" {
  description = "Description"

  input {
    int value {
      description = "Input value"
    }
  }

  stack {
    // Logic here
  }

  response = $result
}
```

**File location**: `functions/<name>.xs` or `functions/<namespace>/<name>.xs`

### Table (`table`)

```xs
table "name" {
  auth = false

  schema {
    int id
    text name filters=trim
    email email filters=trim|lower
    timestamp created_at?=now
  }

  index = [
    {type: "primary", field: [{name: "id"}]},
    {type: "btree", field: [{name: "email"}]}
  ]
}
```

**File location**: `tables/<name>.xs`

### Task (`task`)

```xs
task "name" {
  description = "Description"

  stack {
    // Logic here
  }

  schedule = [
    {starts_on: 2025-01-01 00:00:00+0000, freq: 86400}
  ]
}
```

**File location**: `tasks/<name>.xs`

---

## Common Patterns

### Database Operations

```xs
// Query records
db.query "table_name" {
  where = $db.table_name.column == $input.value
  sort = {created_at: "desc"}
  return = {type: "list", paging: {page: 1, per_page: 20}}
} as $results

// Get single record
db.get "table_name" {
  field_name = "id"
  field_value = $input.id
} as $record

// Add record
db.add "table_name" {
  data = {name: $input.name, email: $input.email}
} as $new_record

// Edit record
db.edit "table_name" {
  field_name = "id"
  field_value = $input.id
  data = {name: $input.name}
} as $updated

// Delete record
db.del "table_name" {
  field_name = "id"
  field_value = $input.id
}
```

### Control Flow

```xs
// Conditional
conditional {
  if ($condition) {
    // true branch
  }
  elseif ($other_condition) {
    // elseif branch
  }
  else {
    // else branch
  }
}

// For loop (count-based)
for (10) {
  each as $index {
    // $index is 0-9
  }
}

// Foreach loop (array-based)
foreach ($array) {
  each as $item {
    // process $item
  }
}

// While loop
while ($condition) {
  each {
    // loop body
  }
}
```

### Error Handling

```xs
try_catch {
  try {
    // risky operation
  }
  catch {
    debug.log {
      value = "Error occurred"
    }
  }
  finally {
    // cleanup
  }
}

// Throw error
throw {
  name = "ValidationError"
  value = "Invalid input"
}

// Precondition (throws if false)
precondition ($condition) {
  error_type = "standard"
  error = "Condition not met"
}
```

### Array Operations

```xs
// Filter
array.filter $items if ($this.active == true) as $active_items

// Map
array.map ($items) {
  by = $this.name
} as $names

// Find
array.find $items if ($this.id == $target_id) as $found

// Group by
array.group_by ($items) {
  by = $this.category
} as $grouped

// Push/Pop
array.push $items {
  value = $new_item
}
array.pop $items as $last_item
```

---

## Data Types Reference

| Type | Description | Example |
|------|-------------|---------|
| `int` | Integer | `42` |
| `decimal` | Decimal number | `3.14` |
| `text` | Text string | `"hello"` |
| `bool` | Boolean | `true`, `false` |
| `email` | Email address | `"user@example.com"` |
| `password` | Hashed password | Auto-hashed on save |
| `timestamp` | Date/time | `2025-01-01 00:00:00+0000` |
| `date` | Date only | `2025-01-01` |
| `uuid` | UUID | Auto-generated |
| `json` | JSON object | `{key: "value"}` |
| `image` | Image file | File reference |
| `video` | Video file | File reference |
| `audio` | Audio file | File reference |
| `attachment` | Generic file | File reference |
| `vector` | Vector embedding | Array of floats |

---

## Input Filters Reference

| Filter | Purpose | Example |
|--------|---------|---------|
| `trim` | Remove whitespace | `filters=trim` |
| `lower` | Lowercase | `filters=lower` |
| `upper` | Uppercase | `filters=upper` |
| `min:N` | Minimum value | `filters=min:0` |
| `max:N` | Maximum value | `filters=max:100` |
| Multiple | Chain with `\|` | `filters=trim\|lower` |

---

## Efficient Reference Lookup

### Step 1: Identify What You Need

- **Function syntax?** → `functions.md`
- **Resource structure?** → `<resource>_guideline.md`
- **Real examples?** → `<resource>_examples.md`
- **Query filters?** → `query_filter.md`

### Step 2: Search Strategy

```bash
# Find function syntax
grep -n "# db.query" .claude/reference/xanoscript-ai-documentation/functions.md

# Find usage examples
grep -rn "db.query" .claude/reference/xanoscript-ai-documentation/*_examples.md

# Find input type syntax
grep -n "text.*filters" .claude/reference/xanoscript-ai-documentation/input_guideline.md
```

### Step 3: Validate Your Code

- Check syntax against `functions.md`
- Verify structure against `*_guideline.md`
- Compare with `*_examples.md` for patterns

---

## Quick Function Lookup Table

| Category | Functions |
|----------|-----------|
| **Variables** | `var`, `var.update` |
| **Database** | `db.query`, `db.get`, `db.add`, `db.edit`, `db.del`, `db.has`, `db.add_or_edit`, `db.direct_query`, `db.schema`, `db.transaction`, `db.truncate`, `db.set_datasource` |
| **Arrays** | `array.push`, `array.pop`, `array.shift`, `array.unshift`, `array.filter`, `array.map`, `array.find`, `array.find_index`, `array.has`, `array.every`, `array.group_by`, `array.partition`, `array.merge`, `array.union`, `array.difference`, `array.intersection`, `array.filter_count` |
| **Math** | `math.add`, `math.sub`, `math.mul`, `math.div`, `math.bitwise.and`, `math.bitwise.or`, `math.bitwise.xor` |
| **Text** | `text.trim`, `text.ltrim`, `text.rtrim`, `text.append`, `text.prepend`, `text.contains`, `text.icontains`, `text.starts_with`, `text.ends_with`, `text.istarts_with`, `text.iends_with` |
| **Security** | `security.create_auth_token`, `security.create_uuid`, `security.create_password`, `security.check_password`, `security.encrypt`, `security.decrypt`, `security.random_number`, `security.random_bytes`, `security.jws_encode`, `security.jws_decode`, `security.jwe_encode`, `security.jwe_decode`, `security.create_secret_key`, `security.create_curve_key` |
| **Control** | `conditional`, `for`, `foreach`, `while`, `switch`, `continue`, `return`, `throw`, `try_catch`, `precondition` |
| **API** | `api.lambda`, `api.request`, `api.stream`, `api.realtime_event` |
| **Redis** | `redis.get`, `redis.set`, `redis.del`, `redis.has`, `redis.push`, `redis.pop`, `redis.shift`, `redis.unshift`, `redis.range`, `redis.count`, `redis.keys`, `redis.incr`, `redis.decr`, `redis.ratelimit`, `redis.remove` |
| **Storage** | `storage.create_file_resource`, `storage.read_file_resource`, `storage.create_image`, `storage.create_attachment`, `storage.sign_private_url`, `storage.delete_file` |
| **Utilities** | `util.send_email`, `util.template_engine`, `util.set_header`, `util.get_env`, `util.get_input`, `util.get_all_input`, `util.sleep`, `util.ip_lookup`, `util.geo_distance` |
| **Object** | `object.keys`, `object.values`, `object.entries` |
| **Cloud** | `cloud.aws.s3.*`, `cloud.azure.storage.*`, `cloud.google.storage.*`, `cloud.elasticsearch.*`, `cloud.aws.opensearch.*`, `cloud.algolia.*` |
| **Stream** | `stream.from_csv`, `stream.from_jsonl`, `stream.from_request` |
| **Zip** | `zip.create_archive`, `zip.add_to_archive`, `zip.delete_from_archive`, `zip.extract`, `zip.view_contents` |
| **Debug** | `debug.log`, `debug.stop` |
| **Functions** | `function.run`, `group`, `stack` |
