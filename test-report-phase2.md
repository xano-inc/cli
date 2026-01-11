# Phase 2 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T09:24:22.866Z |
| **Total Duration** | 16.67s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 28 |
| **Passed** | 23 |
| **Failed** | 0 |
| **Skipped** | 5 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Middleware Commands > Create Middleware > creates a middleware from XanoScript | 382ms |
| PASS | Middleware Commands > List Middleware > lists middleware in JSON format | 323ms |
| PASS | Middleware Commands > List Middleware > lists middleware in summary format | 270ms |
| PASS | Middleware Commands > Get Middleware > gets middleware details in JSON format | 241ms |
| PASS | Middleware Commands > Get Middleware > gets middleware in summary format | 222ms |
| PASS | Middleware Commands > Edit Middleware > edits middleware description | 415ms |
| PASS | Middleware Commands > Middleware Security > clears middleware security | 333ms |
| PASS | Middleware Commands > Delete Middleware > deletes the test middleware | 394ms |
| PASS | Task Commands > Create Task > creates a task from XanoScript | 448ms |
| PASS | Task Commands > List Tasks > lists tasks in JSON format | 341ms |
| PASS | Task Commands > List Tasks > lists tasks in summary format | 233ms |
| PASS | Task Commands > Get Task > gets task details in JSON format | 243ms |
| PASS | Task Commands > Get Task > gets task in summary format | 226ms |
| PASS | Task Commands > Edit Task > edits task description | 584ms |
| PASS | Task Commands > Task Security > clears task security | 375ms |
| PASS | Task Commands > Delete Task > deletes the test task | 397ms |
| PASS | Addon Commands > List Addons > lists addons in JSON format | 179ms |
| PASS | Addon Commands > List Addons > lists addons in summary format | 106ms |
| SKIP | Addon Commands > Get Addon > gets addon details in JSON format | 1ms |
| SKIP | Addon Commands > Get Addon > gets addon in summary format | 0ms |
| SKIP | Addon Commands > Edit Addon > edits addon with XanoScript | 0ms |
| SKIP | Addon Commands > Addon Security > clears addon security | 0ms |
| SKIP | Addon Commands > Delete Addon > deletes the test addon | 0ms |
| PASS | Datasource Commands > Create Datasource > creates a datasource | 652ms |
| PASS | Datasource Commands > List Datasources > lists datasources in JSON format | 104ms |
| PASS | Datasource Commands > List Datasources > lists datasources in summary format | 83ms |
| PASS | Datasource Commands > Edit Datasource > edits datasource color | 97ms |
| PASS | Datasource Commands > Delete Datasource > deletes the test datasource | 284ms |

---

## Detailed Results

### Middleware Commands

#### Create Middleware

##### PASS creates a middleware from XanoScript

- **Status:** passed
- **Duration:** 382ms
- **Command:** `xano middleware create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-mw-1768123455925.xs -o json`
- **Output:**
```json
{
  "id": 7,
  "created_at": "2026-01-11 09:24:16+0000",
  "updated_at": "2026-01-11 09:24:16+0000",
  "name": "test_mw_phase2_1768123446192",
  "description": "",
  "guid": "XyPzUEYoK8fTeIMkMM-sQYZupYo",
  "branch": "v1",
  "input": [
    {
      "name": "vars",
      "type": "json",
      "description": "",
      "nullable": false,
      "default": "",
      "required": false,
      "access": "public",
      "style": "single"
    },
    {
      "name": "type",
      "type": "enum",
      "desc... (truncated)
```

#### List Middleware

##### PASS lists middleware in JSON format

- **Status:** passed
- **Duration:** 323ms
- **Command:** `xano middleware list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 7,
    "created_at": "2026-01-11 09:24:16+0000",
    "updated_at": "2026-01-11 09:24:16+0000",
    "name": "test_mw_phase2_1768123446192",
    "description": "",
    "guid": "XyPzUEYoK8fTeIMkMM-sQYZupYo",
    "branch": "v1",
    "input": [
      {
        "name": "vars",
        "type": "json",
        "description": "",
        "nullable": false,
        "default": "",
        "required": false,
        "access": "public",
        "style": "single"
      },
      {
        "name... (truncated)
```

##### PASS lists middleware in summary format

- **Status:** passed
- **Duration:** 270ms
- **Command:** `xano middleware list -p mcp-server -w 40`
- **Output:**
```json
Available middleware:
  - test_mw_phase2_1768123446192 (ID: 7)
```

#### Get Middleware

##### PASS gets middleware details in JSON format

- **Status:** passed
- **Duration:** 241ms
- **Command:** `xano middleware get 7 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 7,
  "created_at": "2026-01-11 09:24:16+0000",
  "updated_at": "2026-01-11 09:24:16+0000",
  "name": "test_mw_phase2_1768123446192",
  "description": "",
  "guid": "XyPzUEYoK8fTeIMkMM-sQYZupYo",
  "branch": "v1",
  "input": [
    {
      "name": "vars",
      "type": "json",
      "description": "",
      "nullable": false,
      "default": "",
      "required": false,
      "access": "public",
      "style": "single"
    },
    {
      "name": "type",
      "type": "enum",
      "desc... (truncated)
```

##### PASS gets middleware in summary format

- **Status:** passed
- **Duration:** 222ms
- **Command:** `xano middleware get 7 -p mcp-server -w 40`
- **Output:**
```json
Middleware: test_mw_phase2_1768123446192
ID: 7
GUID: XyPzUEYoK8fTeIMkMM-sQYZupYo
```

#### Edit Middleware

##### PASS edits middleware description

- **Status:** passed
- **Duration:** 415ms
- **Command:** `xano middleware edit 7 -p mcp-server -w 40 --description "Updated by test"`
- **Output:**
```json
Middleware updated successfully!
ID: 7
Name: test_mw_phase2_1768123446192
```

#### Middleware Security

##### PASS clears middleware security

- **Status:** passed
- **Duration:** 333ms
- **Command:** `xano middleware security 7 -p mcp-server -w 40 --clear`
- **Output:**
```json
Middleware security cleared (no API group restriction)
ID: 7
Name: test_mw_phase2_1768123446192
```

#### Delete Middleware

##### PASS deletes the test middleware

- **Status:** passed
- **Duration:** 394ms
- **Command:** `xano middleware delete 7 -p mcp-server -w 40 --force`
- **Output:**
```json
Middleware deleted successfully!
```

### Task Commands

#### Create Task

##### PASS creates a task from XanoScript

- **Status:** passed
- **Duration:** 448ms
- **Command:** `xano task create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-task-1768123458508.xs -o json`
- **Output:**
```json
{
  "id": 8,
  "created_at": "2026-01-11 09:24:18+0000",
  "updated_at": "2026-01-11 09:24:18+0000",
  "name": "test_task_phase2_1768123446192",
  "description": "",
  "docs": "",
  "guid": "4IYwO2wLe8pDfx22FL1Td0hWm2Q",
  "datasource": "",
  "active": true,
  "branch": "v1",
  "tag": [],
  "draft_updated_at": null,
  "xanoscript": null
}
```

#### List Tasks

##### PASS lists tasks in JSON format

- **Status:** passed
- **Duration:** 341ms
- **Command:** `xano task list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 8,
    "created_at": "2026-01-11 09:24:18+0000",
    "updated_at": "2026-01-11 09:24:18+0000",
    "name": "test_task_phase2_1768123446192",
    "description": "",
    "docs": "",
    "guid": "4IYwO2wLe8pDfx22FL1Td0hWm2Q",
    "datasource": "",
    "active": true,
    "branch": "v1",
    "tag": [],
    "draft_updated_at": null,
    "xanoscript": null
  }
]
```

##### PASS lists tasks in summary format

- **Status:** passed
- **Duration:** 233ms
- **Command:** `xano task list -p mcp-server -w 40`
- **Output:**
```json
Available tasks:
  - test_task_phase2_1768123446192 (ID: 8)
```

#### Get Task

##### PASS gets task details in JSON format

- **Status:** passed
- **Duration:** 243ms
- **Command:** `xano task get 8 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 8,
  "created_at": "2026-01-11 09:24:18+0000",
  "updated_at": "2026-01-11 09:24:18+0000",
  "name": "test_task_phase2_1768123446192",
  "description": "",
  "docs": "",
  "guid": "4IYwO2wLe8pDfx22FL1Td0hWm2Q",
  "datasource": "",
  "active": true,
  "branch": "v1",
  "tag": [],
  "draft_updated_at": null,
  "xanoscript": null
}
```

##### PASS gets task in summary format

- **Status:** passed
- **Duration:** 226ms
- **Command:** `xano task get 8 -p mcp-server -w 40`
- **Output:**
```json
Task: test_task_phase2_1768123446192
ID: 8
GUID: 4IYwO2wLe8pDfx22FL1Td0hWm2Q
```

#### Edit Task

##### PASS edits task description

- **Status:** passed
- **Duration:** 584ms
- **Command:** `xano task edit 8 -p mcp-server -w 40 --description "Updated by test"`
- **Output:**
```json
Task updated successfully!
ID: 8
Name: test_task_phase2_1768123446192
```

#### Task Security

##### PASS clears task security

- **Status:** passed
- **Duration:** 375ms
- **Command:** `xano task security 8 -p mcp-server -w 40 --clear`
- **Output:**
```json
Task security cleared (no API group restriction)
ID: 8
Name: test_task_phase2_1768123446192
```

#### Delete Task

##### PASS deletes the test task

- **Status:** passed
- **Duration:** 397ms
- **Command:** `xano task delete 8 -p mcp-server -w 40 --force`
- **Output:**
```json
Task deleted successfully!
```

### Addon Commands

#### List Addons

##### PASS lists addons in JSON format

- **Status:** passed
- **Duration:** 179ms
- **Command:** `xano addon list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]
```

##### PASS lists addons in summary format

- **Status:** passed
- **Duration:** 106ms
- **Command:** `xano addon list -p mcp-server -w 40`
- **Output:**
```json
No addons found
```

#### Get Addon

##### SKIP gets addon details in JSON format

- **Status:** skipped
- **Duration:** 1ms

##### SKIP gets addon in summary format

- **Status:** skipped
- **Duration:** 0ms

#### Edit Addon

##### SKIP edits addon with XanoScript

- **Status:** skipped
- **Duration:** 0ms

#### Addon Security

##### SKIP clears addon security

- **Status:** skipped
- **Duration:** 0ms

#### Delete Addon

##### SKIP deletes the test addon

- **Status:** skipped
- **Duration:** 0ms

### Datasource Commands

#### Create Datasource

##### PASS creates a datasource

- **Status:** passed
- **Duration:** 652ms
- **Command:** `xano datasource create -p mcp-server -w 40 --label test_ds_phase2_1768123446192 --color "#e74c3c" -o json`
- **Output:**
```json
{
  "color": "#e74c3c",
  "label": "test_ds_phase2_1768123446192"
}
```

#### List Datasources

##### PASS lists datasources in JSON format

- **Status:** passed
- **Duration:** 104ms
- **Command:** `xano datasource list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "color": "#008000",
    "label": "live"
  },
  {
    "color": "#fff3cd",
    "label": "test"
  },
  {
    "color": "#e74c3c",
    "label": "test_ds_phase2_1768123446192"
  }
]
```

##### PASS lists datasources in summary format

- **Status:** passed
- **Duration:** 83ms
- **Command:** `xano datasource list -p mcp-server -w 40`
- **Output:**
```json
Available datasources:
  - live [#008000]
  - test [#fff3cd]
  - test_ds_phase2_1768123446192 [#e74c3c]
```

#### Edit Datasource

##### PASS edits datasource color

- **Status:** passed
- **Duration:** 97ms
- **Command:** `xano datasource edit test_ds_phase2_1768123446192 -p mcp-server -w 40 --color "#3498db"`
- **Output:**
```json
Datasource updated successfully!
Label: test_ds_phase2_1768123446192
Color: #3498db
```

#### Delete Datasource

##### PASS deletes the test datasource

- **Status:** passed
- **Duration:** 284ms
- **Command:** `xano datasource delete test_ds_phase2_1768123446192 -p mcp-server -w 40 --force`
- **Output:**
```json
Datasource deleted successfully!
```

