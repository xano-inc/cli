---
name: sql-lambda-fallbacks
description: Use this skill when XanoScript generation fails. Provides fallback patterns using raw SQL (db.direct_query) and JavaScript/TypeScript (api.lambda) which are well-known languages.
---

# SQL & Lambda Fallback Patterns

> **NOTE**: This skill contains advanced/extended patterns. For the **primary development guide**, see [sql-lambda-patterns](../sql-lambda-patterns/SKILL.md).

## Quick Reference: Primary Skill Summary

| Operation | Primary Tool |
|-----------|-------------|
| SELECT, DELETE, COUNT | `db.direct_query` (SQL) |
| INSERT | `db.add` (handles JSON) |
| UPDATE (partial) | `db.direct_query` with NULLIF |
| External APIs | `api.lambda` with fetch |
| Data transformation | `api.lambda` |

## When to Use This Skill

Use this for **advanced patterns** not covered in the primary skill:
- Complex SQL patterns (array operations, window functions)
- Edge cases and workarounds
- Debugging XanoScript failures

---

## Strategy Overview

```
+-------------------------------------------------------------------+
|                    DEVELOPMENT HIERARCHY                           |
+-------------------------------------------------------------------+
|  1. SQL (db.direct_query)  → SELECT, DELETE, COUNT                |
|  2. Native db.add          → INSERT (handles JSON automatically)   |
|  3. Lambda (api.lambda)    → Logic, validation, transformations   |
|  4. XanoScript control     → preconditions, variables ONLY        |
+-------------------------------------------------------------------+
```

---

# ⚠️ CRITICAL: XanoScript Format Requirements

## 1. Full Wrapper Format Required

XanoScript MUST use the complete wrapper format - partial scripts will fail with "unexpected '='" errors:

```xs
query <endpoint-name> verb=<GET|POST|PUT|PATCH|DELETE> {
  input {
    <type> <name>        // required input
    <type> <name>?       // optional input (with ? suffix)
  }
  stack {
    // Your logic here
  }
  response = $result_variable
}
```

## 2. Multiple Args: Use Repeated `arg =` Lines

For multiple SQL parameters, use **repeated `arg =` statements** (NOT arrays):

```xs
// ✅ CORRECT - Multiple arg lines
db.direct_query {
  sql = "SELECT * FROM x39_534 WHERE role = ? LIMIT ?"
  response_type = "list"
  arg = $input.role
  arg = $input.limit
} as $results

// ❌ WRONG - Array syntax fails
db.direct_query {
  sql = "SELECT * FROM x39_534 WHERE role = ? LIMIT ?"
  response_type = "list"
  arg = [$input.role, $input.limit]  // FAILS with "Invalid parameter count"
} as $results
```

## 3. Pattern Reference Table

| Pattern | Status | Example |
|---------|--------|---------|
| Full wrapper format | ✅ Required | `query foo verb=GET { input {} stack {} response = $x }` |
| Single `arg =` | ✅ Works | `arg = $input.id` |
| Multiple `arg =` lines | ✅ Works | `arg = $input.role` + `arg = $input.limit` |
| Array `arg = [...]` | ❌ FAILS | `arg = [$val1, $val2]` - Invalid parameter count |
| Native `db.query` | ✅ Works | Best for pagination/filtering |
| `api.lambda` | ✅ Works | Data transformation |

---

# PART 1: SQL (db.direct_query)

## Two Methods for Direct Queries

### Method 1: Standard (arg = with ? placeholders)

```xs
db.direct_query {
  sql = "SELECT * FROM x39_534 WHERE role = ? LIMIT ?"
  response_type = "list"
  arg = $input.role
  arg = $input.limit
} as $result
```

**Key Rules:**
- Use `?` placeholders for parameters
- Use **repeated `arg =` lines** for multiple params (NOT arrays)
- `response_type`: "list" or "single"

### Method 2: Template Engine (Twig syntax)

```xs
db.direct_query {
  sql = """
    SELECT id, name, email
    FROM x39_534
    WHERE role = '{{ $input.role }}'
    LIMIT {{ $input.limit | default(10) }}
  """
  parser = "template_engine"
  response_type = "list"
} as $result
```

**Key Rules:**
- Add `parser = "template_engine"` to enable Twig
- Use `{{ $input.varname }}` for input variables (note: `$` prefix required!)
- Use `{{ $var.varname }}` for stack variables
- Use `"""` triple quotes for multi-line SQL
- Supports Twig filters: `| default(10)`, `| trim`, etc.
- Supports conditionals: `{% if $input.role %}...{% endif %}`

**When to use Template Engine:**
- Complex dynamic SQL with conditionals
- Optional WHERE clauses
- Dynamic ORDER BY or field selection

### Table Name Prefixes

| Prefix | Format | Use Case |
|--------|--------|----------|
| `x` | `x{workspace}_{table}` | Read-only, flattened columns (e.g., `x39_534`) |
| `mvpw` | `mvpw{workspace}_{table}` | Raw data with id + xdo columns |
| Custom | `"view_alias"` | Custom database views |

### Common Rules for Both Methods
- Uses **PostgreSQL** SQL syntax
- `response_type`: Always specify - "list" or "single"

---

## SQL CRUD Patterns

### CREATE (INSERT)

#### Simple Insert
```xs
query "users" verb=POST {
  input {
    text name
    text email
    text password
    text role?
  }

  stack {
    db.direct_query {
      sql = "INSERT INTO user (name, email, password, role, created_at) VALUES (?, ?, ?, COALESCE(?, 'rep'), NOW()) RETURNING id, name, email, role, created_at"
      response_type = "single"
      arg = [$input.name, $input.email, $input.password, $input.role]
    } as $user
  }

  response = $user
}
```

#### Insert with Default Values
```xs
query "companies" verb=POST {
  input {
    text name
    text industry?
    text website?
    int owner_id
  }

  stack {
    db.direct_query {
      sql = """
        INSERT INTO company (name, industry, website, owner_id, created_at)
        VALUES (?, COALESCE(?, 'Other'), ?, ?, NOW())
        RETURNING *
      """
      response_type = "single"
      arg = [$input.name, $input.industry, $input.website, $input.owner_id]
    } as $company
  }

  response = $company
}
```

#### Upsert (Insert or Update)
```xs
query "upsert-contact" verb=POST {
  input {
    text email
    text first_name
    text last_name
    int company_id?
  }

  stack {
    db.direct_query {
      sql = """
        INSERT INTO contact (email, first_name, last_name, company_id, created_at)
        VALUES (?, ?, ?, ?, NOW())
        ON CONFLICT (email) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          company_id = COALESCE(EXCLUDED.company_id, contact.company_id),
          updated_at = NOW()
        RETURNING *
      """
      response_type = "single"
      arg = [$input.email, $input.first_name, $input.last_name, $input.company_id]
    } as $contact
  }

  response = $contact
}
```

### READ (SELECT)

#### List All (Excluding Sensitive Fields)
```xs
query "users" verb=GET {
  input {}

  stack {
    db.direct_query {
      sql = "SELECT id, name, email, role, phone, avatar, created_at FROM user ORDER BY created_at DESC"
      response_type = "list"
    } as $users
  }

  response = $users
}
```

#### Get by ID with 404
```xs
query "users/{user_id}" verb=GET {
  input {
    int user_id
  }

  stack {
    db.direct_query {
      sql = "SELECT id, name, email, role, phone, avatar, created_at FROM user WHERE id = ?"
      response_type = "single"
      arg = $input.user_id
    } as $user

    precondition ($user != null) {
      error_type = "notfound"
      error = "User not found"
    }
  }

  response = $user
}
```

#### Pagination
```xs
query "contacts" verb=GET {
  input {
    int page?
    int per_page?
  }

  stack {
    // Set defaults
    var $page_num {
      value = $input.page || 1
    }
    var $limit {
      value = $input.per_page || 20
    }
    var $offset {
      value = ($page_num - 1) * $limit
    }

    // Get total count
    db.direct_query {
      sql = "SELECT COUNT(*) as total FROM contact"
      response_type = "single"
    } as $count

    // Get paginated results
    db.direct_query {
      sql = "SELECT * FROM contact ORDER BY created_at DESC LIMIT ? OFFSET ?"
      response_type = "list"
      arg = [$limit, $offset]
    } as $contacts
  }

  response = {
    items: $contacts,
    pagination: {
      page: $page_num,
      per_page: $limit,
      total: $count.total,
      total_pages: ($count.total + $limit - 1) / $limit
    }
  }
}
```

#### Search with ILIKE
```xs
query "search/contacts" verb=GET {
  input {
    text q?
    text company_id?
  }

  stack {
    db.direct_query {
      sql = """
        SELECT c.*, co.name as company_name
        FROM contact c
        LEFT JOIN company co ON c.company_id = co.id
        WHERE (? IS NULL OR c.first_name ILIKE '%' || ? || '%' OR c.last_name ILIKE '%' || ? || '%' OR c.email ILIKE '%' || ? || '%')
        AND (? IS NULL OR c.company_id = ?::int)
        ORDER BY c.created_at DESC
        LIMIT 50
      """
      response_type = "list"
      arg = [$input.q, $input.q, $input.q, $input.q, $input.company_id, $input.company_id]
    } as $contacts
  }

  response = $contacts
}
```

#### Complex Filtering
```xs
query "deals" verb=GET {
  input {
    text stage?
    decimal min_amount?
    decimal max_amount?
    int owner_id?
    text sort_by?
    text sort_order?
  }

  stack {
    db.direct_query {
      sql = """
        SELECT d.*, c.name as company_name, u.name as owner_name
        FROM deal d
        LEFT JOIN company c ON d.company_id = c.id
        LEFT JOIN user u ON d.owner_id = u.id
        WHERE (? IS NULL OR d.stage = ?)
        AND (? IS NULL OR d.amount >= ?::decimal)
        AND (? IS NULL OR d.amount <= ?::decimal)
        AND (? IS NULL OR d.owner_id = ?::int)
        ORDER BY
          CASE WHEN ? = 'amount' AND ? = 'desc' THEN d.amount END DESC,
          CASE WHEN ? = 'amount' AND ? = 'asc' THEN d.amount END ASC,
          CASE WHEN ? = 'created_at' AND ? = 'desc' THEN d.created_at END DESC,
          d.created_at DESC
        LIMIT 100
      """
      response_type = "list"
      arg = [
        $input.stage, $input.stage,
        $input.min_amount, $input.min_amount,
        $input.max_amount, $input.max_amount,
        $input.owner_id, $input.owner_id,
        $input.sort_by, $input.sort_order,
        $input.sort_by, $input.sort_order,
        $input.sort_by, $input.sort_order
      ]
    } as $deals
  }

  response = $deals
}
```

### UPDATE (PATCH)

#### Update with Merge (Preserve Existing)
```xs
query "users/{user_id}" verb=PATCH {
  input {
    int user_id
    text name?
    text email?
    text phone?
    text role?
  }

  stack {
    // Get existing record
    db.direct_query {
      sql = "SELECT * FROM user WHERE id = ?"
      response_type = "single"
      arg = $input.user_id
    } as $existing

    precondition ($existing != null) {
      error_type = "notfound"
      error = "User not found"
    }

    // Update with COALESCE to preserve existing values
    db.direct_query {
      sql = """
        UPDATE user SET
          name = COALESCE(?, name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          role = COALESCE(?, role),
          updated_at = NOW()
        WHERE id = ?
        RETURNING id, name, email, role, phone, avatar, created_at, updated_at
      """
      response_type = "single"
      arg = [$input.name, $input.email, $input.phone, $input.role, $input.user_id]
    } as $user
  }

  response = $user
}
```

#### Bulk Update
```xs
query "deals/bulk-stage" verb=PATCH {
  input {
    json deal_ids
    text new_stage
  }

  stack {
    db.direct_query {
      sql = """
        UPDATE deal SET
          stage = ?,
          updated_at = NOW()
        WHERE id = ANY(?::int[])
        RETURNING id, name, stage
      """
      response_type = "list"
      arg = [$input.new_stage, $input.deal_ids]
    } as $updated
  }

  response = {
    updated_count: $updated.length,
    deals: $updated
  }
}
```

### DELETE

#### Soft Delete (Recommended)
```xs
query "contacts/{contact_id}" verb=DELETE {
  input {
    int contact_id
  }

  stack {
    db.direct_query {
      sql = "SELECT id FROM contact WHERE id = ? AND deleted_at IS NULL"
      response_type = "single"
      arg = $input.contact_id
    } as $existing

    precondition ($existing != null) {
      error_type = "notfound"
      error = "Contact not found"
    }

    db.direct_query {
      sql = "UPDATE contact SET deleted_at = NOW() WHERE id = ? RETURNING id"
      response_type = "single"
      arg = $input.contact_id
    } as $deleted
  }

  response = {success: true, deleted_id: $deleted.id}
}
```

#### Hard Delete
```xs
query "temp-records/{id}" verb=DELETE {
  input {
    int id
  }

  stack {
    db.direct_query {
      sql = "DELETE FROM temp_record WHERE id = ? RETURNING id"
      response_type = "single"
      arg = $input.id
    } as $deleted

    precondition ($deleted != null) {
      error_type = "notfound"
      error = "Record not found"
    }
  }

  response = {success: true}
}
```

---

## Advanced SQL Patterns

### JOINs

#### Multi-table JOIN
```xs
query "deal-details/{deal_id}" verb=GET {
  input {
    int deal_id
  }

  stack {
    db.direct_query {
      sql = """
        SELECT
          d.*,
          c.name as company_name,
          c.industry as company_industry,
          ct.first_name as contact_first_name,
          ct.last_name as contact_last_name,
          ct.email as contact_email,
          u.name as owner_name
        FROM deal d
        LEFT JOIN company c ON d.company_id = c.id
        LEFT JOIN contact ct ON d.contact_id = ct.id
        LEFT JOIN user u ON d.owner_id = u.id
        WHERE d.id = ?
      """
      response_type = "single"
      arg = $input.deal_id
    } as $deal

    precondition ($deal != null) {
      error_type = "notfound"
      error = "Deal not found"
    }
  }

  response = $deal
}
```

### Aggregations

#### Dashboard Stats
```xs
query "dashboard/stats" verb=GET {
  input {}

  stack {
    db.direct_query {
      sql = """
        SELECT
          (SELECT COUNT(*) FROM company) as total_companies,
          (SELECT COUNT(*) FROM contact) as total_contacts,
          (SELECT COUNT(*) FROM deal) as total_deals,
          (SELECT COUNT(*) FROM deal WHERE stage = 'won') as won_deals,
          (SELECT COALESCE(SUM(amount), 0) FROM deal WHERE stage = 'won') as total_revenue,
          (SELECT COALESCE(SUM(amount), 0) FROM deal WHERE stage NOT IN ('won', 'lost')) as pipeline_value
      """
      response_type = "single"
    } as $stats
  }

  response = $stats
}
```

#### Group By with Counts
```xs
query "deals/by-stage" verb=GET {
  input {}

  stack {
    db.direct_query {
      sql = """
        SELECT
          stage,
          COUNT(*) as count,
          COALESCE(SUM(amount), 0) as total_value,
          COALESCE(AVG(amount), 0) as avg_value
        FROM deal
        GROUP BY stage
        ORDER BY
          CASE stage
            WHEN 'lead' THEN 1
            WHEN 'qualified' THEN 2
            WHEN 'proposal' THEN 3
            WHEN 'negotiation' THEN 4
            WHEN 'won' THEN 5
            WHEN 'lost' THEN 6
          END
      """
      response_type = "list"
    } as $pipeline
  }

  response = $pipeline
}
```

### CTEs (Common Table Expressions)

#### Ranked Results
```xs
query "top-performers" verb=GET {
  input {
    int limit?
  }

  stack {
    db.direct_query {
      sql = """
        WITH deal_stats AS (
          SELECT
            owner_id,
            COUNT(*) as total_deals,
            SUM(CASE WHEN stage = 'won' THEN 1 ELSE 0 END) as won_deals,
            COALESCE(SUM(CASE WHEN stage = 'won' THEN amount ELSE 0 END), 0) as revenue
          FROM deal
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY owner_id
        )
        SELECT
          u.id,
          u.name,
          u.email,
          ds.total_deals,
          ds.won_deals,
          ds.revenue,
          CASE WHEN ds.total_deals > 0
            THEN ROUND(ds.won_deals::decimal / ds.total_deals * 100, 1)
            ELSE 0
          END as win_rate
        FROM deal_stats ds
        JOIN user u ON ds.owner_id = u.id
        ORDER BY ds.revenue DESC
        LIMIT COALESCE(?, 10)
      """
      response_type = "list"
      arg = $input.limit
    } as $performers
  }

  response = $performers
}
```

### Date Operations

#### Activity Timeline
```xs
query "activity/timeline" verb=GET {
  input {
    int days?
    int entity_id?
    text entity_type?
  }

  stack {
    db.direct_query {
      sql = """
        SELECT
          a.*,
          u.name as owner_name,
          DATE(a.created_at) as activity_date
        FROM activity a
        LEFT JOIN user u ON a.owner_id = u.id
        WHERE a.created_at >= NOW() - INTERVAL '1 day' * COALESCE(?, 30)
        AND (? IS NULL OR
          (? = 'company' AND a.company_id = ?::int) OR
          (? = 'contact' AND a.contact_id = ?::int) OR
          (? = 'deal' AND a.deal_id = ?::int)
        )
        ORDER BY a.created_at DESC
      """
      response_type = "list"
      arg = [
        $input.days,
        $input.entity_id,
        $input.entity_type, $input.entity_id,
        $input.entity_type, $input.entity_id,
        $input.entity_type, $input.entity_id
      ]
    } as $activities
  }

  response = $activities
}
```

### Subqueries

#### With Related Counts
```xs
query "companies-with-stats" verb=GET {
  input {}

  stack {
    db.direct_query {
      sql = """
        SELECT
          c.*,
          (SELECT COUNT(*) FROM contact WHERE company_id = c.id) as contact_count,
          (SELECT COUNT(*) FROM deal WHERE company_id = c.id) as deal_count,
          (SELECT COALESCE(SUM(amount), 0) FROM deal WHERE company_id = c.id AND stage = 'won') as total_revenue
        FROM company c
        ORDER BY total_revenue DESC
      """
      response_type = "list"
    } as $companies
  }

  response = $companies
}
```

---

# PART 2: JavaScript (api.lambda)

## Core Syntax

```xs
api.lambda {
  code = """
    // Full JavaScript/TypeScript support
    // Access: $input, $var, $auth, $env

    // MUST return a value
    return result;
  """
  timeout = 10  // seconds (max ~30)
} as $result
```

### Key Rules
- Full ES6+ JavaScript support
- Access stack context via `$input`, `$var`, `$auth`, `$env`
- **MUST return a value** - this becomes the captured variable
- Use `timeout` to prevent runaway operations
- Runs in sandboxed environment

---

## Lambda Data Processing Patterns

### Array Operations

#### Map - Transform Each Item
```xs
query "users/formatted" verb=GET {
  input {}

  stack {
    db.query "user" {
      return = {type: "list"}
    } as $users

    api.lambda {
      code = """
        return $var.users.items.map(user => ({
          id: user.id,
          display_name: user.name,
          email: user.email,
          role_label: user.role.charAt(0).toUpperCase() + user.role.slice(1),
          initials: user.name.split(' ').map(n => n[0]).join('').toUpperCase(),
          created: new Date(user.created_at).toLocaleDateString()
        }));
      """
      timeout = 10
    } as $formatted
  }

  response = $formatted
}
```

#### Filter - Remove Items
```xs
query "contacts/active" verb=GET {
  input {}

  stack {
    db.query "contact" {
      return = {type: "list"}
    } as $contacts

    api.lambda {
      code = """
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

        return $var.contacts.items.filter(contact => {
          // Has email and was active recently
          return contact.email &&
                 contact.last_activity_at &&
                 new Date(contact.last_activity_at).getTime() > thirtyDaysAgo;
        });
      """
      timeout = 10
    } as $active
  }

  response = $active
}
```

#### Reduce - Aggregate Values
```xs
query "deals/summary" verb=GET {
  input {}

  stack {
    db.query "deal" {
      return = {type: "list"}
    } as $deals

    api.lambda {
      code = """
        const deals = $var.deals.items;

        return deals.reduce((summary, deal) => {
          // Count by stage
          summary.by_stage[deal.stage] = (summary.by_stage[deal.stage] || 0) + 1;

          // Sum amounts
          summary.total_value += deal.amount || 0;
          if (deal.stage === 'won') {
            summary.won_value += deal.amount || 0;
          }

          // Track largest
          if (deal.amount > summary.largest_deal.amount) {
            summary.largest_deal = { id: deal.id, name: deal.name, amount: deal.amount };
          }

          return summary;
        }, {
          by_stage: {},
          total_value: 0,
          won_value: 0,
          largest_deal: { id: null, name: null, amount: 0 }
        });
      """
      timeout = 10
    } as $summary
  }

  response = $summary
}
```

#### Sort - Order Items
```xs
query "contacts/sorted" verb=GET {
  input {
    text sort_field?
    text sort_order?
  }

  stack {
    db.query "contact" {
      return = {type: "list"}
    } as $contacts

    api.lambda {
      code = """
        const field = $input.sort_field || 'created_at';
        const order = $input.sort_order || 'desc';

        return $var.contacts.items.sort((a, b) => {
          let valA = a[field];
          let valB = b[field];

          // Handle dates
          if (field.includes('_at') || field.includes('date')) {
            valA = new Date(valA).getTime();
            valB = new Date(valB).getTime();
          }

          // Handle strings
          if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
          }

          if (order === 'asc') {
            return valA > valB ? 1 : -1;
          } else {
            return valA < valB ? 1 : -1;
          }
        });
      """
      timeout = 10
    } as $sorted
  }

  response = $sorted
}
```

### Object Manipulation

#### Remove Sensitive Fields
```xs
query "users" verb=GET {
  input {}

  stack {
    db.query "user" {
      return = {type: "list"}
    } as $users

    api.lambda {
      code = """
        const sensitiveFields = ['password', 'api_key', 'secret', 'token'];

        return $var.users.items.map(user => {
          const safe = { ...user };
          sensitiveFields.forEach(field => delete safe[field]);
          return safe;
        });
      """
      timeout = 10
    } as $safe_users
  }

  response = $safe_users
}
```

#### Deep Merge Objects
```xs
query "settings/merge" verb=PATCH {
  input {
    json updates
  }

  stack {
    db.get "settings" {
      field_name = "id"
      field_value = 1
    } as $current

    api.lambda {
      code = """
        function deepMerge(target, source) {
          const result = { ...target };

          for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
              result[key] = deepMerge(result[key] || {}, source[key]);
            } else if (source[key] !== undefined) {
              result[key] = source[key];
            }
          }

          return result;
        }

        return deepMerge($var.current.data || {}, $input.updates);
      """
      timeout = 10
    } as $merged
  }

  response = $merged
}
```

### String Operations

#### Search and Highlight
```xs
query "search/highlight" verb=GET {
  input {
    text q
  }

  stack {
    db.query "contact" {
      return = {type: "list"}
    } as $contacts

    api.lambda {
      code = """
        const query = $input.q.toLowerCase();

        function highlight(text, query) {
          if (!text) return text;
          const regex = new RegExp('(' + query.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + ')', 'gi');
          return text.replace(regex, '<mark>$1</mark>');
        }

        return $var.contacts.items
          .filter(c => {
            const searchable = [c.first_name, c.last_name, c.email, c.title].join(' ').toLowerCase();
            return searchable.includes(query);
          })
          .map(c => ({
            ...c,
            _highlighted: {
              first_name: highlight(c.first_name, query),
              last_name: highlight(c.last_name, query),
              email: highlight(c.email, query)
            }
          }));
      """
      timeout = 10
    } as $results
  }

  response = $results
}
```

### Date Operations

#### Format Dates
```xs
query "activities/formatted" verb=GET {
  input {}

  stack {
    db.query "activity" {
      return = {type: "list"}
    } as $activities

    api.lambda {
      code = """
        function formatDate(dateStr) {
          const date = new Date(dateStr);
          const now = new Date();
          const diff = now - date;

          // Within last hour
          if (diff < 3600000) {
            const mins = Math.floor(diff / 60000);
            return mins + ' minute' + (mins !== 1 ? 's' : '') + ' ago';
          }

          // Within last day
          if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return hours + ' hour' + (hours !== 1 ? 's' : '') + ' ago';
          }

          // Within last week
          if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return days + ' day' + (days !== 1 ? 's' : '') + ' ago';
          }

          // Otherwise, format as date
          return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }

        return $var.activities.items.map(a => ({
          ...a,
          formatted_date: formatDate(a.created_at),
          is_overdue: a.due_date && new Date(a.due_date) < new Date()
        }));
      """
      timeout = 10
    } as $formatted
  }

  response = $formatted
}
```

### Validation

#### Input Validation
```xs
query "contacts" verb=POST {
  input {
    text email
    text first_name
    text last_name?
    text phone?
  }

  stack {
    api.lambda {
      code = """
        const errors = [];

        // Email validation
        const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
        if (!$input.email || !emailRegex.test($input.email)) {
          errors.push({ field: 'email', message: 'Valid email is required' });
        }

        // Name validation
        if (!$input.first_name || $input.first_name.trim().length < 2) {
          errors.push({ field: 'first_name', message: 'First name must be at least 2 characters' });
        }

        // Phone validation (if provided)
        if ($input.phone) {
          const phoneRegex = /^[\\d\\s\\-\\+\\(\\)]{10,}$/;
          if (!phoneRegex.test($input.phone)) {
            errors.push({ field: 'phone', message: 'Invalid phone number format' });
          }
        }

        return { valid: errors.length === 0, errors };
      """
      timeout = 5
    } as $validation

    precondition ($validation.valid) {
      error_type = "validation"
      error = $validation.errors
    }

    db.add "contact" {
      data = {
        email: $input.email,
        first_name: $input.first_name,
        last_name: $input.last_name,
        phone: $input.phone
      }
    } as $contact
  }

  response = $contact
}
```

### Error Handling

#### Try-Catch Pattern
```xs
query "process-data" verb=POST {
  input {
    json data
  }

  stack {
    api.lambda {
      code = """
        try {
          const data = $input.data;

          // Validate required structure
          if (!data || typeof data !== 'object') {
            throw new Error('Data must be an object');
          }

          // Process the data
          const result = {
            processed: true,
            item_count: Array.isArray(data.items) ? data.items.length : 0,
            total: Array.isArray(data.items)
              ? data.items.reduce((sum, i) => sum + (i.value || 0), 0)
              : 0
          };

          return { success: true, result };

        } catch (error) {
          return {
            success: false,
            error: error.message,
            stack: error.stack
          };
        }
      """
      timeout = 10
    } as $result

    precondition ($result.success) {
      error_type = "processing"
      error = $result.error
    }
  }

  response = $result.result
}
```

### Building Dynamic Responses

#### Conditional Fields
```xs
query "users/{user_id}" verb=GET {
  input {
    int user_id
    bool include_stats?
  }

  stack {
    db.get "user" {
      field_name = "id"
      field_value = $input.user_id
    } as $user

    precondition ($user != null) {
      error_type = "notfound"
      error = "User not found"
    }

    db.direct_query {
      sql = """
        SELECT
          COUNT(*) as deal_count,
          COALESCE(SUM(CASE WHEN stage = 'won' THEN amount ELSE 0 END), 0) as revenue
        FROM deal WHERE owner_id = ?
      """
      response_type = "single"
      arg = $input.user_id
    } as $stats

    api.lambda {
      code = """
        const user = $var.user;
        delete user.password;

        const response = {
          ...user,
          display_name: user.name,
          initials: user.name.split(' ').map(n => n[0]).join('').toUpperCase()
        };

        // Add stats if requested
        if ($input.include_stats) {
          response.stats = {
            total_deals: $var.stats.deal_count,
            total_revenue: $var.stats.revenue
          };
        }

        return response;
      """
      timeout = 10
    } as $response
  }

  response = $response
}
```

---

# PART 3: Combined SQL + Lambda Patterns

## Full CRUD API Example

### List with Transformation
```xs
query "contacts" verb=GET {
  input {
    int page?
    int per_page?
    text search?
  }

  stack {
    var $limit { value = $input.per_page || 20 }
    var $offset { value = (($input.page || 1) - 1) * $limit }

    // SQL for efficient querying with JOINs
    db.direct_query {
      sql = """
        SELECT
          c.*,
          co.name as company_name,
          u.name as owner_name,
          COUNT(*) OVER() as total_count
        FROM contact c
        LEFT JOIN company co ON c.company_id = co.id
        LEFT JOIN user u ON c.owner_id = u.id
        WHERE c.deleted_at IS NULL
        AND (? IS NULL OR c.first_name ILIKE '%' || ? || '%' OR c.last_name ILIKE '%' || ? || '%' OR c.email ILIKE '%' || ? || '%')
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      """
      response_type = "list"
      arg = [$input.search, $input.search, $input.search, $input.search, $limit, $offset]
    } as $contacts

    // Lambda for transformation
    api.lambda {
      code = """
        const contacts = $var.contacts;
        const total = contacts.length > 0 ? contacts[0].total_count : 0;

        const items = contacts.map(c => {
          const { total_count, ...contact } = c;
          return {
            ...contact,
            full_name: [c.first_name, c.last_name].filter(Boolean).join(' '),
            avatar_url: c.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.first_name)
          };
        });

        return {
          items,
          meta: {
            page: $input.page || 1,
            per_page: $var.limit,
            total: parseInt(total),
            total_pages: Math.ceil(total / $var.limit)
          }
        };
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

### Dashboard Analytics
```xs
query "dashboard" verb=GET {
  input {
    int user_id?
  }

  stack {
    // SQL for heavy aggregation
    db.direct_query {
      sql = """
        WITH date_range AS (
          SELECT
            NOW() - INTERVAL '30 days' as start_date,
            NOW() as end_date
        ),
        deal_metrics AS (
          SELECT
            COUNT(*) as total_deals,
            COUNT(*) FILTER (WHERE stage = 'won') as won_deals,
            COUNT(*) FILTER (WHERE stage = 'lost') as lost_deals,
            COALESCE(SUM(amount) FILTER (WHERE stage = 'won'), 0) as revenue,
            COALESCE(SUM(amount) FILTER (WHERE stage NOT IN ('won', 'lost')), 0) as pipeline_value,
            COALESCE(AVG(amount) FILTER (WHERE stage = 'won'), 0) as avg_deal_size
          FROM deal, date_range
          WHERE (? IS NULL OR owner_id = ?)
          AND created_at >= date_range.start_date
        ),
        activity_metrics AS (
          SELECT
            COUNT(*) as total_activities,
            COUNT(*) FILTER (WHERE type = 'call') as calls,
            COUNT(*) FILTER (WHERE type = 'email') as emails,
            COUNT(*) FILTER (WHERE type = 'meeting') as meetings
          FROM activity, date_range
          WHERE (? IS NULL OR owner_id = ?)
          AND created_at >= date_range.start_date
        ),
        recent_deals AS (
          SELECT json_agg(row_to_json(d)) as deals
          FROM (
            SELECT id, name, amount, stage, created_at
            FROM deal
            WHERE (? IS NULL OR owner_id = ?)
            ORDER BY created_at DESC
            LIMIT 5
          ) d
        )
        SELECT
          dm.*,
          am.*,
          rd.deals as recent_deals
        FROM deal_metrics dm, activity_metrics am, recent_deals rd
      """
      response_type = "single"
      arg = [
        $input.user_id, $input.user_id,
        $input.user_id, $input.user_id,
        $input.user_id, $input.user_id
      ]
    } as $metrics

    // Lambda for formatting and calculations
    api.lambda {
      code = """
        const m = $var.metrics;

        const winRate = m.total_deals > 0
          ? ((m.won_deals / m.total_deals) * 100).toFixed(1)
          : 0;

        return {
          summary: {
            total_deals: m.total_deals,
            won_deals: m.won_deals,
            lost_deals: m.lost_deals,
            win_rate: parseFloat(winRate) + '%',
            revenue: {
              value: m.revenue,
              formatted: '$' + m.revenue.toLocaleString()
            },
            pipeline: {
              value: m.pipeline_value,
              formatted: '$' + m.pipeline_value.toLocaleString()
            },
            avg_deal_size: {
              value: Math.round(m.avg_deal_size),
              formatted: '$' + Math.round(m.avg_deal_size).toLocaleString()
            }
          },
          activity: {
            total: m.total_activities,
            by_type: {
              calls: m.calls,
              emails: m.emails,
              meetings: m.meetings
            }
          },
          recent_deals: m.recent_deals || []
        };
      """
      timeout = 10
    } as $dashboard
  }

  response = $dashboard
}
```

### Bulk Import
```xs
query "contacts/import" verb=POST {
  input {
    json contacts
    int owner_id
  }

  stack {
    // Lambda for validation and preparation
    api.lambda {
      code = """
        const contacts = $input.contacts;
        const ownerId = $input.owner_id;

        if (!Array.isArray(contacts)) {
          return { valid: false, error: 'contacts must be an array' };
        }

        if (contacts.length > 100) {
          return { valid: false, error: 'Maximum 100 contacts per import' };
        }

        const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
        const errors = [];
        const validContacts = [];

        contacts.forEach((c, i) => {
          if (!c.email || !emailRegex.test(c.email)) {
            errors.push({ row: i + 1, field: 'email', message: 'Invalid email' });
            return;
          }
          if (!c.first_name) {
            errors.push({ row: i + 1, field: 'first_name', message: 'Required' });
            return;
          }

          validContacts.push({
            email: c.email.toLowerCase().trim(),
            first_name: c.first_name.trim(),
            last_name: (c.last_name || '').trim(),
            phone: (c.phone || '').trim(),
            title: (c.title || '').trim(),
            owner_id: ownerId
          });
        });

        return {
          valid: errors.length === 0,
          errors,
          contacts: validContacts,
          values_sql: validContacts.map(c =>
            "('" + [c.email, c.first_name, c.last_name, c.phone, c.title, c.owner_id].join("','") + "', NOW())"
          ).join(',')
        };
      """
      timeout = 15
    } as $prepared

    precondition ($prepared.valid) {
      error_type = "validation"
      error = $prepared.errors
    }

    // SQL for efficient bulk insert
    db.direct_query {
      sql = """
        INSERT INTO contact (email, first_name, last_name, phone, title, owner_id, created_at)
        SELECT * FROM jsonb_to_recordset(?::jsonb) AS t(
          email text,
          first_name text,
          last_name text,
          phone text,
          title text,
          owner_id int,
          created_at timestamp
        )
        ON CONFLICT (email) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          updated_at = NOW()
        RETURNING id, email
      """
      response_type = "list"
      arg = $prepared.contacts
    } as $imported
  }

  response = {
    success: true,
    imported_count: $imported.length,
    contacts: $imported
  }
}
```

---

## Decision Matrix: SQL vs Lambda

| Task | Use SQL | Use Lambda | Use Both |
|------|---------|------------|----------|
| Simple CRUD | * | | |
| Complex JOINs | * | | |
| Aggregations (COUNT, SUM) | * | | |
| Pagination | * | | |
| Search with ILIKE | * | | |
| Remove sensitive fields | | * | |
| Transform response format | | * | |
| Input validation | | * | |
| Calculate derived values | | * | |
| Format dates/numbers | | * | |
| Complex business logic | | * | |
| Dashboard/analytics | | | * |
| Bulk operations | | | * |
| Search with highlighting | | | * |

---

## Common Gotchas

### SQL
1. **Always use `?` placeholders** - Never concatenate user input
2. **Specify `response_type`** - "list" or "single"
3. **Array params need `::type[]`** - e.g., `ANY(?::int[])`
4. **NULL handling** - Use `COALESCE(?, default)` for optional params
5. **Case sensitivity** - Use `ILIKE` for case-insensitive search

### ⚠️ CRITICAL: COALESCE + Empty Strings

**Empty strings (`''`) are NOT NULL!** `COALESCE` only falls back when the value is `NULL`.

```sql
-- ❌ WRONG: Empty string replaces existing value!
UPDATE table SET name = COALESCE(?, name) WHERE id = ?
-- If ? = '' (empty string), name becomes '' not the existing value

-- ✅ CORRECT: Use NULLIF to convert empty strings to NULL
UPDATE table SET name = COALESCE(NULLIF(?, ''), name) WHERE id = ?
-- NULLIF('', '') returns NULL, then COALESCE falls back to existing name
```

**Why this matters:**
- Xano input fields default to empty string `''` when not provided
- Without NULLIF, PATCH endpoints will blank out fields not included in the request

### ⚠️ CRITICAL: Foreign Key Defaults

**Integer fields default to `0`, which may violate FK constraints!**

```
Error: SQL Error: 42804, DATATYPE MISMATCH
```

This often means a foreign key field (e.g., `owner_id`) received `0` but no record with `id=0` exists.

**Solutions:**
1. Make FK fields nullable in the table schema
2. Always provide a valid FK value in requests
3. Use NULLIF to convert 0 to NULL: `NULLIF(?::int, 0)`

### Lambda
1. **Must return a value** - Lambda without return gives undefined
2. **Access pattern** - Use `$var.name` not `$name` for stack variables
3. **Timeout** - Always set, default to 10 seconds
4. **JSON input** - `$input.data` is already parsed, don't JSON.parse()
5. **No async/await** - Lambda is synchronous only

### Combined
1. **Order matters** - SQL runs first, Lambda uses SQL results via `$var`
2. **Type conversion** - SQL returns strings for numbers sometimes, use `parseInt()`
3. **Null checks** - Always check `$var.result` exists before accessing properties

### Debugging: Viewing XanoScript

To see the actual XanoScript deployed on an endpoint, pass `include_xanoscript: true` in context:

```
xano_execute intent="Get API endpoint 1681 details" context={"apigroup_id": 210, "api_id": 1681, "include_xanoscript": true}
```

This returns the `xanoscript.value` field showing the deployed code. Default is `false` to save tokens.

---

## Related Skills
- [xanoscript-debugging](../xanoscript-debugging/SKILL.md) - Error recovery
- [xanoscript-patterns](../xanoscript-patterns/SKILL.md) - Native XanoScript syntax
- [api-testing](../api-testing/SKILL.md) - Testing endpoints
