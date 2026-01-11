---
name: effective-intents
description: Use this skill when writing MCP intents for Xano API operations, creating tables, columns, API groups, or endpoints.
---

# Effective MCP Intents

## When to Use
Always - this skill helps you write intents that the MCP server can route correctly.

## First Step: Get Workspace Context

**Before creating anything, always get the full workspace context first.**

```
Get full context for workspace 40
```

This returns:
- **All database tables** with IDs and names
- **All API endpoints** with IDs, names, and API group IDs

### Why This Matters

1. **Avoid duplicates** - See what tables/endpoints already exist
2. **Get correct IDs** - Need table IDs for SQL (`x40_534`), need apigroup_id for creating endpoints
3. **Understand the schema** - See the full picture before making changes

### Example Response

```yaml
workspaceId: 40
databaseTables:
  - id: 540, name: mcp_project
  - id: 541, name: mcp_task
  - id: 547, name: user
  - id: 553, name: pokemon
apis:
  - id: 1718, name: 'GET /health', appId: 216
  - id: 1773, name: 'POST /pokemon/sync', appId: 218
```

### Using Context Results

| Need | Use From Context |
|------|------------------|
| SQL table reference | `x{workspace}_{table_id}` → `x40_547` for user table |
| Create endpoint in group | `apigroup_id` = `appId` from context |
| Check if table exists | Search `databaseTables` by name |
| Check if endpoint exists | Search `apis` by name |

---

## Core Principles

### 1. Be Specific About the Action
Use clear verbs: create, add, list, get, update, delete

### 2. Name Resources Explicitly
Include table names, column names, API group names

### 3. Specify Types When Creating
For columns, include the type (text, int, decimal, etc.)

## Working Examples

### Creating Tables

**Good Intent**:
```
Create a table called 'users' with columns for email, password, and name
```
**Result**: Creates table with appropriate column types inferred

**Better Intent**:
```
Create a table called 'users' with email (email type), password (password type), and name (text type)
```
**Result**: Creates table with exact types specified

---

### Adding Columns

**Good Intent**:
```
Add a 'status' enum column to the orders table with values pending, shipped, delivered
```
**Result**: Creates enum column with specified values

**Poor Intent**:
```
Add status to orders
```
**Result**: May create wrong column type

---

### Creating Relationships

**Good Intent**:
```
Add a 'user_id' integer column to the orders table that references the users table
```
**Result**: Creates foreign key relationship

---

### Multi-Step Operations

**Good Intent**:
```
Create a table called 'products' and add columns for name (text), price (decimal), stock_quantity (int), and is_active (bool)
```
**Result**: Creates table then chains 4 column additions

---

### Listing Resources

**Good Intent**:
```
List all tables
```
**Result**: Returns all tables in configured workspace

**Good Intent**:
```
List all API endpoints in the 'auth' API group
```
**Result**: Returns APIs filtered by group

## Intent Patterns by Operation

| Operation | Pattern | Example |
|-----------|---------|---------|
| Create table | "Create a table called '[name]'" | "Create a table called 'products'" |
| Add column | "Add a '[name]' [type] column to [table]" | "Add a 'price' decimal column to products" |
| Add enum column | "Add '[name]' enum column with values [a, b, c]" | "Add 'status' enum column with values pending, active, completed" |
| Add tableref | "Add '[name]' column referencing [table] (id [N])" | "Add 'user_id' column referencing user table (id 428)" |
| Create API group | See "API Group/Endpoint Creation" section below | Must specify all body fields |
| Create API endpoint | See "API Group/Endpoint Creation" section below | Must specify all body fields |
| List tables | "List all tables" | "List all tables" |
| Get specific | "Get the [resource] named '[name]'" | "Get the table named 'users'" |

---

## API Group/Endpoint Creation (CRITICAL)

The MCP router requires **explicit body fields** for API groups and endpoints. Vague intents will fail.

### Creating API Groups

**Does NOT work**:
```
Create an API group called 'users'
```
Error: Missing param: description, swagger

**Works**:
```
Create API group. Body must have exactly these fields: name="users", description="User management endpoints", swagger=true
```

### Creating API Endpoints

**Does NOT work**:
```
Create a GET endpoint called 'list' in the users API group
```
Error: Missing param: description, verb

**Works**:
```
Create API endpoint. Body must have exactly these fields: name="users", description="List all users", verb="GET"
```

**Context required**: Always provide `apigroup_id` in context when creating endpoints.

### Full CRUD Example

To create a complete CRUD API for a resource:

```
# API Group (do first)
Create API group. Body must have exactly these fields: name="products", description="Product management", swagger=true

# Then endpoints (provide apigroup_id in context)
Create API endpoint. Body must have exactly these fields: name="products", description="List products", verb="GET"
Create API endpoint. Body must have exactly these fields: name="products/{product_id}", description="Get product by ID", verb="GET"
Create API endpoint. Body must have exactly these fields: name="products", description="Create product", verb="POST"
Create API endpoint. Body must have exactly these fields: name="products/{product_id}", description="Update product", verb="PATCH"
Create API endpoint. Body must have exactly these fields: name="products/{product_id}", description="Delete product", verb="DELETE"
```

## Common Mistakes

### Too Vague
```
# Bad
"Set up the database"

# Good
"Create tables for users, products, and orders with appropriate columns"
```

### Missing Type Information
```
# Bad
"Add price to products"

# Good
"Add a 'price' decimal column to the products table"
```

### Not Using Natural Language
```
# Bad (too technical)
"POST /workspace/37/table"

# Good (natural language)
"Create a new table called 'categories'"
```

---

## Data Generation & Test Seeding

The MCP server can generate realistic test data for your tables. Use these patterns:

### Single Record Insert

**Good Intent**:
```
Insert a record into the user table (id 428). Body: {name: "John Smith", email: "john@example.com", role: "rep"}
```
**Result**: Creates one user record

### Bulk Insert (Multiple Records)

**Good Intent**:
```
Insert records into the company table (id 429). Body: items = [
  {"name": "TechCorp", "domain": "techcorp.com", "industry": "Technology"},
  {"name": "HealthPlus", "domain": "healthplus.com", "industry": "Healthcare"}
]
```
**Result**: Creates multiple company records in one operation

### Intent Patterns for Data Generation

| Action | Pattern | Example |
|--------|---------|---------|
| Single insert | "Insert a record into [table] (id N). Body: {...}" | "Insert a record into user table (id 428). Body: {name: 'John'}" |
| Bulk insert | "Insert records into [table] (id N). Body: items = [...]" | "Insert records into company table (id 429). Body: items = [{...}, {...}]" |
| Generate realistic | "Generate N realistic [entity] records for [table]" | "Generate 10 realistic contacts for contact table (id 430)" |
| Seed full | "Seed [app] with: N [entity1], N [entity2]..." | "Seed CRM with: 5 users, 10 companies, 20 contacts" |

## Related Skills
- [xanoscript-patterns](../xanoscript-patterns/SKILL.md) - Full XanoScript reference
- [table-patterns](../table-patterns/SKILL.md) - Table design patterns
- [data-generation](../data-generation/SKILL.md) - Data generation patterns
