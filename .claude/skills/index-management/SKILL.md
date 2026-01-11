---
name: index-management
description: Use this skill when creating, managing, or optimizing database indexes in Xano for query performance, uniqueness constraints, full-text search, spatial queries, or vector similarity searches.
---

# Database Index Management in Xano

## When to Use

Use indexes to optimize query performance on frequently queried columns, enforce uniqueness constraints, enable full-text search, support location-based queries, or enable AI/embedding similarity searches.

---

## Available Index Types

| Index Type | Purpose | Use Case |
|------------|---------|----------|
| **B-tree** | Query optimization | WHERE clauses, ORDER BY, joins |
| **Unique** | Enforce uniqueness | Email, username, external IDs |
| **Search** | Full-text search | Article content, product descriptions |
| **Spatial** | Geometry operations | Location/GPS queries, map features |
| **Vector** | Similarity search | AI embeddings, recommendations |

---

## B-tree Index (Query Optimization)

Standard index for optimizing SELECT queries with WHERE, ORDER BY, and JOIN operations.

### Intent Examples

```
Create a B-tree index on the users table (id 534) for the email column ascending
```

```
Create a B-tree index on orders table (id 535) for customer_id ascending and created_at descending
```

### Schema

```json
{
  "fields": [
    { "name": "column_name", "op": "asc" }
  ]
}
```

**Required Fields:**
- `name`: Column name to index
- `op`: Sort order - `"asc"` or `"desc"`

### Multi-Column Index

For queries that filter/sort on multiple columns:

```
Create a B-tree index on orders table (id 535) for status ascending and created_at descending
```

```json
{
  "fields": [
    { "name": "status", "op": "asc" },
    { "name": "created_at", "op": "desc" }
  ]
}
```

### When to Use B-tree

- Columns frequently used in WHERE clauses
- Columns used in ORDER BY
- Foreign key columns used in JOINs
- Columns used in comparison operators (=, <, >, BETWEEN)

---

## Unique Index (Uniqueness Constraint)

Enforces that values in the indexed column(s) are unique across all rows.

### Intent Examples

```
Create a unique index on users table (id 534) for the email column
```

```
Create a unique index on api_keys table (id 540) for user_id and key_name columns
```

### Schema

```json
{
  "fields": [
    { "name": "column_name", "op": "asc" }
  ]
}
```

### Composite Unique Index

For uniqueness across multiple columns (e.g., one API key name per user):

```json
{
  "fields": [
    { "name": "user_id", "op": "asc" },
    { "name": "key_name", "op": "asc" }
  ]
}
```

### When to Use Unique Index

- Email addresses
- Usernames
- External IDs (Stripe customer ID, OAuth provider ID)
- Slugs/URLs
- Composite business keys

---

## Full-Text Search Index

Enables efficient text searching with language-specific stemming and stop words.

### Intent Examples

```
Create a full-text search index named 'article_search' on articles table (id 536) for title (priority 1) and content (priority 2) columns in English
```

```
Create a search index named 'product_search' on products table (id 537) for name and description fields in English
```

### Schema

```json
{
  "name": "search_index_name",
  "lang": "english",
  "fields": [
    { "name": "title", "priority": 1 },
    { "name": "content", "priority": 2 }
  ]
}
```

**Required Fields:**
- `name`: Unique name for the search index
- `lang`: Language for stemming/stop words
- `fields`: Array with column name and priority (lower = higher relevance)

### Supported Languages

```
simple, arabic, danish, dutch, english, finnish, french, german,
hungarian, indonesian, irish, italian, lithuanian, nepali,
norwegian, portuguese, romanian, russian, spanish, swedish,
tamil, turkish
```

### Priority Explained

Lower priority numbers = higher search relevance. Example:
- `title` with priority 1 → Matches rank higher
- `content` with priority 2 → Matches rank lower

### When to Use Search Index

- Blog/article search
- Product catalog search
- Document search
- FAQ/help content search

### Using the Search Index in Queries

After creating a search index, use this SQL pattern:

```sql
-- Basic full-text search
SELECT * FROM x40_551
WHERE to_tsvector('english', COALESCE(subject, '') || ' ' || COALESCE(description, ''))
      @@ plainto_tsquery('english', 'search term')

-- Optional search (when input might be empty)
SELECT * FROM x40_551
WHERE (NULLIF(?, '') IS NULL OR
       to_tsvector('english', COALESCE(subject, '') || ' ' || COALESCE(description, ''))
       @@ plainto_tsquery('english', ?))
```

**XanoScript Example:**
```xs
db.direct_query {
  sql = """
    SELECT * FROM x40_551
    WHERE (NULLIF(?, '') IS NULL OR
           to_tsvector('english', COALESCE(subject, '') || ' ' || COALESCE(description, ''))
           @@ plainto_tsquery('english', ?))
    ORDER BY created_at DESC
    LIMIT 50
  """
  response_type = "list"
  arg = $input.q
  arg = $input.q
} as $results
```

**Key Points:**
- Use `NULLIF(?, '')` to make search optional
- Pass the search arg twice (once for null check, once for query)
- `plainto_tsquery` handles natural language (spaces between words = AND)
- Match the language ('english') to your index language

---

## Spatial Index (Geometry/Location)

Optimizes queries on geographic/geometry data for location-based features.

### Intent Examples

```
Create a spatial index on stores table (id 538) for the location column
```

```
Create a spatial index on properties table (id 539) for the coordinates column
```

### Schema

```json
{
  "fields": [
    { "name": "location", "op": "gist_geometry_ops_2d" }
  ]
}
```

**Required Fields:**
- `name`: Column name containing geometry data
- `op`: Always `"gist_geometry_ops_2d"` for 2D geometry

### When to Use Spatial Index

- Store locator features
- Nearby search (find restaurants within 5km)
- Geofencing
- Map visualization with clustering
- Delivery zone validation

---

## Vector Index (AI/Embedding Similarity)

Enables efficient similarity searches on vector/embedding columns for AI applications.

### Intent Examples

```
Create a vector index on documents table (id 541) for the embedding column using cosine similarity
```

```
Create a vector index on products table (id 537) for the feature_vector column using L2 distance
```

### Schema

```json
{
  "fields": [
    { "name": "embedding", "op": "vector_cosine_ops" }
  ]
}
```

**Required Fields:**
- `name`: Column name containing vector data
- `op`: Distance operation type

### Distance Operations

| Operation | Code | Use Case |
|-----------|------|----------|
| **Cosine** | `vector_cosine_ops` | Text similarity, recommendations (most common) |
| **Inner Product** | `vector_ip_ops` | Normalized vectors, dot product similarity |
| **L2 Distance** | `vector_l2_ops` | Euclidean distance, image similarity |
| **L1 Distance** | `vector_l1_ops` | Manhattan distance |

### When to Use Vector Index

- Semantic search (find similar documents)
- Product recommendations
- Image similarity search
- RAG (Retrieval Augmented Generation)
- Clustering similar items

---

## Managing Indexes

### List All Indexes

```
List all indexes on users table (id 534)
```

Returns array of existing indexes with their IDs and configuration.

### Delete an Index

```
Delete index idx_abc123 from users table (id 534)
```

**Note:** Index deletion cannot be undone. Always verify before deleting.

### Replace All Indexes

```
Replace all indexes on users table (id 534) with new configuration
```

This is a destructive operation that replaces ALL indexes at once.

---

## Best Practices

### Do's

1. **Index foreign keys** - Always index columns used in JOINs
2. **Index WHERE columns** - Columns frequently filtered should be indexed
3. **Use composite indexes** - For queries that filter on multiple columns
4. **Match index order** - Column order in composite indexes matters
5. **Use unique indexes** - Instead of application-level uniqueness checks

### Don'ts

1. **Don't over-index** - Each index adds write overhead
2. **Don't index low-cardinality** - Boolean columns rarely benefit
3. **Don't index rarely-queried columns** - Wastes storage
4. **Don't duplicate indexes** - Check existing indexes first

### Index Order for Composite Indexes

Column order matters! Index `(status, created_at)` is optimal for:
- `WHERE status = 'active' ORDER BY created_at`
- `WHERE status = 'active'`

But NOT optimal for:
- `WHERE created_at > '2024-01-01'` (first column not used)

---

## Common Patterns

### User Table

```
# Unique email
Create a unique index on users table for email column

# Search by name
Create a B-tree index on users table for name column ascending
```

### E-commerce Products

```
# Full-text search
Create a search index named 'product_search' on products table for name (priority 1) and description (priority 2) in English

# Filter by category and sort by price
Create a B-tree index on products table for category_id ascending and price ascending
```

### Location-based App

```
# Spatial queries
Create a spatial index on locations table for the coordinates column

# Filter by type and distance
Create a B-tree index on locations table for type ascending
```

### AI/Embeddings

```
# Semantic search
Create a vector index on documents table for embedding column using cosine similarity
```

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Index creation fails | Column doesn't exist | Verify column name with `List columns on table` |
| Unique index fails | Duplicate values exist | Clean duplicates first, then create index |
| Search not working | Wrong language setting | Match language to content language |
| Slow queries despite index | Index not being used | Check query EXPLAIN, may need different index |

---

## Related Skills

- [table-patterns](../table-patterns/SKILL.md) - Table design patterns
- [effective-intents](../effective-intents/SKILL.md) - Intent writing best practices
- [sql-lambda-patterns](../sql-lambda-patterns/SKILL.md) - SQL query patterns
