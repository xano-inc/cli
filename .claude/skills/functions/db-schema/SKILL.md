# db.schema

The `db.schema` function retrieves the schema definition for a database table. This is useful for introspection, dynamic form generation, validation, and understanding table structure at runtime.

## Syntax

```xs
db.schema "table_name" as $schema
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `table_name` | Yes | The table name as a **literal string** (not a variable) |

## Return Value

Returns an array of column objects, each containing:

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Column name |
| `type` | string | Data type: `int`, `text`, `timestamp`, `enum`, `json`, `decimal`, `bool` |
| `style` | string | `"single"` for scalar, `"list"` for arrays |
| `access` | string | `"public"` or `"private"` |
| `default` | string | Default value (e.g., `"now"`, `"0"`, enum value) |
| `nullable` | boolean | Whether column accepts NULL |
| `required` | boolean | Whether column is required for insert |
| `description` | string | Column description |
| `format` | string | Format hint for text fields |
| `values` | array | Allowed values (enum types only) |
| `tableref_id` | number | Referenced table ID (foreign keys only) |

## Test Endpoints

**API Group:** xs-db-schema (ID: 244)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:m6gnJD7z`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `schema-table` | 1962 | Basic schema retrieval |
| `schema-dynamic` | 1963 | Dynamic table name (FAILS - see gotchas) |
| `schema-columns` | 1964 | Extract column names and types |
| `schema-enums` | 1965 | Extract enum columns with values |
| `schema-required` | 1966 | Filter required fields only |
| `schema-relations` | 1967 | Extract foreign key relationships |

## Patterns

### Pattern 1: Basic Schema Retrieval

```xs
query "schema-table" verb=GET {
  input {}

  stack {
    db.schema "mcp_task" as $schema
  }

  response = $schema
}
```

**Response:**
```json
[
  {"name": "id", "type": "int", "required": true, "nullable": false, ...},
  {"name": "title", "type": "text", "required": false, "nullable": false, ...},
  {"name": "status", "type": "enum", "values": ["backlog", "in_progress", ...], ...}
]
```

### Pattern 2: Extract Column Names and Types

```xs
query "schema-columns" verb=GET {
  input {}

  stack {
    db.schema "mcp_task" as $schema

    api.lambda {
      code = "return $var.schema.map(c => ({ name: c.name, type: c.type }));"
      timeout = 10
    } as $columns
  }

  response = $columns
}
```

**Response:**
```json
[
  {"name": "id", "type": "int"},
  {"name": "created_at", "type": "timestamp"},
  {"name": "title", "type": "text"},
  {"name": "status", "type": "enum"}
]
```

### Pattern 3: Extract Enum Columns with Values

```xs
query "schema-enums" verb=GET {
  input {}

  stack {
    db.schema "mcp_task" as $schema

    api.lambda {
      code = "return $var.schema.filter(c => c.type === 'enum').map(c => ({ name: c.name, values: c.values }));"
      timeout = 10
    } as $enums
  }

  response = $enums
}
```

**Response:**
```json
[
  {"name": "type", "values": ["epic", "task", "subtask"]},
  {"name": "status", "values": ["backlog", "planned", "in_progress", "completed", ...]},
  {"name": "priority", "values": ["critical", "high", "medium", "low", "none"]}
]
```

### Pattern 4: Filter Required Fields

```xs
query "schema-required" verb=GET {
  input {}

  stack {
    db.schema "mcp_task" as $schema

    api.lambda {
      code = "return $var.schema.filter(c => c.required === true);"
      timeout = 10
    } as $required
  }

  response = $required
}
```

### Pattern 5: Extract Foreign Key Relationships

```xs
query "schema-relations" verb=GET {
  input {}

  stack {
    db.schema "mcp_task" as $schema

    api.lambda {
      code = "return $var.schema.filter(c => c.tableref_id).map(c => ({ name: c.name, references_table_id: c.tableref_id }));"
      timeout = 10
    } as $relations
  }

  response = $relations
}
```

**Response:**
```json
[
  {"name": "project_id", "references_table_id": 563},
  {"name": "parent_id", "references_table_id": 564}
]
```

## Use Cases

| Use Case | Approach |
|----------|----------|
| **Dynamic form generation** | Get schema, generate form fields from column types |
| **Validation** | Check allowed enum values before insert |
| **API documentation** | Auto-generate field docs from schema |
| **Migration checks** | Compare schema between environments |
| **Relationship discovery** | Find foreign keys via `tableref_id` |

## Gotchas and Limitations

### 1. Table Name Must Be Literal String

**CRITICAL:** `db.schema` only accepts literal table names, NOT variables.

```xs
// WORKS - literal string
db.schema "mcp_task" as $schema

// FAILS - returns NOT_FOUND error
db.schema $input.table_name as $schema
```

If you need dynamic table lookup, you must use a `switch` or `conditional` with hardcoded table names:

```xs
conditional ($input.table_name == "mcp_task") {
  db.schema "mcp_task" as $schema
}
conditional ($input.table_name == "mcp_project") {
  db.schema "mcp_project" as $schema
}
```

### 2. No Block Parameters

Unlike `db.query` or `db.get`, `db.schema` does NOT take a block `{}`:

```xs
// WRONG - causes syntax error
db.schema { table = "mcp_task" } as $schema
db.schema { name = "mcp_task" } as $schema

// CORRECT - table name as direct argument
db.schema "mcp_task" as $schema
```

### 3. Private Columns Included

Schema returns ALL columns including those with `access: "private"`. Filter in Lambda if needed:

```xs
api.lambda {
  code = "return $var.schema.filter(c => c.access === 'public');"
} as $public_columns
```

### 4. Default Values Are Strings

Default values are always returned as strings, even for numeric types:

```json
{"name": "estimate_points", "type": "int", "default": "0"}
```

Parse in Lambda if needed: `parseInt(col.default)`.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `ERROR_CODE_NOT_FOUND` | Table doesn't exist OR variable used for name | Use literal table name string |
| `Syntax error: Invalid block` | Using `{}` block with parameters | Use `db.schema "name"` syntax |
| `unexpected 'as'` | Syntax issue | Ensure format is `db.schema "name" as $var` |

## db.schema vs Xano Metadata API

| Approach | Use When |
|----------|----------|
| `db.schema "table"` | Runtime introspection within endpoints |
| Xano Metadata API | External tooling, migrations, workspace management |

The Metadata API (via MCP `xano_execute`) returns more details including indexes, but requires API calls. `db.schema` is faster for in-endpoint use.

## Related Functions

- [db.query](../db-query/SKILL.md) - Query records from table
- [db.get](../db-get/SKILL.md) - Get single record
- [db.direct_query](../db-direct-query/SKILL.md) - Raw SQL queries
