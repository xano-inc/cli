# Phase 1 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T09:44:25.315Z |
| **Total Duration** | 10.28s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 11 |
| **Passed** | 11 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Function Commands > Create Function for Testing > creates a test function | 404ms |
| PASS | Function Commands > Function Security > updates function security (clear) | 372ms |
| PASS | Function Commands > Function Security > shows error when no security option provided | 17ms |
| PASS | Function Commands > Function Delete > deletes the test function | 428ms |
| PASS | Function Commands > Function Delete > shows error for non-existent function | 91ms |
| PASS | Workspace Commands > Workspace Get > gets workspace details in summary format | 101ms |
| PASS | Workspace Commands > Workspace Get > gets workspace details in JSON format | 95ms |
| PASS | Workspace Commands > Workspace Context > gets workspace context (text format) | 368ms |
| PASS | Workspace Commands > Workspace OpenAPI > gets workspace OpenAPI spec | 1.90s |
| PASS | Workspace Commands > Workspace Export/Import Schema > exports workspace schema to file | 399ms |
| PASS | Workspace Commands > Workspace Export > exports workspace to file | 632ms |

---

## Detailed Results

### Function Commands

#### Create Function for Testing

##### PASS creates a test function

- **Status:** passed
- **Duration:** 404ms
- **Command:** `xano function create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-func-1768124660509.xs -o json`
- **Output:**
```json
{
  "id": 165,
  "created_at": "2026-01-11 09:44:20+0000",
  "updated_at": "2026-01-11 09:44:20+0000",
  "name": "test_func_phase1_1768124655037",
  "description": "",
  "docs": "",
  "guid": "BLNXUFHVlVBy6oOxcWnHRqkZJn8",
  "cache": {
    "active": false,
    "ttl": 3600,
    "input": true,
    "auth": true,
    "datasource": true,
    "ip": false,
    "headers": [],
    "env": []
  },
  "branch": "v1",
  "input": [],
  "tag": [],
  "draft_updated_at": null,
  "xanoscript": null
}
```

#### Function Security

##### PASS updates function security (clear)

- **Status:** passed
- **Duration:** 372ms
- **Command:** `xano function security 165 -p mcp-server -w 40 --clear`
- **Output:**
```json
Function security cleared (no API group restriction)
ID: 165
Name: test_func_phase1_1768124655037
```

##### PASS shows error when no security option provided

- **Status:** passed
- **Duration:** 17ms
- **Command:** `xano function security 165 -p mcp-server -w 40`
- **Error:**
```
Either --apigroup-guid or --clear must be provided
```

#### Function Delete

##### PASS deletes the test function

- **Status:** passed
- **Duration:** 428ms
- **Command:** `xano function delete 165 -p mcp-server -w 40 --force`
- **Output:**
```json
Function deleted successfully!
```

##### PASS shows error for non-existent function

- **Status:** passed
- **Duration:** 91ms
- **Command:** `xano function delete 999999 -p mcp-server -w 40 --force`
- **Error:**
```
API request failed with status 404: Not Found
{"code":"ERROR_CODE_NOT_FOUND","message":""}
```

### Workspace Commands

#### Workspace Get

##### PASS gets workspace details in summary format

- **Status:** passed
- **Duration:** 101ms
- **Command:** `xano workspace get 40 -p mcp-server`
- **Output:**
```json
Workspace: CRM Application (ID: 40)
```

##### PASS gets workspace details in JSON format

- **Status:** passed
- **Duration:** 95ms
- **Command:** `xano workspace get 40 -p mcp-server -o json`
- **Output:**
```json
{
  "id": 40,
  "name": "CRM Application",
  "description": "",
  "swagger": false,
  "documentation": null,
  "branch": "v1"
}
```

#### Workspace Context

##### PASS gets workspace context (text format)

- **Status:** passed
- **Duration:** 368ms
- **Command:** `xano workspace context 40 -p mcp-server`
- **Output:**
```json
workspaceId: 40
databaseTables:
  -
    id: 563
    name: mcp_project
  -
    id: 564
    name: mcp_task
  -
    id: 565
    name: mcp_trace
  -
    id: 566
    name: mcp_trace_span
  -
    id: 567
    name: mcp_task_dependency
  -
    id: 568
    name: mcp_task_comment
  -
    id: 569
    name: mcp_task_validation
  -
    id: 570
    name: truncate_test
  -
    id: 571
    name: test_user
  -
    id: 572
    name: skill_function
  -
    id: 573
    name: skill_test
  -
    id: 574
    name: ski... (truncated)
```

#### Workspace OpenAPI

##### PASS gets workspace OpenAPI spec

- **Status:** passed
- **Duration:** 1.90s
- **Command:** `xano workspace openapi 40 -p mcp-server`
- **Output:**
```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "CRM Application",
    "description": "",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://xhib-njau-6vza.d2.dev.xano.io"
    }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    },
    "schemas": {}
  },
  "paths": {
    "/api:IP4H9F3X/dashboard": {
      "get": {
        "operationId": "mcp_system/dashboard|GET",... (truncated)
```

#### Workspace Export/Import Schema

##### PASS exports workspace schema to file

- **Status:** passed
- **Duration:** 399ms
- **Command:** `xano workspace export-schema 40 -p mcp-server --file /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/schema-export-1768124664283.xano`
- **Output:**
```json
Schema exported to /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/schema-export-1768124664283.xano
```

#### Workspace Export

##### PASS exports workspace to file

- **Status:** passed
- **Duration:** 632ms
- **Command:** `xano workspace export 40 -p mcp-server --file /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/workspace-export-1768124664682.xano`
- **Output:**
```json
Workspace exported to /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/workspace-export-1768124664682.xano
```

