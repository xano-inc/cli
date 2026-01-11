# Phase 6 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T11:30:48.673Z |
| **Total Duration** | 1.35s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 10 |
| **Passed** | 10 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Branch Commands > List Branches > lists branches in workspace | 109ms |
| PASS | File Commands > List Files > lists files in workspace | 81ms |
| PASS | Audit Log Commands > List Audit Logs > lists audit logs | 233ms |
| PASS | Audit Log Commands > Global Audit Logs > lists global audit logs | 246ms |
| PASS | History Commands > Request History > lists request history | 153ms |
| PASS | History Commands > Function History > lists function history | 111ms |
| PASS | History Commands > Middleware History > lists middleware history | 114ms |
| PASS | History Commands > Task History > lists task history | 103ms |
| PASS | History Commands > Trigger History > lists trigger history | 80ms |
| PASS | History Commands > Tool History > lists tool history | 108ms |

---

## Detailed Results

### Branch Commands

#### List Branches > lists branches in workspace

- **Status:** passed
- **Duration:** 109ms
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
- **Duration:** 81ms
- **Command:** `xano file list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

### Audit Log Commands

#### List Audit Logs > lists audit logs

- **Status:** passed
- **Duration:** 233ms
- **Command:** `xano audit-log list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 7568,
    "created_at": "2026-01-11 11:30:46+0000",
    "type": "mcp_server:delete",
    "msg": "Mcp_server deleted: Test MCP _phase5_1768131011257",
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
    "id": 7567,
    "created_at": "2026-01-11 11:30:46+0000",
    "type": "mcp
```

#### Global Audit Logs > lists global audit logs

- **Status:** passed
- **Duration:** 246ms
- **Command:** `xano audit-log global-list -p mcp-server -o json`
- **Output:**
```json
[
  {
    "id": 7568,
    "created_at": "2026-01-11 11:30:46+0000",
    "type": "mcp_server:delete",
    "msg": "Mcp_server deleted: Test MCP _phase5_1768131011257",
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
    "id": 7567,
    "created_at": "2026-01-11 11:30:46+0000",
    "type": "mcp
```

### History Commands

#### Request History > lists request history

- **Status:** passed
- **Duration:** 153ms
- **Command:** `xano history request list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 56765,
    "created_at": "2026-01-11 11:30:37+0000",
    "workspace_id": 40,
    "branch": "v1",
    "api_id": 0,
    "query_id": 0,
    "duration": 0.162,
    "status": 200,
    "verb": "GET",
    "uri": "https://xhib-njau-6vza.d2.dev.xano.io/api:meta/workspace/40/trigger/22?include_xanoscript=false",
    "input": {
      "include_xanoscript": "false"
    },
    "request_headers": [
      "Accept-Encoding: br, gzip, deflate",
      "User-Agent: node",
      "Sec-Fetch-Mode: cors
```

#### Function History > lists function history

- **Status:** passed
- **Duration:** 111ms
- **Command:** `xano history function list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

#### Middleware History > lists middleware history

- **Status:** passed
- **Duration:** 114ms
- **Command:** `xano history middleware list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

#### Task History > lists task history

- **Status:** passed
- **Duration:** 103ms
- **Command:** `xano history task list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

#### Trigger History > lists trigger history

- **Status:** passed
- **Duration:** 80ms
- **Command:** `xano history trigger list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

#### Tool History > lists tool history

- **Status:** passed
- **Duration:** 108ms
- **Command:** `xano history tool list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]

```

