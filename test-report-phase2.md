# Phase 2 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T11:30:35.646Z |
| **Total Duration** | 24.59s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 28 |
| **Passed** | 23 |
| **Failed** | 0 |
| **Skipped** | 5 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Middleware Commands > Create Middleware > creates a middleware from XanoScript | 375ms |
| PASS | Middleware Commands > List Middleware > lists middleware in JSON format | 326ms |
| PASS | Middleware Commands > List Middleware > lists middleware in summary format | 243ms |
| PASS | Middleware Commands > Get Middleware > gets middleware details in JSON format | 247ms |
| PASS | Middleware Commands > Get Middleware > gets middleware in summary format | 234ms |
| PASS | Middleware Commands > Edit Middleware > edits middleware description | 399ms |
| PASS | Middleware Commands > Middleware Security > clears middleware security | 353ms |
| PASS | Middleware Commands > Delete Middleware > deletes the test middleware | 398ms |
| PASS | Task Commands > Create Task > creates a task from XanoScript | 440ms |
| PASS | Task Commands > List Tasks > lists tasks in JSON format | 333ms |
| PASS | Task Commands > List Tasks > lists tasks in summary format | 265ms |
| PASS | Task Commands > Get Task > gets task details in JSON format | 253ms |
| PASS | Task Commands > Get Task > gets task in summary format | 229ms |
| PASS | Task Commands > Edit Task > edits task description | 528ms |
| PASS | Task Commands > Task Security > clears task security | 339ms |
| PASS | Task Commands > Delete Task > deletes the test task | 392ms |
| PASS | Addon Commands > List Addons > lists addons in JSON format | 192ms |
| PASS | Addon Commands > List Addons > lists addons in summary format | 137ms |
| SKIP | Addon Commands > Get Addon > gets addon details in JSON format | 0ms |
| SKIP | Addon Commands > Get Addon > gets addon in summary format | 0ms |
| SKIP | Addon Commands > Edit Addon > edits addon with XanoScript | 0ms |
| SKIP | Addon Commands > Addon Security > clears addon security | 0ms |
| SKIP | Addon Commands > Delete Addon > deletes the test addon | 0ms |
| PASS | Datasource Commands > Create Datasource > creates a datasource | 527ms |
| PASS | Datasource Commands > List Datasources > lists datasources in JSON format | 108ms |
| PASS | Datasource Commands > List Datasources > lists datasources in summary format | 111ms |
| PASS | Datasource Commands > Edit Datasource > edits datasource color | 104ms |
| PASS | Datasource Commands > Delete Datasource > deletes the test datasource | 258ms |

---

## Detailed Results

### Middleware Commands

#### Create Middleware

##### PASS creates a middleware from XanoScript

- **Status:** passed
- **Duration:** 375ms
- **Command:** `xano middleware create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-mw-1768131028849.xs -o json`
- **Output:**
```json
{
  "id": 9,
  "created_at": "2026-01-11 11:30:29+0000",
  "updated_at": "2026-01-11 11:30:29+0000",
  "name": "test_mw_phase2_1768131011058",
  "description": "",
  "guid": "oyIaE4pJfP6K-C9-cHoNhVk84Y4",
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
- **Duration:** 326ms
- **Command:** `xano middleware list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 9,
    "created_at": "2026-01-11 11:30:29+0000",
    "updated_at": "2026-01-11 11:30:29+0000",
    "name": "test_mw_phase2_1768131011058",
    "description": "",
    "guid": "oyIaE4pJfP6K-C9-cHoNhVk84Y4",
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
- **Duration:** 243ms
- **Command:** `xano middleware list -p mcp-server -w 40`
- **Output:**
```json
Available middleware:
  - test_mw_phase2_1768131011058 (ID: 9)
```

#### Get Middleware

##### PASS gets middleware details in JSON format

- **Status:** passed
- **Duration:** 247ms
- **Command:** `xano middleware get 9 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 9,
  "created_at": "2026-01-11 11:30:29+0000",
  "updated_at": "2026-01-11 11:30:29+0000",
  "name": "test_mw_phase2_1768131011058",
  "description": "",
  "guid": "oyIaE4pJfP6K-C9-cHoNhVk84Y4",
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
- **Duration:** 234ms
- **Command:** `xano middleware get 9 -p mcp-server -w 40`
- **Output:**
```json
Middleware: test_mw_phase2_1768131011058
ID: 9
GUID: oyIaE4pJfP6K-C9-cHoNhVk84Y4
```

#### Edit Middleware

##### PASS edits middleware description

- **Status:** passed
- **Duration:** 399ms
- **Command:** `xano middleware edit 9 -p mcp-server -w 40 --description "Updated by test"`
- **Output:**
```json
Middleware updated successfully!
ID: 9
Name: test_mw_phase2_1768131011058
```

#### Middleware Security

##### PASS clears middleware security

- **Status:** passed
- **Duration:** 353ms
- **Command:** `xano middleware security 9 -p mcp-server -w 40 --clear`
- **Output:**
```json
Middleware security cleared (no API group restriction)
ID: 9
Name: test_mw_phase2_1768131011058
```

#### Delete Middleware

##### PASS deletes the test middleware

- **Status:** passed
- **Duration:** 398ms
- **Command:** `xano middleware delete 9 -p mcp-server -w 40 --force`
- **Output:**
```json
Middleware deleted successfully!
```

### Task Commands

#### Create Task

##### PASS creates a task from XanoScript

- **Status:** passed
- **Duration:** 440ms
- **Command:** `xano task create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-task-1768131031424.xs -o json`
- **Output:**
```json
{
  "id": 10,
  "created_at": "2026-01-11 11:30:31+0000",
  "updated_at": "2026-01-11 11:30:31+0000",
  "name": "test_task_phase2_1768131011058",
  "description": "",
  "docs": "",
  "guid": "KonmV5FfJAhY0duArmSbtKSPMAs",
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
- **Duration:** 333ms
- **Command:** `xano task list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 10,
    "created_at": "2026-01-11 11:30:31+0000",
    "updated_at": "2026-01-11 11:30:31+0000",
    "name": "test_task_phase2_1768131011058",
    "description": "",
    "docs": "",
    "guid": "KonmV5FfJAhY0duArmSbtKSPMAs",
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
- **Duration:** 265ms
- **Command:** `xano task list -p mcp-server -w 40`
- **Output:**
```json
Available tasks:
  - test_task_phase2_1768131011058 (ID: 10)
```

#### Get Task

##### PASS gets task details in JSON format

- **Status:** passed
- **Duration:** 253ms
- **Command:** `xano task get 10 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 10,
  "created_at": "2026-01-11 11:30:31+0000",
  "updated_at": "2026-01-11 11:30:31+0000",
  "name": "test_task_phase2_1768131011058",
  "description": "",
  "docs": "",
  "guid": "KonmV5FfJAhY0duArmSbtKSPMAs",
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
- **Duration:** 229ms
- **Command:** `xano task get 10 -p mcp-server -w 40`
- **Output:**
```json
Task: test_task_phase2_1768131011058
ID: 10
GUID: KonmV5FfJAhY0duArmSbtKSPMAs
```

#### Edit Task

##### PASS edits task description

- **Status:** passed
- **Duration:** 528ms
- **Command:** `xano task edit 10 -p mcp-server -w 40 --description "Updated by test"`
- **Output:**
```json
Task updated successfully!
ID: 10
Name: test_task_phase2_1768131011058
```

#### Task Security

##### PASS clears task security

- **Status:** passed
- **Duration:** 339ms
- **Command:** `xano task security 10 -p mcp-server -w 40 --clear`
- **Output:**
```json
Task security cleared (no API group restriction)
ID: 10
Name: test_task_phase2_1768131011058
```

#### Delete Task

##### PASS deletes the test task

- **Status:** passed
- **Duration:** 392ms
- **Command:** `xano task delete 10 -p mcp-server -w 40 --force`
- **Output:**
```json
Task deleted successfully!
```

### Addon Commands

#### List Addons

##### PASS lists addons in JSON format

- **Status:** passed
- **Duration:** 192ms
- **Command:** `xano addon list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]
```

##### PASS lists addons in summary format

- **Status:** passed
- **Duration:** 137ms
- **Command:** `xano addon list -p mcp-server -w 40`
- **Output:**
```json
No addons found
```

#### Get Addon

##### SKIP gets addon details in JSON format

- **Status:** skipped
- **Duration:** 0ms

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
- **Duration:** 527ms
- **Command:** `xano datasource create -p mcp-server -w 40 --label test_ds_phase2_1768131011058 --color "#e74c3c" -o json`
- **Output:**
```json
{
  "color": "#e74c3c",
  "label": "test_ds_phase2_1768131011058"
}
```

#### List Datasources

##### PASS lists datasources in JSON format

- **Status:** passed
- **Duration:** 108ms
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
    "label": "test_ds_phase2_1768131011058"
  }
]
```

##### PASS lists datasources in summary format

- **Status:** passed
- **Duration:** 111ms
- **Command:** `xano datasource list -p mcp-server -w 40`
- **Output:**
```json
Available datasources:
  - live [#008000]
  - test [#fff3cd]
  - test_ds_phase2_1768131011058 [#e74c3c]
```

#### Edit Datasource

##### PASS edits datasource color

- **Status:** passed
- **Duration:** 104ms
- **Command:** `xano datasource edit test_ds_phase2_1768131011058 -p mcp-server -w 40 --color "#3498db"`
- **Output:**
```json
Datasource updated successfully!
Label: test_ds_phase2_1768131011058
Color: #3498db
```

#### Delete Datasource

##### PASS deletes the test datasource

- **Status:** passed
- **Duration:** 258ms
- **Command:** `xano datasource delete test_ds_phase2_1768131011058 -p mcp-server -w 40 --force`
- **Output:**
```json
Datasource deleted successfully!
```

