# Phase 4 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T09:58:38.661Z |
| **Total Duration** | 7.29s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 16 |
| **Passed** | 16 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Setup > Create Test Table > creates a table for content tests | 5.20s |
| PASS | Table Content Commands > Create Record > creates a record in the table | 163ms |
| PASS | Table Content Commands > List Records > lists records in JSON format | 87ms |
| PASS | Table Content Commands > List Records > lists records in summary format | 84ms |
| PASS | Table Content Commands > Get Record > gets record details in JSON format | 86ms |
| PASS | Table Content Commands > Edit Record > updates a record | 100ms |
| PASS | Table Content Commands > Bulk Create Records > bulk creates multiple records | 94ms |
| PASS | Table Content Commands > Bulk Delete Records > bulk deletes multiple records | 86ms |
| PASS | Table Content Commands > Delete Record > deletes the test record | 80ms |
| PASS | Table Schema Commands > Get Schema > gets table schema | 91ms |
| PASS | Table Schema Commands > Add Column > adds a text column to the schema | 228ms |
| PASS | Table Schema Commands > Get Column > gets column details | 127ms |
| PASS | Table Schema Commands > Rename Column > renames a column | 160ms |
| PASS | Table Schema Commands > Delete Column > deletes a column | 255ms |
| PASS | Table Index Commands > List Indexes > lists table indexes | 139ms |
| PASS | Cleanup > Delete Test Table > deletes the test table | 216ms |

---

## Detailed Results

### Setup

#### Create Test Table

##### PASS creates a table for content tests

- **Status:** passed
- **Duration:** 5.20s
- **Command:** `xano table create -p mcp-server -w 40 --name content_test_phase4_1768125511369 --description "Table for content tests" -o json`
- **Output:**
```json
{
  "id": 616,
  "created_at": "2026-01-11 09:58:36+0000",
  "updated_at": "2026-01-11 09:58:36+0000",
  "name": "content_test_phase4_1768125511369",
  "description": "Table for content tests",
  "docs": "",
  "guid": "DROV_GCBQaIx7IjVLB5R49ppz8I",
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
      "style": "s... (truncated)
```

### Table Content Commands

#### Create Record

##### PASS creates a record in the table

- **Status:** passed
- **Duration:** 163ms
- **Command:** `xano table content create 616 -p mcp-server -w 40 --data {"id":99} -o json`
- **Output:**
```json
{
  "id": 99,
  "created_at": 1768125516860
}
```

#### List Records

##### PASS lists records in JSON format

- **Status:** passed
- **Duration:** 87ms
- **Command:** `xano table content list 616 -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 99,
    "created_at": 1768125516860
  }
]
```

##### PASS lists records in summary format

- **Status:** passed
- **Duration:** 84ms
- **Command:** `xano table content list 616 -p mcp-server -w 40`
- **Output:**
```json
Records in table:
  - ID: 99

Total: 1 records
```

#### Get Record

##### PASS gets record details in JSON format

- **Status:** passed
- **Duration:** 86ms
- **Command:** `xano table content get 616 99 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 99,
  "created_at": 1768125516860
}
```

#### Edit Record

##### PASS updates a record

- **Status:** passed
- **Duration:** 100ms
- **Command:** `xano table content edit 616 99 -p mcp-server -w 40 --data {"id":99}`
- **Output:**
```json
Record updated successfully!
ID: 99
```

#### Bulk Create Records

##### PASS bulk creates multiple records

- **Status:** passed
- **Duration:** 94ms
- **Command:** `xano table content bulk-create 616 -p mcp-server -w 40 --data [{"id":100},{"id":101}] -o json`
- **Output:**
```json
[
  100,
  101
]
```

#### Bulk Delete Records

##### PASS bulk deletes multiple records

- **Status:** passed
- **Duration:** 86ms
- **Command:** `xano table content bulk-delete 616 -p mcp-server -w 40 --ids 100,101 --force`
- **Output:**
```json
2 records deleted successfully!
```

#### Delete Record

##### PASS deletes the test record

- **Status:** passed
- **Duration:** 80ms
- **Command:** `xano table content delete 616 99 -p mcp-server -w 40 --force`
- **Output:**
```json
Record deleted successfully!
```

### Table Schema Commands

#### Get Schema

##### PASS gets table schema

- **Status:** passed
- **Duration:** 91ms
- **Command:** `xano table schema get 616 -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "name": "id",
    "type": "int",
    "description": "",
    "nullable": false,
    "default": "",
    "required": true,
    "access": "public",
    "style": "single"
  },
  {
    "name": "created_at",
    "type": "timestamp",
    "description": "",
    "nullable": false,
    "default": "now",
    "required": false,
    "access": "private",
    "style": "single"
  }
]
```

#### Add Column

##### PASS adds a text column to the schema

- **Status:** passed
- **Duration:** 228ms
- **Command:** `xano table schema column add 616 -p mcp-server -w 40 --type text --name test_column`
- **Output:**
```json
Column 'test_column' added successfully!
```

#### Get Column

##### PASS gets column details

- **Status:** passed
- **Duration:** 127ms
- **Command:** `xano table schema column get 616 test_column -p mcp-server -w 40`
- **Output:**
```json
Column: test_column
{
  "name": "test_column",
  "type": "text",
  "style": "single",
  "access": "public",
  "format": "",
  "default": "",
  "nullable": false,
  "required": false,
  "description": ""
}
```

#### Rename Column

##### PASS renames a column

- **Status:** passed
- **Duration:** 160ms
- **Command:** `xano table schema column rename 616 -p mcp-server -w 40 --old-name test_column --new-name renamed_column`
- **Output:**
```json
Column renamed from 'test_column' to 'renamed_column' successfully!
```

#### Delete Column

##### PASS deletes a column

- **Status:** passed
- **Duration:** 255ms
- **Command:** `xano table schema column delete 616 renamed_column -p mcp-server -w 40 --force`
- **Output:**
```json
Column 'renamed_column' deleted successfully!
```

### Table Index Commands

#### List Indexes

##### PASS lists table indexes

- **Status:** passed
- **Duration:** 139ms
- **Command:** `xano table index list 616 -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "type": "primary",
    "fields": [
      {
        "name": "id"
      }
    ],
    "id": "1339908e"
  },
  {
    "type": "btree",
    "fields": [
      {
        "name": "created_at",
        "op": "desc"
      }
    ],
    "id": "411a6c94"
  }
]
```

### Cleanup

#### Delete Test Table

##### PASS deletes the test table

- **Status:** passed
- **Duration:** 216ms
- **Command:** `xano table delete 616 -p mcp-server -w 40 --force`
- **Output:**
```json
Table deleted successfully!
```

