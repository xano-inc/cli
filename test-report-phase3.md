# Phase 3 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T09:44:37.549Z |
| **Total Duration** | 22.36s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 18 |
| **Passed** | 18 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Workspace Trigger Commands > Create Trigger > creates a workspace trigger from XanoScript | 456ms |
| PASS | Workspace Trigger Commands > List Triggers > lists triggers in JSON format | 347ms |
| PASS | Workspace Trigger Commands > List Triggers > lists triggers in summary format | 255ms |
| PASS | Workspace Trigger Commands > Get Trigger > gets trigger details in JSON format | 237ms |
| PASS | Workspace Trigger Commands > Get Trigger > gets trigger in summary format | 218ms |
| PASS | Workspace Trigger Commands > Edit Trigger > edits trigger using XanoScript file | 383ms |
| PASS | Workspace Trigger Commands > Trigger Security > clears trigger security | 351ms |
| PASS | Workspace Trigger Commands > Delete Trigger > deletes the test trigger | 160ms |
| PASS | Table Trigger Commands > Setup Test Table > creates a table for table trigger tests | 298ms |
| PASS | Table Trigger Commands > Create Table Trigger > creates a table trigger from XanoScript | 483ms |
| PASS | Table Trigger Commands > List Table Triggers > lists table triggers in JSON format | 304ms |
| PASS | Table Trigger Commands > List Table Triggers > lists table triggers in summary format | 238ms |
| PASS | Table Trigger Commands > Get Table Trigger > gets table trigger details in JSON format | 231ms |
| PASS | Table Trigger Commands > Get Table Trigger > gets table trigger in summary format | 221ms |
| PASS | Table Trigger Commands > Edit Table Trigger > edits table trigger using XanoScript file | 404ms |
| PASS | Table Trigger Commands > Table Trigger Security > clears table trigger security | 314ms |
| PASS | Table Trigger Commands > Delete Table Trigger > deletes the test table trigger | 151ms |
| PASS | Table Trigger Commands > Cleanup Test Table > deletes the test table | 315ms |

---

## Detailed Results

### Workspace Trigger Commands

#### Create Trigger

##### PASS creates a workspace trigger from XanoScript

- **Status:** passed
- **Duration:** 456ms
- **Command:** `xano trigger create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-trigger-1768124672182.xs -o json`
- **Output:**
```json
{
  "id": 20,
  "created_at": "2026-01-11 09:44:32+0000",
  "updated_at": "2026-01-11 09:44:32+0000",
  "name": "test_trigger_phase3_1768124655185",
  "description": "",
  "guid": "cxcLb8rPnKE4bQjvPMIb73NttXQ",
  "branch": "v1",
  "workspace_id": 40,
  "tag": [],
  "actions": {
    "branch_live": true,
    "branch_merge": true,
    "branch_new": true
  },
  "draft_updated_at": null,
  "xanoscript": null,
  "input": []
}
```

#### List Triggers

##### PASS lists triggers in JSON format

- **Status:** passed
- **Duration:** 347ms
- **Command:** `xano trigger list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 20,
    "created_at": "2026-01-11 09:44:32+0000",
    "updated_at": "2026-01-11 09:44:32+0000",
    "name": "test_trigger_phase3_1768124655185",
    "description": "",
    "guid": "cxcLb8rPnKE4bQjvPMIb73NttXQ",
    "branch": "v1",
    "workspace_id": 40,
    "tag": [],
    "actions": {
      "branch_live": true,
      "branch_merge": true,
      "branch_new": true
    },
    "draft_updated_at": null,
    "xanoscript": null
  },
  {
    "id": 15,
    "created_at": "2026-01-11 09:4... (truncated)
```

##### PASS lists triggers in summary format

- **Status:** passed
- **Duration:** 255ms
- **Command:** `xano trigger list -p mcp-server -w 40`
- **Output:**
```json
Available triggers:
  - test_trigger_phase3_1768124655185 (ID: 20)
  - test_edit_trigger (ID: 15)
```

#### Get Trigger

##### PASS gets trigger details in JSON format

- **Status:** passed
- **Duration:** 237ms
- **Command:** `xano trigger get 20 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 20,
  "created_at": "2026-01-11 09:44:32+0000",
  "updated_at": "2026-01-11 09:44:32+0000",
  "name": "test_trigger_phase3_1768124655185",
  "description": "",
  "guid": "cxcLb8rPnKE4bQjvPMIb73NttXQ",
  "branch": "v1",
  "workspace_id": 40,
  "tag": [],
  "actions": {
    "branch_live": true,
    "branch_merge": true,
    "branch_new": true
  },
  "draft_updated_at": null,
  "xanoscript": null,
  "input": []
}
```

##### PASS gets trigger in summary format

- **Status:** passed
- **Duration:** 218ms
- **Command:** `xano trigger get 20 -p mcp-server -w 40`
- **Output:**
```json
Trigger: test_trigger_phase3_1768124655185
ID: 20
GUID: cxcLb8rPnKE4bQjvPMIb73NttXQ
```

#### Edit Trigger

##### PASS edits trigger using XanoScript file

- **Status:** passed
- **Duration:** 383ms
- **Command:** `xano trigger edit 20 -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-trigger-edit-1768124673695.xs`
- **Output:**
```json
Trigger updated successfully!
ID: 20
Name: test_trigger_phase3_1768124655185
```

#### Trigger Security

##### PASS clears trigger security

- **Status:** passed
- **Duration:** 351ms
- **Command:** `xano trigger security 20 -p mcp-server -w 40 --clear`
- **Output:**
```json
Trigger security cleared (no API group restriction)
ID: 20
Name: test_trigger_phase3_1768124655185
```

#### Delete Trigger

##### PASS deletes the test trigger

- **Status:** passed
- **Duration:** 160ms
- **Command:** `xano trigger delete 20 -p mcp-server -w 40 --force`
- **Output:**
```json
Trigger deleted successfully!
```

### Table Trigger Commands

#### Setup Test Table

##### PASS creates a table for table trigger tests

- **Status:** passed
- **Duration:** 298ms
- **Command:** `xano table create -p mcp-server -w 40 --name trigger_test_table_phase3_1768124655185 --description "Table for trigger tests" -o json`
- **Output:**
```json
{
  "id": 604,
  "created_at": "2026-01-11 09:44:34+0000",
  "updated_at": "2026-01-11 09:44:34+0000",
  "name": "trigger_test_table_phase3_1768124655185",
  "description": "Table for trigger tests",
  "docs": "",
  "guid": "leu7wsy3VhAojmVOb34r8W8IbCo",
  "auth": false,
  "tag": [],
  "autocomplete": [],
  "schema": [
    {
      "name": "id",
      "type": "int",
      "description": "",
      "nullable": false,
      "default": "",
      "required": true,
      "access": "public",
      "styl... (truncated)
```

#### Create Table Trigger

##### PASS creates a table trigger from XanoScript

- **Status:** passed
- **Duration:** 483ms
- **Command:** `xano table trigger create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-table-trigger-1768124674887.xs -o json`
- **Output:**
```json
{
  "id": 21,
  "created_at": "2026-01-11 09:44:35+0000",
  "updated_at": "2026-01-11 09:44:35+0000",
  "name": "test_table_trigger_phase3_1768124655185",
  "description": "",
  "guid": "Bp5KJGkLyu3PepfXaMgN1MY1DNw",
  "branch": "v1",
  "table_id": 604,
  "tag": [],
  "actions": {
    "delete": false,
    "insert": true,
    "truncate": false,
    "update": false
  },
  "datasources": [],
  "draft_updated_at": null,
  "xanoscript": null,
  "input": []
}
```

#### List Table Triggers

##### PASS lists table triggers in JSON format

- **Status:** passed
- **Duration:** 304ms
- **Command:** `xano table trigger list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 21,
    "created_at": "2026-01-11 09:44:35+0000",
    "updated_at": "2026-01-11 09:44:35+0000",
    "name": "test_table_trigger_phase3_1768124655185",
    "description": "",
    "guid": "Bp5KJGkLyu3PepfXaMgN1MY1DNw",
    "branch": "v1",
    "table_id": 604,
    "tag": [],
    "actions": {
      "delete": false,
      "insert": true,
      "truncate": false,
      "update": false
    },
    "datasources": [],
    "draft_updated_at": null,
    "xanoscript": null
  }
]
```

##### PASS lists table triggers in summary format

- **Status:** passed
- **Duration:** 238ms
- **Command:** `xano table trigger list -p mcp-server -w 40`
- **Output:**
```json
Available table triggers:
  - test_table_trigger_phase3_1768124655185 (ID: 21, table: 604, event: undefined)
```

#### Get Table Trigger

##### PASS gets table trigger details in JSON format

- **Status:** passed
- **Duration:** 231ms
- **Command:** `xano table trigger get 21 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 21,
  "created_at": "2026-01-11 09:44:35+0000",
  "updated_at": "2026-01-11 09:44:35+0000",
  "name": "test_table_trigger_phase3_1768124655185",
  "description": "",
  "guid": "Bp5KJGkLyu3PepfXaMgN1MY1DNw",
  "branch": "v1",
  "table_id": 604,
  "tag": [],
  "actions": {
    "delete": false,
    "insert": true,
    "truncate": false,
    "update": false
  },
  "datasources": [],
  "draft_updated_at": null,
  "xanoscript": null,
  "input": []
}
```

##### PASS gets table trigger in summary format

- **Status:** passed
- **Duration:** 221ms
- **Command:** `xano table trigger get 21 -p mcp-server -w 40`
- **Output:**
```json
Table Trigger: test_table_trigger_phase3_1768124655185
ID: 21
Table ID: 604
Event: undefined
GUID: Bp5KJGkLyu3PepfXaMgN1MY1DNw
```

#### Edit Table Trigger

##### PASS edits table trigger using XanoScript file

- **Status:** passed
- **Duration:** 404ms
- **Command:** `xano table trigger edit 21 -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-table-trigger-edit-1768124676365.xs`
- **Output:**
```json
Table trigger updated successfully!
ID: 21
Name: test_table_trigger_phase3_1768124655185
```

#### Table Trigger Security

##### PASS clears table trigger security

- **Status:** passed
- **Duration:** 314ms
- **Command:** `xano table trigger security 21 -p mcp-server -w 40 --clear`
- **Output:**
```json
Table trigger security cleared (no API group restriction)
ID: 21
Name: test_table_trigger_phase3_1768124655185
```

#### Delete Table Trigger

##### PASS deletes the test table trigger

- **Status:** passed
- **Duration:** 151ms
- **Command:** `xano table trigger delete 21 -p mcp-server -w 40 --force`
- **Output:**
```json
Table trigger deleted successfully!
```

#### Cleanup Test Table

##### PASS deletes the test table

- **Status:** passed
- **Duration:** 315ms
- **Command:** `xano table delete 604 -p mcp-server -w 40 --force`
- **Output:**
```json
Table deleted successfully!
```

