# XanoScript Functions Skill Library - Task Overview

## Project Goal

Create a comprehensive, validated skill library for all XanoScript functions. Each skill will be tested with real API examples using the Xano MCP to ensure documentation accuracy.

## Scope

**Total Functions to Document:** 97 (excluding cloud.* functions)

**Exclusions:**
- All `cloud.*` functions (AWS, Azure, Google, Algolia, Elasticsearch, OpenSearch)
- External database connectors (`db.external.*`)

## Function Categories

### Core Constructs (7)
| Function | Status | API Group |
|----------|--------|-----------|
| stack | ✅ complete | xs-stack (226) |
| input | ✅ complete | xs-input (227) |
| schema | pending | - |
| response | ✅ complete | xs-response (228) |
| schedule | pending | - |
| table | pending | - |
| query | ✅ complete | xs-query (229) |

### Function & Task Definitions (3)
| Function | Status | API Group |
|----------|--------|-----------|
| function | pending | - |
| task | pending | - |
| function.run | pending | - |

### API Functions (4)
| Function | Status | API Group |
|----------|--------|-----------|
| api.lambda | pending | - |
| api.request | ✅ complete | xs-api-request (270) |
| api.stream | pending | - |
| api.realtime_event | pending | - |

### Variables (2)
| Function | Status | API Group |
|----------|--------|-----------|
| var | ✅ complete | xs-var (224) |
| var.update | ✅ complete | xs-var-update (225) |

### Array Functions (17)
| Function | Status | API Group |
|----------|--------|-----------|
| array.find | pending | - |
| array.push | pending | - |
| array.unshift | pending | - |
| array.shift | pending | - |
| array.pop | pending | - |
| array.merge | pending | - |
| array.map | pending | - |
| array.partition | pending | - |
| array.group_by | pending | - |
| array.union | pending | - |
| array.difference | pending | - |
| array.intersection | pending | - |
| array.find_index | pending | - |
| array.has | pending | - |
| array.every | pending | - |
| array.filter | pending | - |
| array.filter_count | pending | - |

### Control Flow (6)
| Function | Status | API Group |
|----------|--------|-----------|
| conditional | ✅ complete | xs-conditional (230) |
| continue | ✅ complete | xs-continue (235) |
| for | ✅ complete | xs-for (231) |
| foreach | ✅ complete | xs-foreach (232) |
| while | ✅ complete | xs-while (233) |
| switch | ✅ complete | xs-switch (234) |

### Database Functions (12)
| Function | Status | API Group |
|----------|--------|-----------|
| db.query | ✅ complete | xs-db-query (236) |
| db.get | ✅ complete | xs-db-get (237) |
| db.add | ✅ complete | xs-db-add (238) |
| db.edit | ✅ complete | xs-db-edit (239) |
| db.del | ✅ complete | xs-db-del (240) |
| db.has | ✅ complete | xs-db-has (241) |
| db.add_or_edit | ✅ complete | xs-db-add-or-edit (242) |
| db.direct_query | ✅ complete | xs-db-direct-query (243) |
| db.schema | pending | - |
| db.set_datasource | pending | - |
| db.transaction | pending | - |
| db.truncate | pending | - |

### Math Functions (7)
| Function | Status | API Group |
|----------|--------|-----------|
| math.add | pending | - |
| math.sub | pending | - |
| math.mul | pending | - |
| math.div | pending | - |
| math.bitwise.and | pending | - |
| math.bitwise.or | pending | - |
| math.bitwise.xor | pending | - |

### Redis Functions (14)
| Function | Status | API Group |
|----------|--------|-----------|
| redis.set | pending | - |
| redis.get | pending | - |
| redis.del | pending | - |
| redis.has | pending | - |
| redis.push | pending | - |
| redis.pop | pending | - |
| redis.shift | pending | - |
| redis.unshift | pending | - |
| redis.incr | pending | - |
| redis.decr | pending | - |
| redis.range | pending | - |
| redis.count | pending | - |
| redis.keys | pending | - |
| redis.remove | pending | - |
| redis.ratelimit | pending | - |

### Object Functions (3)
| Function | Status | API Group |
|----------|--------|-----------|
| object.keys | pending | - |
| object.values | pending | - |
| object.entries | pending | - |

### Security Functions (13)
| Function | Status | API Group |
|----------|--------|-----------|
| security.create_auth_token | pending | - |
| security.create_uuid | pending | - |
| security.encrypt | pending | - |
| security.decrypt | pending | - |
| security.create_curve_key | pending | - |
| security.random_bytes | pending | - |
| security.create_password | pending | - |
| security.create_secret_key | pending | - |
| security.random_number | pending | - |
| security.check_password | pending | - |
| security.jwe_encode | pending | - |
| security.jwe_decode | pending | - |
| security.jws_encode | pending | - |
| security.jws_decode | pending | - |

### Storage Functions (6)
| Function | Status | API Group |
|----------|--------|-----------|
| storage.create_file_resource | pending | - |
| storage.sign_private_url | pending | - |
| storage.create_attachment | pending | - |
| storage.delete_file | pending | - |
| storage.read_file_resource | pending | - |
| storage.create_image | pending | - |

### Stream Functions (3)
| Function | Status | API Group |
|----------|--------|-----------|
| stream.from_csv | pending | - |
| stream.from_jsonl | pending | - |
| stream.from_request | pending | - |

### Text Functions (10)
| Function | Status | API Group |
|----------|--------|-----------|
| text.starts_with | pending | - |
| text.ends_with | pending | - |
| text.istarts_with | pending | - |
| text.iends_with | pending | - |
| text.contains | pending | - |
| text.icontains | pending | - |
| text.append | pending | - |
| text.prepend | pending | - |
| text.trim | pending | - |
| text.ltrim | pending | - |
| text.rtrim | pending | - |

### Utility Functions (8)
| Function | Status | API Group |
|----------|--------|-----------|
| util.send_email | pending | - |
| util.template_engine | pending | - |
| util.set_header | pending | - |
| util.get_env | pending | - |
| util.get_all_input | pending | - |
| util.get_input | pending | - |
| util.sleep | pending | - |
| util.ip_lookup | pending | - |
| util.geo_distance | pending | - |

### Error Handling (4)
| Function | Status | API Group |
|----------|--------|-----------|
| precondition | pending | - |
| return | pending | - |
| throw | pending | - |
| try_catch | pending | - |

### Debug (1)
| Function | Status | API Group |
|----------|--------|-----------|
| debug.stop | pending | - |

### Grouping (1)
| Function | Status | API Group |
|----------|--------|-----------|
| group | pending | - |

### Zip Functions (4)
| Function | Status | API Group |
|----------|--------|-----------|
| zip.create_archive | pending | - |
| zip.add_to_archive | pending | - |
| zip.delete_from_archive | pending | - |
| zip.extract | pending | - |
| zip.view_contents | pending | - |

---

## Skill Creation Process

**Template:** See [SKILL-TEMPLATE.md](./SKILL-TEMPLATE.md) for the full template.

### Skill File Requirements (from Claude Code docs)

1. **Required frontmatter fields:**
   - `name` - lowercase letters, numbers, hyphens only (max 64 chars)
   - `description` - what it does and when to use it (max 1024 chars)

2. **Description is critical** - Claude uses it to decide when to apply the skill
   - Include specific trigger keywords
   - Answer: What does this do? When should Claude use it?

3. **Keep under 500 lines** - Use progressive disclosure for longer content

### Directory Structure

```
.claude/skills/functions/{function-name}/
├── SKILL.md          # Required - main skill file
├── EXAMPLES.md       # Optional - overflow examples
└── GOTCHAS.md        # Optional - edge cases
```

### Naming Conventions

Use hyphens for nested functions:
- `var` → `var/`
- `var.update` → `var-update/`
- `array.find` → `array-find/`
- `db.direct_query` → `db-direct-query/`

### Step-by-Step Process

#### 1. Create Skill Folder
```bash
mkdir -p .claude/skills/functions/{function-name}
```

#### 2. Create API Group
```
xano_execute: "Create API group 'xs-{function}' with description 'XanoScript {function} examples'"
```

#### 3. Create 5 Test APIs
| Endpoint | Purpose |
|----------|---------|
| `/example-1-basic` | Simplest working example |
| `/example-2-params` | Different parameters/options |
| `/example-3-edge` | Empty values, null handling |
| `/example-4-practical` | Real-world scenario |
| `/example-5-combined` | Used with other functions |

#### 4. Test Each Endpoint
Actually call the API and verify it works!

#### 5. Document in SKILL.md
- Function signature and parameters
- All 5 working examples with tested code
- Edge cases and gotchas discovered
- Link to test API group

#### 6. Update Task Status
1. Mark function as complete in this overview
2. Add to Critical Findings if applicable

---

## Critical Findings

This section is updated as we document functions. Use these patterns and avoid these pitfalls.

### ⚠️ XanoScript Deployment via API

**CRITICAL:** When deploying XanoScript to Xano endpoints via the API:

```
✅ CORRECT:
   Content-Type: text/x-xanoscript
   Body: Raw XanoScript code

❌ WRONG:
   Content-Type: application/json
   Body: { "xanoscript": "code here" }
```

The MCP router may not always use the correct content type. Verify endpoints work by testing them directly.

### XanoScript Syntax Notes
- Variables must be prefixed with `$`
- Backticks are used for expressions: `` `$a + $b` ``
- Filters use pipe syntax: `$value|filter`
- The `as $result` pattern stores function output
- **Query blocks require `input {}`** - Even empty, it's mandatory or you get "Missing block: input"

### Common Gotchas

1. **Empty input block required** - Every query needs `input {}` even with no parameters
2. **Variable names need `$`** - `var greeting` is wrong, `var $greeting` is correct
3. **Object syntax uses colons** - `{name: "value"}` not `{"name": "value"}`
4. **api.request response wrapper required** - Direct `response = $api_response` may return null. Always wrap in a variable:
   ```xs
   api.request { ... } as $api_response
   var $result { value = $api_response }
   response = $result
   ```

### Working Patterns

**Basic variable declaration and response:**
```xs
query /example verb=GET {
  input {}
  stack {
    var $result {
      value = "Hello"
    }
  }
  response = $result
}
```

---

## Progress Tracking

| Category | Total | Complete | In Progress |
|----------|-------|----------|-------------|
| Core Constructs | 7 | 4 | 0 |
| Function & Task | 3 | 0 | 0 |
| API Functions | 4 | 1 | 0 |
| Variables | 2 | 2 | 0 |
| Array Functions | 17 | 0 | 0 |
| Control Flow | 6 | 6 | 0 |
| Database Functions | 12 | 8 | 0 |
| Math Functions | 7 | 0 | 0 |
| Redis Functions | 15 | 0 | 0 |
| Object Functions | 3 | 0 | 0 |
| Security Functions | 14 | 0 | 0 |
| Storage Functions | 6 | 0 | 0 |
| Stream Functions | 3 | 0 | 0 |
| Text Functions | 11 | 0 | 0 |
| Utility Functions | 9 | 0 | 0 |
| Error Handling | 4 | 0 | 0 |
| Debug | 1 | 0 | 0 |
| Grouping | 1 | 0 | 0 |
| Zip Functions | 5 | 0 | 0 |
| **TOTAL** | **~130** | **21** | **0** |

---

## Recommended Build Order

Start with foundational functions that are used within other functions:

1. **Phase 1: Variables & Core** - var, var.update, stack, input, response
2. **Phase 2: Control Flow** - conditional, for, foreach, while, switch
3. **Phase 3: Database** - db.query, db.get, db.add, db.edit, db.del
4. **Phase 4: Arrays** - array.push, array.filter, array.map, etc.
5. **Phase 5: Math & Text** - math.add, text.contains, etc.
6. **Phase 6: Advanced** - security.*, redis.*, storage.*, etc.

---

## API Group Naming Convention

```
xs-{category}-{function}
```

Examples:
- `xs-array-find` - Array find function tests
- `xs-db-query` - Database query function tests
- `xs-security-encrypt` - Security encrypt function tests

This makes it easy to filter and find test endpoints in the Xano dashboard.
