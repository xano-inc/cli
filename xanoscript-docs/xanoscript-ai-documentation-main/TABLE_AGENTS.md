---
applyTo: "tables/*.xs"
---

# Xanoscript Custom Tables Guide

This document serves as comprehensive instructions for generating custom tables in Xanoscript. As an AI agent (e.g., copilot), use these guidelines to create robust database schemas based on user requests. Emphasize data integrity, query optimization, and relational modeling. Capture language subtleties: field types enforce storage/validation; relations via `table` imply foreign keys (no auto-cascade); indexes support composite/multi-field with ops; enums are inline-defined; auth toggles row-level security. Reference examples and syntax from supporting docs.

## Core Principles

- **Schema Rigidity**: Fields define type-enforced columns; filters apply on insert/update (e.g., `trim` strips whitespace, `lower` normalizes case).
- **Relations**: `table` links to another table's primary key; supports scalars (`int user_id { table = "user" }`) and arrays (`int[] category_ids { table = "category" }` for many-to-many).
- **Indexing Subtleties**: `primary` auto-generates sequence/UUID; `btree` for sorted/range queries (add `|unique` for no-dups); `gin` for full-text/JSON ops; composite indexes via field arrays; `op: "asc/desc"` for sort direction; no explicit foreign key constraints—handle in app logic.
- **Security/Defaults**: `auth = true` enables per-row auth via policies; `sensitive = true` flags PII for encryption/logging; defaults (`?=now`) apply on insert if null.
- **Extensibility**: `json` for schemaless data; `vector` for embeddings; media types (`image`, etc.) store URLs/blobs.
- **Documentation**: `description` on table/fields for auto-gen docs; enums have inline `values` array.

## Table Structure

Every custom table follows this template, highlighting subtleties:

```xs
table <table_name> [description = "<Table purpose; optional, for metadata>"] {
  auth = <true/false>  // true: enables row-level security; false: public access

  schema {
    <type> <field_name> [? for optional] [filters=<pipe-separated: trim|lower|min:0|max:100|etc>] [?= <default: now|null|literal>] {
      description = "<Field purpose; required for clarity>"
      [sensitive = true]  // Flags for encryption/auditing; optional
      [table = "<related_table>"]  // FK relation; optional, infers type match
    }
    // Enum example:
    enum <field_name>? {
      values = ["val1", "val2"]  // Required array; strings only
      description = "<Enum purpose>"
    }
    // Array example:
    <type>[] <field_name> { table = "<related_table>" }
  }

  index = [  // Array of index defs; order matters for optimizer hints
    {type: "primary", field: [{name: "id"}]}  // Auto: int seq or uuid gen
    {type: "btree|unique", field: [{name: "email", op: "asc"}]}  // Unique, sorted asc
    {type: "btree", field: [  // Composite: multi-field, ops per field
      {name: "user_id", op: "asc"},
      {name: "created_at", op: "desc"}
    ]}
    {type: "gin", field: [{name: "json_field"}]}  // For @> ops on JSON/arrays
    // No op on gin; supports jsonb_path_op for advanced
  ]
}
```

- **Name**: Snake_case plural (e.g., `user_profiles`); no spaces.
- **Types**: `int` (32-bit, auto-inc if primary), `decimal` (precise floats), `bool` (true/false), `timestamp` (UTC ms), `date` (YYYY-MM-DD), `uuid` (v4 gen), `vector` (float[] for ML), `json` (object/array), `enum` (string subset), media (`image` stores URL/blob ref).
- **Filters**: Chained via `|`; type-specific (e.g., `email` auto-validates format).
- **Defaults**: Evaluated at insert; `now` is UTC timestamp; supports expressions like `?=1`.
- **Relations Subtleties**: `table` doesn't enforce referential integrity (no on-delete); use in queries for joins; arrays imply junction table logic in app.
- **Index Subtleties**: `type` pipes modifiers (`btree|hash`); field array allows partial indexes (e.g., where clause via app); gin for tsvector/full-text.

## Step-by-Step Creation Process

1. **Analyze Request**: Map entity (e.g., "Order table with customer relation"). List fields (type, req/opt, defaults), relations (FKs/M2M), indexes (query patterns: unique on email, composite on user+date).
2. **Define Schema**:
   - ID first: `uuid id` or `int id` (primary).
   - Core fields: Typed, filtered, described.
   - Relations: Add `table` where linked.
   - Extras: `json metadata?` for flex; enum for states.
3. **Configure Auth/Desc**: `auth=true` for user data; table `description` if complex.
4. **Build Indexes**:
   - Primary: Always on ID.
   - Unique: On natural keys (email, slug).
   - Btree: On filters/sorts (stock asc, date desc).
   - Gin: On searchables (JSON, full-text).
   - Composites: Prefix common queries (user_id + timestamp).
5. **Validate Subtleties**: Ensure type matches relations (int to int PK); test filters (min:0 prevents negatives); no cycles in relations.
6. **Review**: Simulate inserts/queries; check for missing uniques/indexes.

## Common Patterns

- **Audit Fields**: `timestamp created_at?=now`, `timestamp updated_at?=now` (trigger auto-update).
- **Status Enums**: `enum status { values = ["active", "inactive", "pending"] }`.
- **M2M Relations**: `uuid[] tag_ids { table = "tags" }`; query via unnest/join.
- **Searchable JSON**: `json attributes { description = "Key-value props" }` + gin index.
- **Media**: `attachment profile_pic?` (stores file ref); sensitive if PII.
- **Partial Indexes**: App-enforced (e.g., unique on active emails via query where).
- **Vector Embeddings**: `vector embedding (dim:1536)` for semantic search.

## Best Practices

- **Naming**: Fields snake_case; consistent (e.g., `_id` suffixes for FKs).
- **Normalization**: 3NF; use relations over duplication.
- **Performance**: Index 80% of queries; limit composites to 3 fields; gin for >10% JSON ops.
- **Security**: `sensitive=true` on passwords/emails; `auth=true`
- **Extensibility**: Opt for `?` on future fields; json for variants.
- **Length**: <30 fields/table; split if > (e.g., user vs profile).
- **Enums**: Exhaustive values; no nulls (use separate bool?).
- **Defaults/Subtleties**: Avoid computed defaults (use functions); timestamps auto-UTC.

## References

- [Full examples](../docs/table_examples.md)
- [Syntax details](../docs/table_guideline.md)
