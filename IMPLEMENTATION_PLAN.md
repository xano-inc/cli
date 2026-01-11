# Xano CLI - Metadata API Implementation Plan

## Overview

This document outlines the comprehensive plan to extend the Xano CLI to support all Metadata API endpoints. The implementation follows existing CLI patterns and includes integration tests for each resource.

---

## Implementation Status Summary

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Complete Existing Resources | ✅ Complete |
| Phase 2 | Core Development Resources | ✅ Complete |
| Phase 3 | Trigger Resources | ✅ Complete |
| Phase 4 | Table Data Operations | ✅ Complete |
| Phase 5 | Advanced Resources | ✅ Complete |
| Phase 6 | Operational Resources | ✅ Complete |
| Phase 7 | Documentation | 🔄 In Progress |

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

---

## Completed Implementation

### Phase 1: Complete Existing Resources ✅

| Resource | Commands | Status |
|----------|----------|--------|
| function | list, get, create, edit, delete, security | ✅ Complete |
| workspace | list, get, context, export, import, openapi | ✅ Complete |

### Phase 2: Core Development Resources ✅

| Resource | Commands | Status |
|----------|----------|--------|
| middleware | list, get, create, edit, delete, security | ✅ Complete |
| task | list, get, create, edit, delete, security | ✅ Complete |
| addon | list, get, create, edit, delete, security | ✅ Complete |
| datasource | list, create, edit, delete | ✅ Complete |

### Phase 3: Trigger Resources ✅

| Resource | Commands | Status |
|----------|----------|--------|
| trigger | list, get, create, edit, delete, security | ✅ Complete |
| table trigger | list, get, create, edit, delete, security | ✅ Complete |

### Phase 4: Table Data Operations ✅

| Resource | Commands | Status |
|----------|----------|--------|
| table content | list, get, create, edit, delete, search, bulk | ✅ Complete |
| table schema | get, replace, column operations | ✅ Complete |
| table index | list, create (btree, unique, search, spatial, vector), delete | ✅ Complete |

### Phase 5: Advanced Resources ✅

| Resource | Commands | Status |
|----------|----------|--------|
| agent | list, get, create, edit, delete | ✅ Complete |
| agent trigger | list, get, create, edit, delete, security | ✅ Complete |
| mcp-server | list, get, create, edit, delete | ✅ Complete |
| mcp-server trigger | list, get, create, edit, delete, security | ✅ Complete |
| realtime | get, edit | ✅ Complete |
| realtime channel | list, get, create, edit, delete | ✅ Complete |
| realtime channel trigger | list, get, create, edit, delete, security | ✅ Complete |
| tool | list, get, create, edit, delete, security | ✅ Complete |
| workflow-test | list, get, create, edit, delete, security | ✅ Complete |

### Phase 6: Operational Resources ✅

| Resource | Commands | Status |
|----------|----------|--------|
| branch | list, delete | ✅ Complete |
| file | list, upload, delete, bulk-delete | ✅ Complete |
| audit-log | list, search, global-list, global-search | ✅ Complete |
| history request | list, search | ✅ Complete |
| history function | list, search | ✅ Complete |
| history middleware | list, search | ✅ Complete |
| history task | list, search | ✅ Complete |
| history trigger | list, search | ✅ Complete |
| history tool | list, search | ✅ Complete |

---

## Phase 7: Documentation (Current Phase)

### Overview

Create comprehensive, accurate documentation for all CLI commands using the built-in `xano docs` system.

### Documentation Requirements

1. **Documentation Must Be Fact-Based**
   - All examples must be tested against the real API
   - CLI output examples must come from actual command runs
   - XanoScript syntax must be validated against working examples
   - Never guess - always verify

2. **Documentation Process**
   ```
   For each topic:
   1. Run `xano <topic> --help` to get actual command syntax
   2. Run commands with real data to capture actual output
   3. Test XanoScript examples against the API
   4. Document only verified, working examples
   5. Add integration test to verify documentation accuracy
   ```

3. **Documentation Structure**
   Each topic should include:
   - Overview - What is it and when to use it
   - Key Concepts - Important terminology
   - XanoScript Syntax (where applicable) - Validated syntax
   - CLI Commands - Actual command syntax from --help
   - Examples - Working examples with real output
   - Common Errors - Real error messages and solutions
   - Best Practices - Tested recommendations
   - Related Documentation - Links to related topics

### Documentation Topics

| Topic | Status | Test Coverage |
|-------|--------|---------------|
| getting-started | ✅ Complete | N/A |
| addon | ✅ Complete | addon.test.ts |
| table | ✅ Complete | table.test.ts |
| api | 🔄 In Progress | real-api.test.ts |
| apigroup | 🔄 In Progress | real-api.test.ts |
| function | ⏳ Pending | function.test.ts |
| middleware | ⏳ Pending | phase2.test.ts |
| task | ⏳ Pending | phase2.test.ts |
| trigger | ⏳ Pending | phase3.test.ts |
| agent | ⏳ Pending | phase5.test.ts |
| mcp-server | ⏳ Pending | phase5.test.ts |
| tool | ⏳ Pending | phase5.test.ts |
| realtime | ⏳ Pending | phase5.test.ts |
| branch | ⏳ Pending | phase6.test.ts |
| file | ⏳ Pending | phase6.test.ts |
| audit-log | ⏳ Pending | phase6.test.ts |
| history | ⏳ Pending | phase6.test.ts |
| profile | ⏳ Pending | - |
| workspace | ⏳ Pending | - |
| datasource | ⏳ Pending | phase2.test.ts |

### Documentation File Structure

```
src/docs/
├── index.ts           # Documentation registry
└── content/
    ├── getting-started.ts
    ├── addon.ts
    ├── table.ts
    ├── api.ts
    ├── apigroup.ts
    ├── function.ts
    ├── middleware.ts
    ├── task.ts
    ├── trigger.ts
    ├── agent.ts
    ├── mcp-server.ts
    ├── tool.ts
    ├── realtime.ts
    ├── branch.ts
    ├── file.ts
    ├── audit-log.ts
    ├── history.ts
    ├── profile.ts
    ├── workspace.ts
    └── datasource.ts
```

### Adding New Documentation

1. Create content file in `src/docs/content/<topic>.ts`
2. Export `DocTopic` interface:
   ```typescript
   import type {DocTopic} from '../index.js'

   export const topicDocs: DocTopic = {
     name: 'topic',
     title: 'Topic Documentation',
     description: 'Brief description',
     relatedTopics: ['related1', 'related2'],
     content: `
   # Topic Documentation

   ## Overview
   ...
   `.trim(),
   }
   ```
3. Register in `src/docs/index.ts`:
   ```typescript
   import {topicDocs} from './content/topic.js'

   export const docRegistry: Map<string, DocTopic> = new Map([
     // ... existing
     ['topic', topicDocs],
   ])
   ```
4. Add test to verify documentation examples work

---

## Test Reports

Integration tests generate markdown reports:

| Report | Description |
|--------|-------------|
| `test-report.md` | Main integration test report |
| `test-report-phase2.md` | Phase 2 resource tests |
| `test-report-phase3.md` | Phase 3 trigger tests |
| `test-report-phase4.md` | Phase 4 table data tests |
| `test-report-phase5.md` | Phase 5 advanced resource tests |
| `test-report-phase6.md` | Phase 6 operational resource tests |
| `test-report-addon.md` | Addon-specific tests |

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

6. **Add Documentation**
   - Create `src/docs/content/{resource}.ts`
   - Register in `src/docs/index.ts`
   - Verify with tests

---

## Current Command Topics

All implemented command topics in `package.json`:

```json
{
  "table": "Manage database tables",
  "apigroup": "Manage API groups",
  "api": "Manage API endpoints",
  "profile": "Manage profiles and credentials",
  "workspace": "Manage workspaces",
  "function": "Manage functions",
  "run": "Run ephemeral jobs and services",
  "static_host": "Manage static hosting",
  "middleware": "Manage middleware",
  "task": "Manage scheduled tasks",
  "addon": "Manage addons",
  "datasource": "Manage datasources",
  "trigger": "Manage workspace triggers",
  "docs": "View detailed documentation and guides",
  "branch": "Manage workspace branches",
  "file": "Manage workspace files",
  "audit-log": "View audit logs",
  "history": "View execution history"
}
```

---

## Total Implementation Scope

| Metric | Count |
|--------|-------|
| **Command Topics** | 25+ |
| **Total Commands** | 150+ |
| **Test Files** | 10+ |
| **API Client Methods** | 100+ |
| **Documentation Topics** | 20+ |

---

## Notes

- All tests output to markdown reports
- Follow create -> edit -> delete test flow for cleanup
- XanoScript support where API accepts it
- Multiple output formats: `json`, `summary`, `xs` (XanoScript)
- Profile-based authentication maintained throughout
- Workspace ID can be passed via flag or profile default
- Documentation must be based on tested, verified examples

---

*Document created: 2026-01-11*
*Last updated: 2026-01-11*
