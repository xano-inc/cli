# Claude Code Skills

Skills are modular instruction sets that Claude Code auto-detects based on the task context. Each skill has a `SKILL.md` file with YAML frontmatter containing `name` and `description` fields.

## Primary Skills (Use These First)

| Skill | Description | Use When |
|-------|-------------|----------|
| [crud-templates](./crud-templates/SKILL.md) | **CRUD & Search templates** | Creating standard CRUD endpoints for any table |
| [sql-lambda-patterns](./sql-lambda-patterns/SKILL.md) | **PRIMARY** - SQL & Lambda development | Writing ANY API endpoint logic |
| [api-testing](./api-testing/SKILL.md) | Testing & validation patterns | Verifying APIs, adding validations |
| [task-management](./task-management/SKILL.md) | Task tracking system | Managing development workflow |
| [effective-intents](./effective-intents/SKILL.md) | Writing MCP intents | Creating tables, columns, APIs via MCP |

## Supporting Skills

| Skill | Description | Use When |
|-------|-------------|----------|
| [table-patterns](./table-patterns/SKILL.md) | Database schema design | Designing tables and relationships |
| [index-management](./index-management/SKILL.md) | Database index operations | Creating/managing indexes for performance |
| [data-generation](./data-generation/SKILL.md) | Creating test data | Seeding databases |
| [onboarding](./onboarding/SKILL.md) | MCP System setup | First-time workspace setup |

## Reference Skills (Legacy)

| Skill | Description | Use When |
|-------|-------------|----------|
| [xanoscript-reference](./xanoscript-reference/SKILL.md) | XanoScript DSL reference | Only for input definitions, preconditions |
| [xanoscript-debugging](./xanoscript-debugging/SKILL.md) | XanoScript error recovery | When XanoScript control flow fails |
| [sql-lambda-fallbacks](./sql-lambda-fallbacks/SKILL.md) | Extended SQL/Lambda patterns | Additional advanced patterns |

## Placeholder Skills (Under Development)

| Skill | Description | Status |
|-------|-------------|--------|
| [file-management](./file-management/SKILL.md) | File upload/storage operations | Placeholder |

---

## Development Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT HIERARCHY                         │
├─────────────────────────────────────────────────────────────────┤
│  1. SQL (db.direct_query)  → SELECT, DELETE, COUNT, aggregations │
│  2. Native db.add          → INSERT (handles JSON automatically) │
│  3. Lambda (api.lambda)    → Logic, validation, transformations  │
│  4. XanoScript control     → preconditions, variables ONLY       │
└─────────────────────────────────────────────────────────────────┘
```

**SQL for reads, db.add for inserts, Lambda for logic. XanoScript is only for control flow.**

### Quick Reference: When to Use What

| Operation | Tool | Why |
|-----------|------|-----|
| SELECT, JOIN, CTE | `db.direct_query` | Full SQL power |
| INSERT single | `db.add` | Handles JSON columns automatically |
| INSERT multiple | `foreach + db.add` | Loop insertion with JSON support |
| Upsert | `db.add_or_edit` | Add if not exists, update if exists |
| Bulk UPDATE | `db.bulk.update` | Update many records at once |
| Bulk PATCH | `db.bulk.patch` | Partial update many records |
| UPDATE partial (single) | `db.direct_query` (NULLIF pattern) | Preserves existing values |
| DELETE | `db.direct_query` | Simple and reliable |
| Create index | `xano_execute` intent | See [index-management](./index-management/SKILL.md) |
| External API calls | `api.lambda` with fetch | Full async support |
| Data transformation | `api.lambda` | JavaScript is powerful |
| Error handling | `precondition` | XanoScript control flow |

---

## Skill Format

Each skill follows this structure:

```markdown
---
name: skill-name
description: When to use this skill (auto-detection trigger)
---

# Skill Title

## When to Use
[Detailed use cases]

## Patterns
[Working patterns and examples]

## Common Mistakes
[What to avoid]

## Related Skills
[Links to related skills]
```

## Adding New Skills

1. Create a directory: `.claude/skills/[skill-name]/`
2. Create `SKILL.md` with YAML frontmatter
3. Add to this index
4. Test that Claude Code auto-detects it

## Legacy Skills

The `dev-workflow/skills/` directory contains the original skill files. These have been migrated to the new format in `.claude/skills/` with proper YAML frontmatter for auto-detection.
