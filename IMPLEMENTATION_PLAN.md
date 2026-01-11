# Xano CLI - Metadata API Implementation Plan

## Overview

This document outlines the comprehensive plan to extend the Xano CLI to support all Metadata API endpoints. The implementation follows existing CLI patterns and includes integration tests for each resource.

---

## XanoScript Documentation Reference

When implementing commands and tests for each resource, refer to the XanoScript documentation in `xanoscript-docs/xanoscript-ai-documentation-main/` for examples and guidelines.

### Resource-Specific Documentation

| Resource | Documentation Files | Purpose |
|----------|---------------------|---------|
| **API/Query** | `api_query_guideline.md`, `api_query_examples.md` | API endpoint patterns & examples |
| **Table** | `table_guideline.md`, `table_examples.md`, `TABLE_AGENTS.md` | Table schema & CRUD patterns |
| **Function** | `function_guideline.md`, `function_examples.md`, `functions.md`, `FUNCTION_AGENTS.md` | Function patterns & built-in functions |
| **Task** | `task_guideline.md`, `task_examples.md`, `TASK_AGENTS.md` | Scheduled task patterns |
| **Agent** | `agent_guideline.md`, `agent_examples.md`, `AGENTS.md`, `API_AGENTS.md` | Agent configuration |
| **MCP Server** | `mcp_server_guideline.md`, `mcp_server_examples.md` | MCP server setup |
| **Tool** | `tool_guideline.md`, `tool_examples.md` | Tool definitions |
| **Workspace** | `workspace.md` | Workspace configuration |

### General Guidelines

| Documentation | Purpose |
|---------------|---------|
| `expression_guideline.md` | XanoScript expressions & syntax |
| `input_guideline.md` | Input parameter definitions |
| `db_query_guideline.md` | Database query patterns |
| `query_filter.md` | Query filtering syntax |
| `unit_testing_guideline.md` | **Test setup patterns** |
| `tips_and_tricks.md` | Best practices |
| `ephemeral_environment_guideline.md` | Ephemeral job/service setup |

### Key Files for Test Implementation

When setting up tests for each resource type, consult:

1. **`unit_testing_guideline.md`** - Core testing patterns and assertions
2. **`{resource}_examples.md`** - Working XanoScript examples to use as test fixtures
3. **`{resource}_guideline.md`** - Understanding resource structure for validation

---

## Current State

### Already Implemented

| Resource | Commands | Status |
|----------|----------|--------|
| **profile** | create, delete, edit, get-default, list, me, project, set-default, token, wizard | Complete |
| **api** | list, get, create, edit, delete | Complete |
| **apigroup** | list, get, create, edit, delete | Complete |
| **table** | list, get, create, edit, delete | Complete |
| **function** | list, get, create, edit | Partial (missing delete) |
| **workspace** | list | Partial |
| **run** | job, service | Complete |
| **static_host** | list, build/list, build/get, build/create | Partial |

---

## Implementation Phases

### Phase 1: Complete Existing Resources
**Priority: High | Complexity: Low**

Complete the partially implemented resources before adding new ones.

#### 1.1 Function - Add Missing Commands
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `function delete` | DELETE /workspace/{id}/function/{id} | Delete a function |
| `function security` | PUT /workspace/{id}/function/{id}/security | Update function security |

#### 1.2 Workspace - Add Missing Commands
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `workspace get` | GET /workspace/{id} | Get workspace details |
| `workspace context` | GET /workspace/{id}/context | Get full workspace context |
| `workspace export` | POST /workspace/{id}/export | Export workspace archive |
| `workspace import` | POST /workspace/{id}/import | Import workspace archive |
| `workspace export-schema` | POST /workspace/{id}/export-schema | Export schema only |
| `workspace import-schema` | POST /workspace/{id}/import-schema | Import schema only |
| `workspace openapi` | GET /workspace/{id}/openapi | Get workspace OpenAPI spec |

#### 1.3 Static Host - Add Missing Commands
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `static_host build delete` | DELETE /workspace/{id}/static_host/{host}/build/{id} | Delete a build |
| `static_host build env` | POST /workspace/{id}/static_host/{host}/build/{id}/env | Update build environment |

---

### Phase 2: Core Development Resources
**Priority: High | Complexity: Medium**

Add support for core development resources that are commonly used.

#### 2.1 Middleware
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `middleware list` | GET /workspace/{id}/middleware | List all middlewares |
| `middleware get` | GET /workspace/{id}/middleware/{id} | Get middleware details |
| `middleware create` | POST /workspace/{id}/middleware | Create middleware (XanoScript) |
| `middleware edit` | PUT /workspace/{id}/middleware/{id} | Update middleware |
| `middleware delete` | DELETE /workspace/{id}/middleware/{id} | Delete middleware |
| `middleware security` | PUT /workspace/{id}/middleware/{id}/security | Update security settings |

#### 2.2 Task (Scheduled Tasks)
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `task list` | GET /workspace/{id}/task | List all scheduled tasks |
| `task get` | GET /workspace/{id}/task/{id} | Get task details |
| `task create` | POST /workspace/{id}/task | Create task (XanoScript) |
| `task edit` | PUT /workspace/{id}/task/{id} | Update task |
| `task delete` | DELETE /workspace/{id}/task/{id} | Delete task |
| `task security` | PUT /workspace/{id}/task/{id}/security | Update security settings |

#### 2.3 Addon
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `addon list` | GET /workspace/{id}/addon | List all addons |
| `addon get` | GET /workspace/{id}/addon/{id} | Get addon details |
| `addon create` | POST /workspace/{id}/addon | Create addon |
| `addon edit` | PUT /workspace/{id}/addon/{id} | Update addon |
| `addon delete` | DELETE /workspace/{id}/addon/{id} | Delete addon |
| `addon security` | PUT /workspace/{id}/addon/{id}/security | Update security settings |

#### 2.4 Datasource
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `datasource list` | GET /workspace/{id}/datasource | List all datasources |
| `datasource create` | POST /workspace/{id}/datasource | Create datasource |
| `datasource edit` | PUT /workspace/{id}/datasource/{label} | Update datasource |
| `datasource delete` | DELETE /workspace/{id}/datasource/{label} | Delete datasource |

---

### Phase 3: Trigger Resources
**Priority: Medium | Complexity: Medium**

Add support for various trigger types.

#### 3.1 Workspace Trigger
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `trigger list` | GET /workspace/{id}/trigger | List workspace triggers |
| `trigger get` | GET /workspace/{id}/trigger/{id} | Get trigger details |
| `trigger create` | POST /workspace/{id}/trigger | Create trigger (XanoScript) |
| `trigger edit` | PUT /workspace/{id}/trigger/{id} | Update trigger |
| `trigger delete` | DELETE /workspace/{id}/trigger/{id} | Delete trigger |
| `trigger security` | PUT /workspace/{id}/trigger/{id}/security | Update security settings |

#### 3.2 Table Trigger
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `table trigger list` | GET /workspace/{id}/table/trigger | List table triggers |
| `table trigger get` | GET /workspace/{id}/table/trigger/{id} | Get trigger details |
| `table trigger create` | POST /workspace/{id}/table/trigger | Create trigger |
| `table trigger edit` | PUT /workspace/{id}/table/trigger/{id} | Update trigger |
| `table trigger delete` | DELETE /workspace/{id}/table/trigger/{id} | Delete trigger |
| `table trigger security` | PUT /workspace/{id}/table/trigger/{id}/security | Update security |

---

### Phase 4: Table Data Operations
**Priority: Medium | Complexity: High**

Add support for table data (content) operations.

#### 4.1 Table Content (Data CRUD)
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `table content list` | GET /workspace/{id}/table/{id}/content | List records |
| `table content get` | GET /workspace/{id}/table/{id}/content/{id} | Get record |
| `table content create` | POST /workspace/{id}/table/{id}/content | Create record |
| `table content edit` | PUT /workspace/{id}/table/{id}/content/{id} | Update record |
| `table content delete` | DELETE /workspace/{id}/table/{id}/content/{id} | Delete record |
| `table content search` | POST /workspace/{id}/table/{id}/content/search | Search records |
| `table content bulk create` | POST /workspace/{id}/table/{id}/content/bulk | Bulk create |
| `table content bulk delete` | POST /workspace/{id}/table/{id}/content/bulk/delete | Bulk delete |
| `table content bulk patch` | POST /workspace/{id}/table/{id}/content/bulk/patch | Bulk update |
| `table content truncate` | DELETE /workspace/{id}/table/{id}/truncate | Truncate table |

#### 4.2 Table Schema Management
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `table schema get` | GET /workspace/{id}/table/{id}/schema | Get full schema |
| `table schema replace` | PUT /workspace/{id}/table/{id}/schema | Replace schema |
| `table schema column get` | GET /workspace/{id}/table/{id}/schema/{name} | Get column |
| `table schema column delete` | DELETE /workspace/{id}/table/{id}/schema/{name} | Delete column |
| `table schema column rename` | POST /workspace/{id}/table/{id}/schema/rename | Rename column |
| `table schema column add` | POST /workspace/{id}/table/{id}/schema/type/{type} | Add column |

#### 4.3 Table Index Management
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `table index list` | GET /workspace/{id}/table/{id}/index | List indexes |
| `table index replace` | PUT /workspace/{id}/table/{id}/index | Replace all indexes |
| `table index delete` | DELETE /workspace/{id}/table/{id}/index/{id} | Delete index |
| `table index create btree` | POST /workspace/{id}/table/{id}/index/btree | Create btree index |
| `table index create unique` | POST /workspace/{id}/table/{id}/index/unique | Create unique index |
| `table index create search` | POST /workspace/{id}/table/{id}/index/search | Create search index |
| `table index create spatial` | POST /workspace/{id}/table/{id}/index/spatial | Create spatial index |
| `table index create vector` | POST /workspace/{id}/table/{id}/index/vector | Create vector index |

---

### Phase 5: Advanced Resources
**Priority: Low | Complexity: High**

Add support for advanced/specialized resources.

#### 5.1 Agent
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `agent list` | GET /workspace/{id}/agent | List agents |
| `agent get` | GET /workspace/{id}/agent/{id} | Get agent details |
| `agent create` | POST /workspace/{id}/agent | Create agent |
| `agent edit` | PUT /workspace/{id}/agent/{id} | Update agent |
| `agent delete` | DELETE /workspace/{id}/agent/{id} | Delete agent |

#### 5.2 Agent Trigger
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `agent trigger list` | GET /workspace/{id}/agent/trigger | List triggers |
| `agent trigger get` | GET /workspace/{id}/agent/trigger/{id} | Get trigger |
| `agent trigger create` | POST /workspace/{id}/agent/trigger | Create trigger |
| `agent trigger edit` | PUT /workspace/{id}/agent/trigger/{id} | Update trigger |
| `agent trigger delete` | DELETE /workspace/{id}/agent/trigger/{id} | Delete trigger |
| `agent trigger security` | PUT /workspace/{id}/agent/trigger/{id}/security | Update security |

#### 5.3 MCP Server
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `mcp_server list` | GET /workspace/{id}/mcp_server | List MCP servers |
| `mcp_server get` | GET /workspace/{id}/mcp_server/{id} | Get MCP server |
| `mcp_server create` | POST /workspace/{id}/mcp_server | Create MCP server |
| `mcp_server edit` | PUT /workspace/{id}/mcp_server/{id} | Update MCP server |
| `mcp_server delete` | DELETE /workspace/{id}/mcp_server/{id} | Delete MCP server |

#### 5.4 MCP Server Trigger
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `mcp_server trigger list` | GET /workspace/{id}/mcp_server/trigger | List triggers |
| `mcp_server trigger get` | GET /workspace/{id}/mcp_server/trigger/{id} | Get trigger |
| `mcp_server trigger create` | POST /workspace/{id}/mcp_server/trigger | Create trigger |
| `mcp_server trigger edit` | PUT /workspace/{id}/mcp_server/trigger/{id} | Update trigger |
| `mcp_server trigger delete` | DELETE /workspace/{id}/mcp_server/trigger/{id} | Delete trigger |
| `mcp_server trigger security` | PUT /workspace/{id}/mcp_server/trigger/{id}/security | Update security |

#### 5.5 Realtime
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `realtime get` | GET /workspace/{id}/realtime | Get realtime settings |
| `realtime edit` | PUT /workspace/{id}/realtime | Update realtime settings |

#### 5.6 Realtime Channel
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `realtime channel list` | GET /workspace/{id}/realtime/channel | List channels |
| `realtime channel get` | GET /workspace/{id}/realtime/channel/{id} | Get channel |
| `realtime channel create` | POST /workspace/{id}/realtime/channel | Create channel |
| `realtime channel edit` | PUT /workspace/{id}/realtime/channel/{id} | Update channel |
| `realtime channel delete` | DELETE /workspace/{id}/realtime/channel/{id} | Delete channel |

#### 5.7 Realtime Channel Trigger
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `realtime channel trigger list` | GET /workspace/{id}/realtime/channel/trigger | List triggers |
| `realtime channel trigger get` | GET /workspace/{id}/realtime/channel/trigger/{id} | Get trigger |
| `realtime channel trigger create` | POST /workspace/{id}/realtime/channel/trigger | Create trigger |
| `realtime channel trigger edit` | PUT /workspace/{id}/realtime/channel/trigger/{id} | Update trigger |
| `realtime channel trigger delete` | DELETE /workspace/{id}/realtime/channel/trigger/{id} | Delete trigger |
| `realtime channel trigger security` | PUT /workspace/{id}/realtime/channel/trigger/{id}/security | Update security |

#### 5.8 Tool
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `tool list` | GET /workspace/{id}/tool | List tools |
| `tool get` | GET /workspace/{id}/tool/{id} | Get tool details |
| `tool create` | POST /workspace/{id}/tool | Create tool |
| `tool edit` | PUT /workspace/{id}/tool/{id} | Update tool |
| `tool delete` | DELETE /workspace/{id}/tool/{id} | Delete tool |
| `tool security` | PUT /workspace/{id}/tool/{id}/security | Update security |

#### 5.9 Workflow Test
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `workflow_test list` | GET /workspace/{id}/workflow_test | List workflow tests |
| `workflow_test get` | GET /workspace/{id}/workflow_test/{id} | Get test details |
| `workflow_test create` | POST /workspace/{id}/workflow_test | Create test |
| `workflow_test edit` | PUT /workspace/{id}/workflow_test/{id} | Update test |
| `workflow_test delete` | DELETE /workspace/{id}/workflow_test/{id} | Delete test |
| `workflow_test security` | PUT /workspace/{id}/workflow_test/{id}/security | Update security |

---

### Phase 6: Operational Resources
**Priority: Low | Complexity: Low**

Add support for operational/monitoring resources.

#### 6.1 Branch Management
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `branch list` | GET /workspace/{id}/branch | List branches |
| `branch delete` | DELETE /workspace/{id}/branch/{label} | Delete branch |

#### 6.2 File Management
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `file list` | GET /workspace/{id}/file | List files |
| `file upload` | POST /workspace/{id}/file | Upload file |
| `file delete` | DELETE /workspace/{id}/file/{id} | Delete file |
| `file bulk-delete` | DELETE /workspace/{id}/file/bulk_delete | Bulk delete files |

#### 6.3 Audit Log
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `audit_log list` | GET /workspace/{id}/audit_log | List audit logs |
| `audit_log search` | POST /workspace/{id}/audit_log/search | Search audit logs |
| `audit_log global list` | GET /audit_log | List global audit logs |
| `audit_log global search` | POST /audit_log/search | Search global audit logs |

#### 6.4 Request History
| Command | API Endpoint | Description |
|---------|--------------|-------------|
| `history request list` | GET /workspace/{id}/request_history | List API request history |
| `history request search` | POST /workspace/{id}/request_history/search | Search request history |
| `history function list` | GET /workspace/{id}/function_history | List function history |
| `history function search` | POST /workspace/{id}/function_history/search | Search function history |
| `history middleware list` | GET /workspace/{id}/middleware_history | List middleware history |
| `history middleware search` | POST /workspace/{id}/middleware_history/search | Search middleware history |
| `history task list` | GET /workspace/{id}/task_history | List task history |
| `history task search` | POST /workspace/{id}/task_history/search | Search task history |
| `history trigger list` | GET /workspace/{id}/trigger_history | List trigger history |
| `history trigger search` | POST /workspace/{id}/trigger_history/search | Search trigger history |
| `history tool list` | GET /workspace/{id}/tool_history | List tool history |
| `history tool search` | POST /workspace/{id}/tool_history/search | Search tool history |

---

## Implementation Strategy

### For Each Resource

1. **Create Types** (`src/lib/types.ts`)
   - Add TypeScript interfaces for the resource
   - Include request/response types

2. **Add API Client Methods** (`src/lib/api-client.ts`)
   - Add methods to XanoApiClient class
   - Follow existing patterns for list/get/create/update/delete

3. **Create Command Files**
   - Create folder structure: `src/commands/{resource}/{action}/index.ts`
   - Follow existing command patterns
   - Support multiple output formats (json, summary, xs where applicable)
   - Support file input for XanoScript resources

4. **Update package.json**
   - Add new topic to `oclif.topics`

5. **Create Integration Tests**
   - Add test file: `test/integration/{resource}.test.ts`
   - Follow create -> list -> get -> edit -> delete flow
   - Integrate with markdown report generation

### Test Pattern

```typescript
describe('{Resource} Integration Tests', function() {
  this.timeout(30000)

  // Phase 1: Create
  describe('Phase 1: Create', () => {
    it('creates a {resource}', async () => { ... })
  })

  // Phase 2: List
  describe('Phase 2: List', () => {
    it('lists {resource}s in JSON format', async () => { ... })
    it('lists {resource}s in summary format', async () => { ... })
  })

  // Phase 3: Get
  describe('Phase 3: Get', () => {
    it('gets {resource} details', async () => { ... })
    it('gets {resource} as XanoScript', async () => { ... }) // if applicable
  })

  // Phase 4: Edit
  describe('Phase 4: Edit', () => {
    it('edits {resource} name/description', async () => { ... })
  })

  // Phase 5: Delete & Verify
  describe('Phase 5: Delete', () => {
    it('deletes {resource}', async () => { ... })
    it('verifies deletion', async () => { ... })
  })
})
```

---

## Command Summary

| Phase | Resource | Commands | Test File |
|-------|----------|----------|-----------|
| 1.1 | function | +delete, +security | function.test.ts |
| 1.2 | workspace | +get, +context, +export, +import, +openapi | workspace.test.ts |
| 1.3 | static_host | +build/delete, +build/env | static-host.test.ts |
| 2.1 | middleware | list, get, create, edit, delete, security | middleware.test.ts |
| 2.2 | task | list, get, create, edit, delete, security | task.test.ts |
| 2.3 | addon | list, get, create, edit, delete, security | addon.test.ts |
| 2.4 | datasource | list, create, edit, delete | datasource.test.ts |
| 3.1 | trigger | list, get, create, edit, delete, security | trigger.test.ts |
| 3.2 | table/trigger | list, get, create, edit, delete, security | table-trigger.test.ts |
| 4.1 | table/content | list, get, create, edit, delete, search, bulk | table-content.test.ts |
| 4.2 | table/schema | get, replace, column/* | table-schema.test.ts |
| 4.3 | table/index | list, replace, delete, create/* | table-index.test.ts |
| 5.1 | agent | list, get, create, edit, delete | agent.test.ts |
| 5.2 | agent/trigger | list, get, create, edit, delete, security | agent-trigger.test.ts |
| 5.3 | mcp_server | list, get, create, edit, delete | mcp-server.test.ts |
| 5.4 | mcp_server/trigger | list, get, create, edit, delete, security | mcp-server-trigger.test.ts |
| 5.5 | realtime | get, edit | realtime.test.ts |
| 5.6 | realtime/channel | list, get, create, edit, delete | realtime-channel.test.ts |
| 5.7 | realtime/channel/trigger | list, get, create, edit, delete, security | realtime-trigger.test.ts |
| 5.8 | tool | list, get, create, edit, delete, security | tool.test.ts |
| 5.9 | workflow_test | list, get, create, edit, delete, security | workflow-test.test.ts |
| 6.1 | branch | list, delete | branch.test.ts |
| 6.2 | file | list, upload, delete, bulk-delete | file.test.ts |
| 6.3 | audit_log | list, search, global/* | audit-log.test.ts |
| 6.4 | history | request/*, function/*, middleware/*, task/*, trigger/*, tool/* | history.test.ts |

---

## Total Implementation Scope

| Metric | Count |
|--------|-------|
| **New Command Topics** | 15 |
| **New Commands** | ~120 |
| **New Test Files** | ~20 |
| **Estimated API Client Methods** | ~60 |

---

## Execution Checklist

### Phase 1: Complete Existing (Priority: Immediate)
- [ ] 1.1 function delete, security
- [ ] 1.2 workspace get, context, export, import, openapi
- [ ] 1.3 static_host build/delete, build/env
- [ ] Run all tests, verify report

### Phase 2: Core Development (Priority: High)
- [ ] 2.1 middleware (full CRUD)
- [ ] 2.2 task (full CRUD)
- [ ] 2.3 addon (full CRUD)
- [ ] 2.4 datasource (CRUD)
- [ ] Run all tests, verify report

### Phase 3: Triggers (Priority: Medium)
- [ ] 3.1 trigger (full CRUD)
- [ ] 3.2 table trigger (full CRUD)
- [ ] Run all tests, verify report

### Phase 4: Table Data (Priority: Medium)
- [ ] 4.1 table content (full CRUD + bulk + search)
- [ ] 4.2 table schema management
- [ ] 4.3 table index management
- [ ] Run all tests, verify report

### Phase 5: Advanced Resources (Priority: Low)
- [ ] 5.1 agent
- [ ] 5.2 agent trigger
- [ ] 5.3 mcp_server
- [ ] 5.4 mcp_server trigger
- [ ] 5.5-5.7 realtime (settings, channels, triggers)
- [ ] 5.8 tool
- [ ] 5.9 workflow_test
- [ ] Run all tests, verify report

### Phase 6: Operational (Priority: Low)
- [ ] 6.1 branch
- [ ] 6.2 file
- [ ] 6.3 audit_log
- [ ] 6.4 history
- [ ] Run all tests, verify report

---

## Notes

- All tests output to the markdown report (`test-report.md`)
- Follow create -> edit -> delete test flow for cleanup
- XanoScript support where API accepts it
- Multiple output formats: `json`, `summary`, `xs` (XanoScript)
- Profile-based authentication maintained throughout
- Workspace ID can be passed via flag or profile default

---

*Document created: 2026-01-11*
*Last updated: 2026-01-11*
