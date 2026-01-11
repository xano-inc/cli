# Phase 6 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T11:05:50.670Z |
| **Total Duration** | 1.56s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 10 |
| **Passed** | 10 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Branch Commands > List Branches > lists branches in workspace | 166ms |
| PASS | File Commands > List Files > lists files in workspace | 103ms |
| PASS | Audit Log Commands > List Audit Logs > lists audit logs | 244ms |
| PASS | Audit Log Commands > Global Audit Logs > lists global audit logs | 261ms |
| PASS | History Commands > Request History > lists request history | 174ms |
| PASS | History Commands > Function History > lists function history | 140ms |
| PASS | History Commands > Middleware History > lists middleware history | 136ms |
| PASS | History Commands > Task History > lists task history | 122ms |
| PASS | History Commands > Trigger History > lists trigger history | 86ms |
| PASS | History Commands > Tool History > lists tool history | 119ms |

---

## Detailed Results

### Branch Commands

#### List Branches > lists branches in workspace

- **Status:** passed
- **Duration:** 166ms
- **Command:** `xano branch list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "created_at": "2026-01-07 09:11:54+0000",
    "label": "v1",
    "backup": false,
    "live": true
  }
]

```

### File Commands

#### List Files > lists files in workspace

- **Status:** passed
- **Duration:** 103ms
- **Command:** `xano file list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

### Audit Log Commands

#### List Audit Logs > lists audit logs

- **Status:** passed
- **Duration:** 244ms
- **Command:** `xano audit-log list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 7530,
    "created_at": "2026-01-11 10:51:56+0000",
    "type": "mcp_server:delete",
    "msg": "Mcp_server deleted: Test MCP _phase5_1768128704057",
    "label": [
      "mcp_server"
    ],
    "user": {
      "id": 2273,
      "email": "lachlan.m@xano.com"
    },
    "workspace": {
      "id": 40,
      "name": "CRM Application"
    },
    "branch": {
      "id": 0,
      "label": null
    }
  },
  {
    "id": 7529,
    "created_at": "2026-01-11 10:51:56+0000",
    "type": "mcp
```

#### Global Audit Logs > lists global audit logs

- **Status:** passed
- **Duration:** 261ms
- **Command:** `xano audit-log global-list -p mcp-server -o json`
- **Output:**
```json
[
  {
    "id": 7530,
    "created_at": "2026-01-11 10:51:56+0000",
    "type": "mcp_server:delete",
    "msg": "Mcp_server deleted: Test MCP _phase5_1768128704057",
    "label": [
      "mcp_server"
    ],
    "user": {
      "id": 2273,
      "email": "lachlan.m@xano.com"
    },
    "workspace": {
      "id": 40,
      "name": "CRM Application"
    },
    "branch": {
      "id": 0,
      "label": null
    }
  },
  {
    "id": 7529,
    "created_at": "2026-01-11 10:51:56+0000",
    "type": "mcp
```

### History Commands

#### Request History > lists request history

- **Status:** passed
- **Duration:** 174ms
- **Command:** `xano history request list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 56679,
    "created_at": "2026-01-11 10:51:56+0000",
    "workspace_id": 40,
    "branch": "v1",
    "api_id": 0,
    "query_id": 0,
    "duration": 0.182,
    "status": 200,
    "verb": "PUT",
    "uri": "https://xhib-njau-6vza.d2.dev.xano.io/api:meta/workspace/40/mcp_server/111",
    "input": {
      "xanoscript": "mcp_server \"Test MCP _phase5_1768128704057\" {\n  canonical = \"test-mcp_phase5_1768128704057\"\n  description = \"Updated MCP server description for phase 5 integr
```

#### Function History > lists function history

- **Status:** passed
- **Duration:** 140ms
- **Command:** `xano history function list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

#### Middleware History > lists middleware history

- **Status:** passed
- **Duration:** 136ms
- **Command:** `xano history middleware list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

#### Task History > lists task history

- **Status:** passed
- **Duration:** 122ms
- **Command:** `xano history task list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

#### Trigger History > lists trigger history

- **Status:** passed
- **Duration:** 86ms
- **Command:** `xano history trigger list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

#### Tool History > lists tool history

- **Status:** passed
- **Duration:** 119ms
- **Command:** `xano history tool list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

