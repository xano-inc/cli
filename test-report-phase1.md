# Phase 1 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T11:30:28.839Z |
| **Total Duration** | 17.86s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 11 |
| **Passed** | 11 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Function Commands > Create Function for Testing > creates a test function | 430ms |
| PASS | Function Commands > Function Security > updates function security (clear) | 353ms |
| PASS | Function Commands > Function Security > shows error when no security option provided | 42ms |
| PASS | Function Commands > Function Delete > deletes the test function | 399ms |
| PASS | Function Commands > Function Delete > shows error for non-existent function | 87ms |
| PASS | Workspace Commands > Workspace Get > gets workspace details in summary format | 107ms |
| PASS | Workspace Commands > Workspace Get > gets workspace details in JSON format | 90ms |
| PASS | Workspace Commands > Workspace Context > gets workspace context (text format) | 328ms |
| PASS | Workspace Commands > Workspace OpenAPI > gets workspace OpenAPI spec | 1.57s |
| PASS | Workspace Commands > Workspace Export/Import Schema > exports workspace schema to file | 428ms |
| PASS | Workspace Commands > Workspace Export > exports workspace to file | 635ms |

---

## Detailed Results

### Function Commands

#### Create Function for Testing

##### PASS creates a test function

- **Status:** passed
- **Duration:** 430ms
- **Command:** `xano function create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-func-1768131024366.xs -o json`
- **Output:**
```json
{
  "id": 166,
  "created_at": "2026-01-11 11:30:24+0000",
  "updated_at": "2026-01-11 11:30:24+0000",
  "name": "test_func_phase1_1768131010974",
  "description": "",
  "docs": "",
  "guid": "-fIniL4amGqJdegt0algp95UCyA",
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
- **Duration:** 353ms
- **Command:** `xano function security 166 -p mcp-server -w 40 --clear`
- **Output:**
```json
Function security cleared (no API group restriction)
ID: 166
Name: test_func_phase1_1768131010974
```

##### PASS shows error when no security option provided

- **Status:** passed
- **Duration:** 42ms
- **Command:** `xano function security 166 -p mcp-server -w 40`
- **Error:**
```
Either --apigroup-guid or --clear must be provided
```

#### Function Delete

##### PASS deletes the test function

- **Status:** passed
- **Duration:** 399ms
- **Command:** `xano function delete 166 -p mcp-server -w 40 --force`
- **Output:**
```json
Function deleted successfully!
```

##### PASS shows error for non-existent function

- **Status:** passed
- **Duration:** 87ms
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
- **Duration:** 107ms
- **Command:** `xano workspace get 40 -p mcp-server`
- **Output:**
```json
Workspace: CRM Application (ID: 40)
```

##### PASS gets workspace details in JSON format

- **Status:** passed
- **Duration:** 90ms
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
- **Duration:** 328ms
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
- **Duration:** 1.57s
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
- **Duration:** 428ms
- **Command:** `xano workspace export-schema 40 -p mcp-server --file /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/schema-export-1768131027776.xano`
- **Output:**
```json
Schema exported to /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/schema-export-1768131027776.xano
```

#### Workspace Export

##### PASS exports workspace to file

- **Status:** passed
- **Duration:** 635ms
- **Command:** `xano workspace export 40 -p mcp-server --file /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/workspace-export-1768131028205.xano`
- **Output:**
```json
Workspace exported to /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/workspace-export-1768131028205.xano
```

