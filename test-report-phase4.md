# Phase 4 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T11:30:43.274Z |
| **Total Duration** | 32.09s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 16 |
| **Passed** | 16 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Setup > Create Test Table > creates a table for content tests | 275ms |
| PASS | Table Content Commands > Create Record > creates a record in the table | 115ms |
| PASS | Table Content Commands > List Records > lists records in JSON format | 89ms |
| PASS | Table Content Commands > List Records > lists records in summary format | 86ms |
| PASS | Table Content Commands > Get Record > gets record details in JSON format | 81ms |
| PASS | Table Content Commands > Edit Record > updates a record | 85ms |
| PASS | Table Content Commands > Bulk Create Records > bulk creates multiple records | 86ms |
| PASS | Table Content Commands > Bulk Delete Records > bulk deletes multiple records | 80ms |
| PASS | Table Content Commands > Delete Record > deletes the test record | 80ms |
| PASS | Table Schema Commands > Get Schema > gets table schema | 84ms |
| PASS | Table Schema Commands > Add Column > adds a text column to the schema | 230ms |
| PASS | Table Schema Commands > Get Column > gets column details | 118ms |
| PASS | Table Schema Commands > Rename Column > renames a column | 177ms |
| PASS | Table Schema Commands > Delete Column > deletes a column | 283ms |
| PASS | Table Index Commands > List Indexes > lists table indexes | 118ms |
| PASS | Cleanup > Delete Test Table > deletes the test table | 245ms |

---

## Detailed Results

### Setup

#### Create Test Table

##### PASS creates a table for content tests

- **Status:** passed
- **Duration:** 275ms
- **Command:** `xano table create -p mcp-server -w 40 --name content_test_phase4_1768131011184 --description "Table for content tests" -o json`
- **Output:**
```json
{
  "id": 619,
  "created_at": "2026-01-11 11:30:41+0000",
  "updated_at": "2026-01-11 11:30:41+0000",
  "name": "content_test_phase4_1768131011184",
  "description": "Table for content tests",
  "docs": "",
  "guid": "VuP7UDpl5cuzKFzVLCmfc_r1Eyc",
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
- **Duration:** 115ms
- **Command:** `xano table content create 619 -p mcp-server -w 40 --data {"id":99} -o json`
- **Output:**
```json
{
  "id": 99,
  "created_at": 1768131041471
}
```

#### List Records

##### PASS lists records in JSON format

- **Status:** passed
- **Duration:** 89ms
- **Command:** `xano table content list 619 -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 99,
    "created_at": 1768131041471
  }
]
```

##### PASS lists records in summary format

- **Status:** passed
- **Duration:** 86ms
- **Command:** `xano table content list 619 -p mcp-server -w 40`
- **Output:**
```json
Records in table:
  - ID: 99

Total: 1 records
```

#### Get Record

##### PASS gets record details in JSON format

- **Status:** passed
- **Duration:** 81ms
- **Command:** `xano table content get 619 99 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 99,
  "created_at": 1768131041471
}
```

#### Edit Record

##### PASS updates a record

- **Status:** passed
- **Duration:** 85ms
- **Command:** `xano table content edit 619 99 -p mcp-server -w 40 --data {"id":99}`
- **Output:**
```json
Record updated successfully!
ID: 99
```

#### Bulk Create Records

##### PASS bulk creates multiple records

- **Status:** passed
- **Duration:** 86ms
- **Command:** `xano table content bulk-create 619 -p mcp-server -w 40 --data [{"id":100},{"id":101}] -o json`
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
- **Duration:** 80ms
- **Command:** `xano table content bulk-delete 619 -p mcp-server -w 40 --ids 100,101 --force`
- **Output:**
```json
2 records deleted successfully!
```

#### Delete Record

##### PASS deletes the test record

- **Status:** passed
- **Duration:** 80ms
- **Command:** `xano table content delete 619 99 -p mcp-server -w 40 --force`
- **Output:**
```json
Record deleted successfully!
```

### Table Schema Commands

#### Get Schema

##### PASS gets table schema

- **Status:** passed
- **Duration:** 84ms
- **Command:** `xano table schema get 619 -p mcp-server -w 40 -o json`
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
- **Duration:** 230ms
- **Command:** `xano table schema column add 619 -p mcp-server -w 40 --type text --name test_column`
- **Output:**
```json
Column 'test_column' added successfully!
```

#### Get Column

##### PASS gets column details

- **Status:** passed
- **Duration:** 118ms
- **Command:** `xano table schema column get 619 test_column -p mcp-server -w 40`
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
- **Duration:** 177ms
- **Command:** `xano table schema column rename 619 -p mcp-server -w 40 --old-name test_column --new-name renamed_column`
- **Output:**
```json
Column renamed from 'test_column' to 'renamed_column' successfully!
```

#### Delete Column

##### PASS deletes a column

- **Status:** passed
- **Duration:** 283ms
- **Command:** `xano table schema column delete 619 renamed_column -p mcp-server -w 40 --force`
- **Output:**
```json
Column 'renamed_column' deleted successfully!
```

### Table Index Commands

#### List Indexes

##### PASS lists table indexes

- **Status:** passed
- **Duration:** 118ms
- **Command:** `xano table index list 619 -p mcp-server -w 40 -o json`
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
- **Duration:** 245ms
- **Command:** `xano table delete 619 -p mcp-server -w 40 --force`
- **Output:**
```json
Table deleted successfully!
```

