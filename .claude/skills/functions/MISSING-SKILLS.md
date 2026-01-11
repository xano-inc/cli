# Missing XanoScript Function Skills

**Last Updated:** 2026-01-11
**Total Missing:** ~47 functions
**Total Complete:** 83 functions

---

## Tier 1: CRITICAL (Used in almost every app)

| Function | Priority | Why Critical | Status |
|----------|----------|--------------|--------|
| `precondition` | P0 | 404 handling, validation - used in every API | pending |
| `try_catch` | P0 | Error handling - production requirement | pending |
| `throw` | P0 | Custom error throwing | pending |
| `return` | P0 | Early exit from functions | pending |
| `api.lambda` | P0 | Run JS/TS code - primary logic method | pending |
| `function` | P0 | Define reusable functions | pending |
| `function.run` | P0 | Call custom functions | pending |

---

## Tier 2: HIGH (Common use cases)

| Function | Priority | Use Case | Status |
|----------|----------|----------|--------|
| `object.keys` | P1 | Get object property names | pending |
| `object.values` | P1 | Get object values | pending |
| `object.entries` | P1 | Iterate over objects | pending |
| `group` | P1 | Organize/collapse code blocks in UI | pending |
| `debug.stop` | P1 | Debugging during development | pending |
| `util.get_all_input` | P1 | Get all request input at once | pending |

---

## Tier 3: MEDIUM (Specific features)

### Storage Functions
| Function | Use Case | Status |
|----------|----------|--------|
| `storage.create_file_resource` | Create file from data | pending |
| `storage.create_attachment` | Handle file attachments | pending |
| `storage.create_image` | Image processing/storage | pending |
| `storage.read_file_resource` | Read file contents | pending |
| `storage.delete_file` | Delete files | pending |
| `storage.sign_private_url` | Signed URLs for private files | pending |

### Stream Functions
| Function | Use Case | Status |
|----------|----------|--------|
| `stream.from_csv` | Process CSV files | pending |
| `stream.from_jsonl` | Process JSONL files | pending |
| `stream.from_request` | Stream external API responses | pending |

### API Functions
| Function | Use Case | Status |
|----------|----------|--------|
| `api.stream` | Streaming responses (AI, large data) | pending |
| `api.realtime_event` | WebSocket/real-time updates | pending |

---

## Tier 4: LOWER (Specialized)

### Core/Definition Functions
| Function | Use Case | Status |
|----------|----------|--------|
| `schema` | Table schema definitions | pending |
| `schedule` | Cron/scheduled tasks | pending |
| `table` | Table definitions | pending |
| `task` | Background task definitions | pending |

### Zip Functions
| Function | Use Case | Status |
|----------|----------|--------|
| `zip.create_archive` | Create zip files | pending |
| `zip.add_to_archive` | Add files to zip | pending |
| `zip.extract` | Extract zip files | pending |
| `zip.view_contents` | List zip contents | pending |
| `zip.delete_from_archive` | Remove from zip | pending |

---

## Tier 5: REDIS (Requires Redis setup)

| Function | Use Case | Status |
|----------|----------|--------|
| `redis.set` | Set key-value | pending |
| `redis.get` | Get value by key | pending |
| `redis.del` | Delete key | pending |
| `redis.has` | Check key exists | pending |
| `redis.push` | Add to list end | pending |
| `redis.pop` | Remove from list end | pending |
| `redis.shift` | Remove from list start | pending |
| `redis.unshift` | Add to list start | pending |
| `redis.incr` | Increment counter | pending |
| `redis.decr` | Decrement counter | pending |
| `redis.range` | Get list range | pending |
| `redis.count` | Count list items | pending |
| `redis.keys` | Find keys by pattern | pending |
| `redis.remove` | Remove from list | pending |
| `redis.ratelimit` | Rate limiting | pending |

---

## Excluded (Not in scope)

These are documented in functions.md but excluded from skill creation:

- `cloud.aws.*` - AWS S3, OpenSearch (25+ functions)
- `cloud.azure.*` - Azure Blob Storage (7 functions)
- `cloud.google.*` - Google Cloud Storage (7 functions)
- `cloud.algolia.*` - Algolia search
- `cloud.elasticsearch.*` - Elasticsearch
- `db.external.*` - External database connectors (MSSQL, MySQL, Oracle, Postgres)

---

## Progress Tracking

| Tier | Functions | Complete | Remaining |
|------|-----------|----------|-----------|
| Tier 1 (Critical) | 7 | 0 | 7 |
| Tier 2 (High) | 6 | 0 | 6 |
| Tier 3 (Medium) | 11 | 0 | 11 |
| Tier 4 (Lower) | 9 | 0 | 9 |
| Tier 5 (Redis) | 15 | 0 | 15 |
| **TOTAL** | **48** | **0** | **48** |
