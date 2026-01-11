import type {DocTopic} from '../index.js'

export const tableDocs: DocTopic = {
  name: 'table',
  title: 'Table Documentation',
  description: 'Database table creation, schema management, and indexes',
  relatedTopics: ['addon', 'function', 'api'],
  content: `
# Table Documentation

## What is a Table?

A **Table** in Xano represents a database table that stores your application data.
Tables define the structure of your data including fields, types, relationships,
and indexes for efficient querying.

## Key Concepts

### 1. Every Table Needs an ID
Each table MUST have an \`id\` field as the primary key. This can be either
an \`int\` (auto-increment) or \`uuid\`.

### 2. Schema Block Contains Fields
All field definitions go inside a \`schema { }\` block.

### 3. Indexes Improve Performance
Define indexes for fields you frequently search or filter by.

## XanoScript Syntax

\`\`\`xanoscript
table "<table_name>" {
  auth = false                    # Set true only for auth tables (usually just "user")

  schema {
    <type> <field_name> {         # Required field
      description = "..."
    }

    <type> <field_name>? {        # Optional field (note the ?)
      description = "..."
    }

    <type> <field_name>?=<default> {  # Optional with default value
      description = "..."
    }

    <type> <foreign_key> {        # Foreign key relationship
      table = "<related_table>"
      description = "..."
    }
  }

  index = [
    {type: "primary", field: [{name: "id"}]}
    {type: "btree", field: [{name: "field_name", op: "asc"}]}
    {type: "btree|unique", field: [{name: "unique_field", op: "asc"}]}
  ]
}
\`\`\`

## Field Types

| Type | Description | Example |
|------|-------------|---------|
| \`int\` | Integer number | \`int age\` |
| \`decimal\` | Decimal number | \`decimal price\` |
| \`text\` | Text string | \`text name\` |
| \`email\` | Email address | \`email user_email\` |
| \`password\` | Hashed password | \`password user_password\` |
| \`bool\` | Boolean true/false | \`bool is_active\` |
| \`timestamp\` | Date and time | \`timestamp created_at\` |
| \`date\` | Date only | \`date birth_date\` |
| \`uuid\` | UUID identifier | \`uuid id\` |
| \`json\` | JSON object | \`json metadata\` |
| \`enum\` | Enumerated values | \`enum status { values = ["active", "inactive"] }\` |
| \`text[]\` | Array of text | \`text[] tags\` |
| \`int[]\` | Array of integers | \`int[] category_ids\` |
| \`image\` | Image file | \`image avatar\` |
| \`video\` | Video file | \`video content\` |
| \`audio\` | Audio file | \`audio recording\` |
| \`attachment\` | Any file | \`attachment document\` |
| \`vector\` | Vector embedding | \`vector embedding\` |

## Field Modifiers

### Optional Fields
Add \`?\` to make a field optional:
\`\`\`xanoscript
text nickname?        # Optional, can be null
\`\`\`

### Default Values
Use \`?=value\` for optional with default:
\`\`\`xanoscript
timestamp created_at?=now     # Defaults to current timestamp
bool is_active?=1             # Defaults to true
text status?="pending"        # Defaults to "pending"
\`\`\`

### Filters
Process input data with filters:
\`\`\`xanoscript
text name filters=trim               # Trim whitespace
email user_email filters=trim|lower  # Trim and lowercase
int quantity filters=min:0           # Minimum value 0
int rating filters=min:1|max:5       # Range 1-5
\`\`\`

### Field Attributes
\`\`\`xanoscript
text secret_data {
  description = "Sensitive information"
  sensitive = true                    # Mark as sensitive (hidden in logs)
}
\`\`\`

## Foreign Key Relationships

Reference other tables using the \`table\` attribute:

\`\`\`xanoscript
int user_id {
  table = "user"
  description = "Reference to user table"
}

int[] category_ids {
  table = "category"
  description = "Multiple category references"
}
\`\`\`

## Index Types

| Type | Description |
|------|-------------|
| \`primary\` | Primary key (required for id) |
| \`btree\` | Standard B-tree index |
| \`btree\|unique\` | Unique constraint index |
| \`gin\` | For JSON/array fields |
| \`gist\` | For geometric/spatial data |

### Index Examples
\`\`\`xanoscript
index = [
  {type: "primary", field: [{name: "id"}]}

  # Single field index
  {type: "btree", field: [{name: "created_at", op: "desc"}]}

  # Unique constraint
  {type: "btree|unique", field: [{name: "email", op: "asc"}]}

  # Composite index (multiple fields)
  {type: "btree", field: [{name: "user_id", op: "asc"}, {name: "status", op: "asc"}]}

  # JSON field index
  {type: "gin", field: [{name: "metadata"}]}
]
\`\`\`

## Complete Examples

### User Table
\`\`\`xanoscript
table "user" {
  auth = true
  schema {
    int id {
      description = "Unique user identifier"
    }
    text name filters=trim {
      description = "User's full name"
    }
    email email filters=trim|lower {
      description = "User's email address"
      sensitive = true
    }
    password password {
      description = "Hashed password"
      sensitive = true
    }
    bool is_active?=1 {
      description = "Whether the user account is active"
    }
    timestamp created_at?=now {
      description = "Account creation time"
    }
  }
  index = [
    {type: "primary", field: [{name: "id"}]}
    {type: "btree|unique", field: [{name: "email", op: "asc"}]}
  ]
}
\`\`\`

### Product Table
\`\`\`xanoscript
table "product" {
  auth = false
  schema {
    int id {
      description = "Product ID"
    }
    text name filters=trim {
      description = "Product name"
    }
    text description? filters=trim {
      description = "Product description"
    }
    decimal price filters=min:0 {
      description = "Product price"
    }
    int stock_quantity?=0 filters=min:0 {
      description = "Available stock"
    }
    int category_id {
      table = "category"
      description = "Product category"
    }
    text[] tags? {
      description = "Product tags for search"
    }
    json metadata? {
      description = "Additional product attributes"
    }
    timestamp created_at?=now
    timestamp updated_at?=now
  }
  index = [
    {type: "primary", field: [{name: "id"}]}
    {type: "btree", field: [{name: "category_id", op: "asc"}]}
    {type: "btree", field: [{name: "price", op: "asc"}]}
    {type: "gin", field: [{name: "tags"}]}
  ]
}
\`\`\`

## CLI Commands

### Create Table
\`\`\`bash
xano table create -w <workspace_id> -f table.xs
xano table create -w <workspace_id> -f table.xs -o json
\`\`\`

### List Tables
\`\`\`bash
xano table list -w <workspace_id>
xano table list -w <workspace_id> --search "user"
\`\`\`

### Get Table Details
\`\`\`bash
xano table get <table_id> -w <workspace_id>
xano table get <table_id> -w <workspace_id> -o json
xano table get <table_id> -w <workspace_id> -o xs   # XanoScript format
\`\`\`

### Delete Table
\`\`\`bash
xano table delete <table_id> -w <workspace_id>
xano table delete <table_id> -w <workspace_id> --force
\`\`\`

## Common Errors

### "Syntax error: unexpected 'id'"
**Cause**: Missing \`schema { }\` block around fields.
**Solution**: Wrap all fields in a schema block.

\`\`\`xanoscript
# WRONG
table "my_table" {
  int id { }           # Fields directly in table - wrong!
}

# CORRECT
table "my_table" {
  schema {
    int id { }         # Fields inside schema block
  }
}
\`\`\`

### "Primary key required"
**Cause**: Table is missing a primary key index.
**Solution**: Add primary key index for the id field.

\`\`\`xanoscript
index = [
  {type: "primary", field: [{name: "id"}]}   # Required!
]
\`\`\`

## Related Documentation

- \`xano docs addon\` - Create addons that query tables
- \`xano docs function\` - Functions that interact with tables
- \`xano docs api\` - API endpoints for table operations
`.trim(),
}
