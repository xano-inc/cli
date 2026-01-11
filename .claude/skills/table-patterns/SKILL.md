---
name: table-patterns
description: Use this skill when designing database tables, creating schemas, or setting up relationships between tables in Xano.
---

# Table Design Patterns for Xano

## When to Use
When designing database tables for common application features.

## Common Patterns

### 1. User Authentication Table

**Intent**:
```
Create a table called 'user' with name (text, required), email (email type, required, unique), and password (password type, required)
```

**Standard Columns**:
- `id` (auto-created)
- `created_at` (auto-created)
- `name` - text, required
- `email` - email type, unique
- `password` - password type (auto-hashed)

**Notes**: Xano automatically handles password hashing when using password type.

---

### 2. Resource with Ownership

**Pattern**: Any resource that belongs to a user

**Intent**:
```
Create a table called 'posts' and add columns for user_id (int referencing users), title (text), content (text), and published_at (timestamp)
```

**Standard Columns**:
- `id`, `created_at` (auto)
- `user_id` - int, foreign key to users
- Resource-specific fields

---

### 3. Many-to-Many Junction Table

**Pattern**: Linking two tables (e.g., users and roles)

**Intent**:
```
Create a table called 'user_roles' and add columns for user_id (int referencing users) and role_id (int referencing roles)
```

---

### 4. Status/State Machine Table

**Pattern**: Resources with workflow states

**Intent**:
```
Create a table called 'orders' and add columns for user_id (int), status (enum with values: pending, processing, shipped, delivered, cancelled), total (decimal), and notes (text)
```

---

### 5. Hierarchical/Self-Referencing Table

**Pattern**: Categories, comments, org structures

**Intent**:
```
Create a table called 'categories' and add columns for name (text), description (text), and parent_id (int, nullable, referencing categories)
```

---

## Column Type Quick Reference

| Use Case | Type | Notes |
|----------|------|-------|
| IDs, counts | int | Auto-increment for primary |
| Names, titles | text | Use validators for length |
| Email | email | Built-in validation |
| Password | password | Auto-hashed |
| Money, prices | decimal | Avoid float for precision |
| Yes/No flags | bool | |
| Dates | timestamp | Timezone aware |
| Flexible data | json | For dynamic schemas |
| Fixed options | enum | Define allowed values |
| Files | file/image | Xano file storage |

## Best Practices

1. **Always use password type** for passwords (auto-hashing)
2. **Use email type** for emails (validation)
3. **Use decimal for money** (not float)
4. **Add timestamps** for audit trails
5. **Use enum for status** fields (type safety)

---

## Critical: Enum Values & Tableref Columns

### Enum Columns with Values

When creating enum columns, you MUST explicitly include the values:

**Intent**:
```
Add a status enum column with values: pending, active, completed to the orders table (id 123)
```

**What Gemini should generate** (body must include `values` array):
```json
{
  "operationId": "workspace_table_schema_type_enum_post",
  "parameters": { "workspace_id": 37, "table_id": 123 },
  "body": {
    "name": "status",
    "values": ["pending", "active", "completed"]
  }
}
```

### Tableref (Foreign Key) Columns

When creating tableref columns, you MUST include the `tableref_id` in the body:

**Intent**:
```
Add a user_id column that references the user table (id 428) to the orders table (id 123)
```

**What Gemini should generate** (body must include `tableref_id`):
```json
{
  "operationId": "workspace_table_schema_type_tableref_post",
  "parameters": { "workspace_id": 37, "table_id": 123 },
  "body": {
    "name": "user_id",
    "tableref_id": 428
  }
}
```

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Enum values empty | `values` not in body | Explicitly specify values in intent |
| Tableref fails | `tableref_id` not in body | Include referenced table ID in intent |

## Related Skills
- [effective-intents](../effective-intents/SKILL.md) - Intent patterns
- [xanoscript-patterns](../xanoscript-patterns/SKILL.md) - XanoScript reference
