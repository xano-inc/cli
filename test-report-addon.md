# Addon Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T11:30:24.362Z |
| **Total Duration** | 13.47s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 16 |
| **Passed** | 16 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Test Approach

Addons always extend a specific existing table. This test suite:

1. **Creates a test table** (required dependency)
2. **Creates an addon** that extends the table
3. **Tests full lifecycle** - list, get, edit, security, delete
4. **Cleans up** - deletes addon first, then table

## Dependency Chain

```
Table (created first)
  └── Addon (extends the table)
        └── Can be used by Functions/APIs
```

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Phase 1: Setup Table Dependency > Create Test Table > creates a table for the addon to extend | 10.22s |
| PASS | Phase 2: Create Addon > Create Addon > creates an addon that extends the test table | 379ms |
| PASS | Phase 3: List and Get Addon > List Addons > lists addons in JSON format | 214ms |
| PASS | Phase 3: List and Get Addon > List Addons > lists addons in summary format | 115ms |
| PASS | Phase 3: List and Get Addon > List Addons > lists addons with search filter | 119ms |
| PASS | Phase 3: List and Get Addon > Get Addon > gets addon details in JSON format | 113ms |
| PASS | Phase 3: List and Get Addon > Get Addon > gets addon in summary format | 88ms |
| PASS | Phase 4: Edit Addon > Edit Addon > edits addon with updated XanoScript | 259ms |
| PASS | Phase 4: Edit Addon > Edit Addon > verifies addon was updated | 155ms |
| PASS | Phase 5: Addon Security > Security Operations > clears addon security | 182ms |
| PASS | Phase 6: Error Handling > Invalid Operations > handles get with non-existent addon ID | 109ms |
| PASS | Phase 6: Error Handling > Invalid Operations > handles create with invalid XanoScript | 332ms |
| PASS | Phase 6: Error Handling > Invalid Operations > handles create with missing file | 28ms |
| PASS | Phase 7: Cleanup > Delete Addon > deletes the test addon | 240ms |
| PASS | Phase 7: Cleanup > Delete Table Dependency > deletes the test table after addon is removed | 300ms |
| PASS | Phase 8: Verification > Verify Cleanup > verifies addon was deleted | 107ms |

---

## Detailed Results

### Phase 1: Setup Table Dependency

#### Create Test Table

##### PASS creates a table for the addon to extend

- **Status:** passed
- **Duration:** 10.22s

### Phase 2: Create Addon

#### Create Addon

##### PASS creates an addon that extends the test table

- **Status:** passed
- **Duration:** 379ms
- **Command:** `xano addon create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-addon-1768131021612.xs -o json`
- **Output:**
```json
{
  "id": 17,
  "created_at": "2026-01-11 11:30:21+0000",
  "updated_at": "2026-01-11 11:30:21+0000",
  "name": "test_addon_addon_test_1768131010892",
  "description": "",
  "guid": "6kZyx2l7hsYi_H5w8T74f1PdENo",
  "branch": "v1",
  "tag": [],
  "draft_updated_at": null,
  "xanoscript": null,
  "context": {
    "dbo": {
      "id": 617,
      "as": "addon_test_tbl_addon_test_1768131010892"
    },
    "bind": [],
    "search": {
      "expression": [
        {
          "type": "statement",
     ... (truncated)
```

### Phase 3: List and Get Addon

#### List Addons

##### PASS lists addons in JSON format

- **Status:** passed
- **Duration:** 214ms
- **Command:** `xano addon list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 17,
    "created_at": "2026-01-11 11:30:21+0000",
    "updated_at": "2026-01-11 11:30:21+0000",
    "name": "test_addon_addon_test_1768131010892",
    "description": "",
    "guid": "6kZyx2l7hsYi_H5w8T74f1PdENo",
    "branch": "v1",
    "tag": [],
    "draft_updated_at": null,
    "xanoscript": null,
    "context": {
      "dbo": {
        "id": 617,
        "as": "addon_test_tbl_addon_test_1768131010892"
      },
      "bind": [],
      "search": {
        "expression": [
      ... (truncated)
```

##### PASS lists addons in summary format

- **Status:** passed
- **Duration:** 115ms
- **Command:** `xano addon list -p mcp-server -w 40`
- **Output:**
```json
Available addons:
  - test_addon_addon_test_1768131010892 (ID: 17)
```

##### PASS lists addons with search filter

- **Status:** passed
- **Duration:** 119ms
- **Command:** `xano addon list -p mcp-server -w 40 --search test_addon -o json`
- **Output:**
```json
[
  {
    "id": 17,
    "created_at": "2026-01-11 11:30:21+0000",
    "updated_at": "2026-01-11 11:30:21+0000",
    "name": "test_addon_addon_test_1768131010892",
    "description": "",
    "guid": "6kZyx2l7hsYi_H5w8T74f1PdENo",
    "branch": "v1",
    "tag": [],
    "draft_updated_at": null,
    "xanoscript": null,
    "context": {
      "dbo": {
        "id": 617,
        "as": "addon_test_tbl_addon_test_1768131010892"
      },
      "bind": [],
      "search": {
        "expression": [
      ... (truncated)
```

#### Get Addon

##### PASS gets addon details in JSON format

- **Status:** passed
- **Duration:** 113ms
- **Command:** `xano addon get 17 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 17,
  "created_at": "2026-01-11 11:30:21+0000",
  "updated_at": "2026-01-11 11:30:21+0000",
  "name": "test_addon_addon_test_1768131010892",
  "description": "",
  "guid": "6kZyx2l7hsYi_H5w8T74f1PdENo",
  "branch": "v1",
  "tag": [],
  "draft_updated_at": null,
  "xanoscript": null,
  "context": {
    "dbo": {
      "id": 617,
      "as": "addon_test_tbl_addon_test_1768131010892"
    },
    "bind": [],
    "search": {
      "expression": [
        {
          "type": "statement",
     ... (truncated)
```

##### PASS gets addon in summary format

- **Status:** passed
- **Duration:** 88ms
- **Command:** `xano addon get 17 -p mcp-server -w 40`
- **Output:**
```json
Addon: test_addon_addon_test_1768131010892
ID: 17
GUID: 6kZyx2l7hsYi_H5w8T74f1PdENo
```

### Phase 4: Edit Addon

#### Edit Addon

##### PASS edits addon with updated XanoScript

- **Status:** passed
- **Duration:** 259ms
- **Command:** `xano addon edit 17 -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-addon-edit-1768131022640.xs`
- **Output:**
```json
Addon updated successfully!
ID: 17
Name: test_addon_addon_test_1768131010892
```

##### PASS verifies addon was updated

- **Status:** passed
- **Duration:** 155ms
- **Command:** `xano addon get 17 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 17,
  "created_at": "2026-01-11 11:30:21+0000",
  "updated_at": "2026-01-11 11:30:22+0000",
  "name": "test_addon_addon_test_1768131010892",
  "description": "",
  "guid": "6kZyx2l7hsYi_H5w8T74f1PdENo",
  "branch": "v1",
  "tag": [],
  "draft_updated_at": null,
  "xanoscript": null,
  "context": {
    "dbo": {
      "id": 617,
      "as": "addon_test_tbl_addon_test_1768131010892"
    },
    "bind": [],
    "search": {
      "expression": [
        {
          "type": "statement",
     ... (truncated)
```

### Phase 5: Addon Security

#### Security Operations

##### PASS clears addon security

- **Status:** passed
- **Duration:** 182ms
- **Command:** `xano addon security 17 -p mcp-server -w 40 --clear`
- **Output:**
```json
Addon security cleared (no API group restriction)
ID: 17
Name: test_addon_addon_test_1768131010892
```

### Phase 6: Error Handling

#### Invalid Operations

##### PASS handles get with non-existent addon ID

- **Status:** passed
- **Duration:** 109ms
- **Command:** `xano addon get 999999999 -p mcp-server -w 40 -o json`
- **Error:**
```
API request failed with status 404: Not Found
{"code":"ERROR_CODE_NOT_FOUND","message":""}
```

##### PASS handles create with invalid XanoScript

- **Status:** passed
- **Duration:** 332ms
- **Command:** `xano addon create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-addon-invalid-1768131023351.xs -o json`
- **Error:**
```
API request failed with status 400: Bad Request
{"code":"ERROR_CODE_SYNTAX_ERROR","message":"Syntax error: unexpected \u0027invalid\u0027","payload":{"char":0,"line":0,"col":0,"error_line":"invalid xanoscript content {{{","error_snippet":"invalid xanoscript content {{{"}}
```

##### PASS handles create with missing file

- **Status:** passed
- **Duration:** 28ms
- **Command:** `xano addon create -p mcp-server -w 40 -f /nonexistent/path.xs -o json`
- **Error:**
```
File not found: /nonexistent/path.xs
```

### Phase 7: Cleanup

#### Delete Addon

##### PASS deletes the test addon

- **Status:** passed
- **Duration:** 240ms
- **Command:** `xano addon delete 17 -p mcp-server -w 40 --force`
- **Output:**
```json
Addon deleted successfully!
```

#### Delete Table Dependency

##### PASS deletes the test table after addon is removed

- **Status:** passed
- **Duration:** 300ms

### Phase 8: Verification

#### Verify Cleanup

##### PASS verifies addon was deleted

- **Status:** passed
- **Duration:** 107ms
- **Command:** `xano addon get 17 -p mcp-server -w 40 -o json`
- **Error:**
```
API request failed with status 404: Not Found
{"code":"ERROR_CODE_NOT_FOUND","message":""}
```

## Created Resources

| Resource Type | ID | Name |
|---------------|----|----- |
| Table (dependency) | 617 | addon_test_tbl_addon_test_1768131010892 |
| Addon | 17 | test_addon_addon_test_1768131010892 |
