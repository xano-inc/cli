# Phase 3 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T09:37:34.793Z |
| **Total Duration** | 7.98s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 18 |
| **Passed** | 6 |
| **Failed** | 2 |
| **Skipped** | 10 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| FAIL | Workspace Trigger Commands > Create Trigger > creates a workspace trigger from XanoScript | 5.80s |
| PASS | Workspace Trigger Commands > List Triggers > lists triggers in JSON format | 304ms |
| PASS | Workspace Trigger Commands > List Triggers > lists triggers in summary format | 247ms |
| SKIP | Workspace Trigger Commands > Get Trigger > gets trigger details in JSON format | 1ms |
| SKIP | Workspace Trigger Commands > Get Trigger > gets trigger in summary format | 0ms |
| SKIP | Workspace Trigger Commands > Edit Trigger > edits trigger description | 0ms |
| SKIP | Workspace Trigger Commands > Trigger Security > clears trigger security | 1ms |
| SKIP | Workspace Trigger Commands > Delete Trigger > deletes the test trigger | 0ms |
| PASS | Table Trigger Commands > Setup Test Table > creates a table for table trigger tests | 231ms |
| FAIL | Table Trigger Commands > Create Table Trigger > creates a table trigger from XanoScript | 473ms |
| PASS | Table Trigger Commands > List Table Triggers > lists table triggers in JSON format | 273ms |
| PASS | Table Trigger Commands > List Table Triggers > lists table triggers in summary format | 253ms |
| SKIP | Table Trigger Commands > Get Table Trigger > gets table trigger details in JSON format | 0ms |
| SKIP | Table Trigger Commands > Get Table Trigger > gets table trigger in summary format | 1ms |
| SKIP | Table Trigger Commands > Edit Table Trigger > edits table trigger description | 0ms |
| SKIP | Table Trigger Commands > Table Trigger Security > clears table trigger security | 0ms |
| SKIP | Table Trigger Commands > Delete Table Trigger > deletes the test table trigger | 0ms |
| PASS | Table Trigger Commands > Cleanup Test Table > deletes the test table | 294ms |

---

## Detailed Results

### Workspace Trigger Commands

#### Create Trigger

##### FAIL creates a workspace trigger from XanoScript

- **Status:** failed
- **Duration:** 5.80s
- **Command:** `xano trigger create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-trigger-1768124246906.xs -o json`
- **Error:**
```
API request failed with status 400: Bad Request
{"code":"ERROR_CODE_SYNTAX_ERROR","message":"Syntax error: unexpected \u0027trigger\u0027","payload":{"char":0,"line":0,"col":0,"error_line":"trigger test_trigger_phase3_1768124246812 {","error_snippet":"trigger test_trigger_phase3_1768124246812 {"}}
```

#### List Triggers

##### PASS lists triggers in JSON format

- **Status:** passed
- **Duration:** 304ms
- **Command:** `xano trigger list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]
```

##### PASS lists triggers in summary format

- **Status:** passed
- **Duration:** 247ms
- **Command:** `xano trigger list -p mcp-server -w 40`
- **Output:**
```json
No triggers found
```

#### Get Trigger

##### SKIP gets trigger details in JSON format

- **Status:** skipped
- **Duration:** 1ms

##### SKIP gets trigger in summary format

- **Status:** skipped
- **Duration:** 0ms

#### Edit Trigger

##### SKIP edits trigger description

- **Status:** skipped
- **Duration:** 0ms

#### Trigger Security

##### SKIP clears trigger security

- **Status:** skipped
- **Duration:** 1ms

#### Delete Trigger

##### SKIP deletes the test trigger

- **Status:** skipped
- **Duration:** 0ms

### Table Trigger Commands

#### Setup Test Table

##### PASS creates a table for table trigger tests

- **Status:** passed
- **Duration:** 231ms
- **Command:** `xano table create -p mcp-server -w 40 --name trigger_test_table_phase3_1768124246812 --description "Table for trigger tests" -o json`
- **Output:**
```json
{
  "id": 599,
  "created_at": "2026-01-11 09:37:33+0000",
  "updated_at": "2026-01-11 09:37:33+0000",
  "name": "trigger_test_table_phase3_1768124246812",
  "description": "Table for trigger tests",
  "docs": "",
  "guid": "AbyCnHyez3Vuy5PJolyh88CsDfY",
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

##### FAIL creates a table trigger from XanoScript

- **Status:** failed
- **Duration:** 473ms
- **Command:** `xano table trigger create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-table-trigger-1768124253498.xs -o json`
- **Error:**
```
API request failed with status 400: Bad Request
{"code":"ERROR_CODE_SYNTAX_ERROR","message":"Syntax error: unexpected \u0027trigger\u0027","payload":{"char":0,"line":0,"col":0,"error_line":"trigger test_table_trigger_phase3_1768124246812 table=599 event=insert {","error_snippet":"trigger test_table_trigger_phase3_1768124246812 table=599 event=insert {"}}
```

#### List Table Triggers

##### PASS lists table triggers in JSON format

- **Status:** passed
- **Duration:** 273ms
- **Command:** `xano table trigger list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]
```

##### PASS lists table triggers in summary format

- **Status:** passed
- **Duration:** 253ms
- **Command:** `xano table trigger list -p mcp-server -w 40`
- **Output:**
```json
No table triggers found
```

#### Get Table Trigger

##### SKIP gets table trigger details in JSON format

- **Status:** skipped
- **Duration:** 0ms

##### SKIP gets table trigger in summary format

- **Status:** skipped
- **Duration:** 1ms

#### Edit Table Trigger

##### SKIP edits table trigger description

- **Status:** skipped
- **Duration:** 0ms

#### Table Trigger Security

##### SKIP clears table trigger security

- **Status:** skipped
- **Duration:** 0ms

#### Delete Table Trigger

##### SKIP deletes the test table trigger

- **Status:** skipped
- **Duration:** 0ms

#### Cleanup Test Table

##### PASS deletes the test table

- **Status:** passed
- **Duration:** 294ms
- **Command:** `xano table delete 599 -p mcp-server -w 40 --force`
- **Output:**
```json
Table deleted successfully!
```

