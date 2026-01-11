# Xano CLI Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T11:30:59.642Z |
| **Total Duration** | 48.26s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 46 |
| **Passed** | ✅ 46 |
| **Failed** | ❌ 0 |
| **Skipped** | ⏭️ 0 |

## Results Overview

| Status | Test | Duration |
|--------|------|----------|
| ✅ | Phase 1: Create Resources > Tables > creates a table with name and description | 199ms |
| ✅ | Phase 1: Create Resources > Tables > creates a table from XanoScript file | 331ms |
| ✅ | Phase 1: Create Resources > Tables > shows error when creating table without required fields | 27ms |
| ✅ | Phase 1: Create Resources > API Groups > creates an API group with swagger enabled | 240ms |
| ✅ | Phase 1: Create Resources > API Groups > shows error when creating API group without required fields | 26ms |
| ✅ | Phase 1: Create Resources > API Endpoints > creates a GET API endpoint | 335ms |
| ✅ | Phase 1: Create Resources > API Endpoints > creates a POST API endpoint | 331ms |
| ✅ | Phase 1: Create Resources > API Endpoints > shows error when creating API without verb | 29ms |
| ✅ | Phase 2: List Resources > Tables > lists tables in JSON format and finds created tables | 242ms |
| ✅ | Phase 2: List Resources > Tables > lists tables in summary format | 148ms |
| ✅ | Phase 2: List Resources > Tables > lists tables with search filter | 97ms |
| ✅ | Phase 2: List Resources > Tables > lists tables with pagination | 123ms |
| ✅ | Phase 2: List Resources > API Groups > lists API groups in JSON format | 243ms |
| ✅ | Phase 2: List Resources > API Groups > lists API groups in summary format | 178ms |
| ✅ | Phase 2: List Resources > API Endpoints > lists APIs in JSON format | 268ms |
| ✅ | Phase 2: List Resources > API Endpoints > lists APIs in summary format | 232ms |
| ✅ | Phase 3: Get Individual Resources > Tables > gets table details in JSON format | 102ms |
| ✅ | Phase 3: Get Individual Resources > Tables > gets table details in summary format | 80ms |
| ✅ | Phase 3: Get Individual Resources > Tables > gets table as XanoScript | 137ms |
| ✅ | Phase 3: Get Individual Resources > Tables > gets XanoScript table with schema | 150ms |
| ✅ | Phase 3: Get Individual Resources > API Groups > gets API group details in JSON format | 93ms |
| ✅ | Phase 3: Get Individual Resources > API Groups > gets API group details in summary format | 92ms |
| ✅ | Phase 3: Get Individual Resources > API Groups > gets API group as XanoScript | 131ms |
| ✅ | Phase 3: Get Individual Resources > API Endpoints > gets API endpoint details in JSON format | 239ms |
| ✅ | Phase 3: Get Individual Resources > API Endpoints > gets API endpoint details in summary format | 237ms |
| ✅ | Phase 3: Get Individual Resources > API Endpoints > gets API endpoint as XanoScript | 278ms |
| ✅ | Phase 4: Edit Resources > Tables > edits table description | 335ms |
| ✅ | Phase 4: Edit Resources > Tables > edits table name | 362ms |
| ✅ | Phase 4: Edit Resources > Tables > shows table edit in summary format | 358ms |
| ✅ | Phase 4: Edit Resources > API Groups > edits API group description | 282ms |
| ✅ | Phase 4: Edit Resources > API Groups > edits API group swagger setting | 575ms |
| ✅ | Phase 4: Edit Resources > API Endpoints > edits API endpoint description | 619ms |
| ✅ | Phase 4: Edit Resources > API Endpoints > edits API endpoint name | 634ms |
| ✅ | Phase 4: Edit Resources > API Endpoints > shows API edit publishes by default | 632ms |
| ✅ | Phase 5: Error Handling > shows error for non-existent table > shows error for non-existent table | 111ms |
| ✅ | Phase 5: Error Handling > shows error for non-existent API group > shows error for non-existent API group | 82ms |
| ✅ | Phase 5: Error Handling > shows error for non-existent API endpoint > shows error for non-existent API endpoint | 226ms |
| ✅ | Phase 5: Error Handling > shows error for missing required table argument > shows error for missing required table argument | 29ms |
| ✅ | Phase 5: Error Handling > shows error for missing API group argument > shows error for missing API group argument | 29ms |
| ✅ | Phase 6: Delete Resources (Cleanup) > deletes POST API endpoint > deletes POST API endpoint | 397ms |
| ✅ | Phase 6: Delete Resources (Cleanup) > deletes GET API endpoint > deletes GET API endpoint | 389ms |
| ✅ | Phase 6: Delete Resources (Cleanup) > deletes API group > deletes API group | 285ms |
| ✅ | Phase 6: Delete Resources (Cleanup) > deletes XanoScript table > deletes XanoScript table | 293ms |
| ✅ | Phase 6: Delete Resources (Cleanup) > deletes main table > deletes main table | 304ms |
| ✅ | Phase 7: Verify Deletion > verifies tables are deleted > verifies tables are deleted | 187ms |
| ✅ | Phase 7: Verify Deletion > verifies API group is deleted > verifies API group is deleted | 240ms |

---

## Detailed Test Results

### Phase 1: Create Resources

#### Tables

##### ✅ creates a table with name and description

- **Status:** passed
- **Duration:** 199ms
- **Command:** `xano table create -p mcp-server -w 40 --name integration_table_test_1768131011387 --description "Integration test table" -o json`
- **Input:**
```json
{
  "name": "integration_table_test_1768131011387",
  "description": "Integration test table"
}
```
- **Output:**
```json
{
  "id": 620,
  "created_at": "2026-01-11 11:30:48+0000",
  "updated_at": "2026-01-11 11:30:48+0000",
  "name": "integration_table_test_1768131011387",
  "description": "Integration test table",
  "docs": "",
  "guid": "0-zi7Qkk4E8DktQmvbTL_IZWziY",
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
      "style": ... (truncated)
```

##### ✅ creates a table from XanoScript file

- **Status:** passed
- **Duration:** 331ms
- **Command:** `xano table create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-table-1768131048875.xs -o json`
- **Input:**
```json
{
  "file": "/var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-table-1768131048875.xs",
  "xanoscript": "table xs_table_test_1768131011387 {\n  description = \"Created from XanoScript\"\n  schema {\n    int id\n    text name\n    text email\n  }\n  index = [\n    {type: \"primary\", field: [{name: \"id\"}]}\n  ]\n}"
}
```
- **Output:**
```json
{
  "id": 621,
  "created_at": "2026-01-11 11:30:49+0000",
  "updated_at": "2026-01-11 11:30:49+0000",
  "name": "xs_table_test_1768131011387",
  "description": "Created from XanoScript",
  "docs": "",
  "guid": "OX_ZrBaiPbWnfT515EGgHzkkBrY",
  "auth": false,
  "tag": [],
  "autocomplete": [],
  "schema": [
    {
      "name": "id",
      "type": "int",
      "description": "",
      "nullable": false,
      "default": "0",
      "required": true,
      "access": "public",
      "style": "single... (truncated)
```

##### ✅ shows error when creating table without required fields

- **Status:** passed
- **Duration:** 27ms
- **Command:** `xano table create -p mcp-server -w 40`
- **Error:**
```
Either --name or --file must be provided
```

#### API Groups

##### ✅ creates an API group with swagger enabled

- **Status:** passed
- **Duration:** 240ms
- **Command:** `xano apigroup create -p mcp-server -w 40 --name integration_group_test_1768131011387 --description "Integration test API group" --swagger -o json`
- **Output:**
```json
{
  "id": 289,
  "created_at": "2026-01-11 11:30:49+0000",
  "updated_at": "2026-01-11 11:30:49+0000",
  "name": "integration_group_test_1768131011387",
  "description": "Integration test API group",
  "docs": "",
  "guid": "IY0ma1YA_ahREbrJ5ka1HNFjc60",
  "branch": "v1",
  "canonical": "0Dx2V5dU",
  "swagger": true,
  "documentation": {
    "link": "https://xhib-njau-6vza.d2.dev.xano.io/apispec:0Dx2V5dU:v1?type=json"
  },
  "tag": [],
  "xanoscript": null,
  "input": []
}
```

##### ✅ shows error when creating API group without required fields

- **Status:** passed
- **Duration:** 26ms
- **Command:** `xano apigroup create -p mcp-server -w 40`
- **Error:**
```
Either --name or --file must be provided
```

#### API Endpoints

##### ✅ creates a GET API endpoint

- **Status:** passed
- **Duration:** 335ms
- **Command:** `xano api create 289 -p mcp-server -w 40 --name get_endpoint_test_1768131011387 --verb GET --description "GET endpoint test" -o json`
- **Output:**
```json
{
  "id": 2208,
  "created_at": "2026-01-11 11:30:49+0000",
  "updated_at": "2026-01-11 11:30:49+0000",
  "name": "get_endpoint_test_1768131011387",
  "description": "GET endpoint test",
  "docs": "",
  "guid": "cg9lDeOjfDMvBVDc0arvEH0OJVM",
  "auth": false,
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
  "verb": "GET",
  "input": [],
  "tag": [],
  "draft_updated_at": null,
 ... (truncated)
```

##### ✅ creates a POST API endpoint

- **Status:** passed
- **Duration:** 331ms
- **Command:** `xano api create 289 -p mcp-server -w 40 --name post_endpoint_test_1768131011387 --verb POST --description "POST endpoint test" -o json`
- **Output:**
```json
{
  "id": 2209,
  "created_at": "2026-01-11 11:30:50+0000",
  "updated_at": "2026-01-11 11:30:50+0000",
  "name": "post_endpoint_test_1768131011387",
  "description": "POST endpoint test",
  "docs": "",
  "guid": "D1oEqqo_qbkq7LHnVNpf4BnAhwc",
  "auth": false,
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
  "verb": "POST",
  "input": [],
  "tag": [],
  "draft_updated_at": null... (truncated)
```

##### ✅ shows error when creating API without verb

- **Status:** passed
- **Duration:** 29ms
- **Command:** `xano api create 289 -p mcp-server -w 40 --name test_api`
- **Error:**
```
Either --name and --verb, --file, or --stdin must be provided
```

### Phase 2: List Resources

#### Tables

##### ✅ lists tables in JSON format and finds created tables

- **Status:** passed
- **Duration:** 242ms
- **Command:** `xano table list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 576,
    "created_at": "2026-01-11 07:48:36+0000",
    "updated_at": "2026-01-11 07:51:47+0000",
    "name": "book",
    "description": "Book catalog with inventory",
    "docs": "",
    "guid": "cwhKNpK8_SLj2Sl5s6Ymjrs2akw",
    "auth": false,
    "tag": [],
    "autocomplete": [],
    "schema": [
      {
        "name": "id",
        "type": "int",
        "description": "",
        "nullable": false,
        "default": "0",
        "required": true,
        "access": "public",... (truncated)
```

##### ✅ lists tables in summary format

- **Status:** passed
- **Duration:** 148ms
- **Command:** `xano table list -p mcp-server -w 40`
- **Output:**
```json
Available tables:
  - book (ID: 576)
  - cli_item (ID: 575)
  - integration_table_test_1768131011387 (ID: 620)
  - mcp_project (ID: 563)
  - mcp_task (ID: 564)
  - mcp_task_comment (ID: 568)
  - mcp_task_dependency (ID: 567)
  - mcp_task_validation (ID: 569)
  - mcp_trace (ID: 565)
  - mcp_trace_span (ID: 566)
  - skill_function (ID: 572)
  - skill_test (ID: 573)
  - skill_test_run (ID: 574)
  - test_content_debug (ID: 611)
  - test_user (ID: 571)
  - truncate_test (ID: 570)
  - xs_table_test_17... (truncated)
```

##### ✅ lists tables with search filter

- **Status:** passed
- **Duration:** 97ms
- **Command:** `xano table list -p mcp-server -w 40 --search integration -o json`
- **Output:**
```json
[
  {
    "id": 620,
    "created_at": "2026-01-11 11:30:48+0000",
    "updated_at": "2026-01-11 11:30:48+0000",
    "name": "integration_table_test_1768131011387",
    "description": "Integration test table",
    "docs": "",
    "guid": "0-zi7Qkk4E8DktQmvbTL_IZWziY",
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
 ... (truncated)
```

##### ✅ lists tables with pagination

- **Status:** passed
- **Duration:** 123ms
- **Command:** `xano table list -p mcp-server -w 40 --page 1 --per_page 5 -o json`
- **Output:**
```json
[
  {
    "id": 576,
    "created_at": "2026-01-11 07:48:36+0000",
    "updated_at": "2026-01-11 07:51:47+0000",
    "name": "book",
    "description": "Book catalog with inventory",
    "docs": "",
    "guid": "cwhKNpK8_SLj2Sl5s6Ymjrs2akw",
    "auth": false,
    "tag": [],
    "autocomplete": [],
    "schema": [
      {
        "name": "id",
        "type": "int",
        "description": "",
        "nullable": false,
        "default": "0",
        "required": true,
        "access": "public",... (truncated)
```

#### API Groups

##### ✅ lists API groups in JSON format

- **Status:** passed
- **Duration:** 243ms
- **Command:** `xano apigroup list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 289,
    "created_at": "2026-01-11 11:30:49+0000",
    "updated_at": "2026-01-11 11:30:49+0000",
    "name": "integration_group_test_1768131011387",
    "description": "Integration test API group",
    "docs": "",
    "guid": "IY0ma1YA_ahREbrJ5ka1HNFjc60",
    "branch": "v1",
    "canonical": "0Dx2V5dU",
    "swagger": true,
    "documentation": {
      "link": "https://xhib-njau-6vza.d2.dev.xano.io/apispec:0Dx2V5dU:v1?type=json"
    },
    "tag": [],
    "xanoscript": null
  },
... (truncated)
```

##### ✅ lists API groups in summary format

- **Status:** passed
- **Duration:** 178ms
- **Command:** `xano apigroup list -p mcp-server -w 40`
- **Output:**
```json
Available API groups:
  - integration_group_test_1768131011387 (ID: 289, canonical: api:0Dx2V5dU)
  - book (ID: 275, canonical: api:l6EArTw6)
  - xs-function (ID: 274, canonical: api:Vj9iJbME)
  - xs-api-lambda (ID: 273, canonical: api:TmEz5GzX)
  - cli-test (ID: 272, canonical: api:tvX8_02P)
  - xs-error-handling (ID: 271, canonical: api:uJH8PQAf)
  - xs-api-request (ID: 270, canonical: api:_eT7hvG3)
  - xs-util (ID: 269, canonical: api:3KzrYiuB)
  - xs-math (ID: 268, canonical: api:H7g7BNuc)
 ... (truncated)
```

#### API Endpoints

##### ✅ lists APIs in JSON format

- **Status:** passed
- **Duration:** 268ms
- **Command:** `xano api list 289 -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 2209,
    "created_at": "2026-01-11 11:30:50+0000",
    "updated_at": "2026-01-11 11:30:50+0000",
    "name": "post_endpoint_test_1768131011387",
    "description": "POST endpoint test",
    "docs": "",
    "guid": "D1oEqqo_qbkq7LHnVNpf4BnAhwc",
    "auth": false,
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
    "verb": "POST",
    "input":... (truncated)
```

##### ✅ lists APIs in summary format

- **Status:** passed
- **Duration:** 232ms
- **Command:** `xano api list 289 -p mcp-server -w 40`
- **Output:**
```json
Available APIs in group 289:
  - POST /post_endpoint_test_1768131011387 (ID: 2209)
  - GET /get_endpoint_test_1768131011387 (ID: 2208)
```

### Phase 3: Get Individual Resources

#### Tables

##### ✅ gets table details in JSON format

- **Status:** passed
- **Duration:** 102ms
- **Command:** `xano table get 620 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 620,
  "created_at": "2026-01-11 11:30:48+0000",
  "updated_at": "2026-01-11 11:30:48+0000",
  "name": "integration_table_test_1768131011387",
  "description": "Integration test table",
  "docs": "",
  "guid": "0-zi7Qkk4E8DktQmvbTL_IZWziY",
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
      "style": ... (truncated)
```

##### ✅ gets table details in summary format

- **Status:** passed
- **Duration:** 80ms
- **Command:** `xano table get 620 -p mcp-server -w 40`
- **Output:**
```json
Table: integration_table_test_1768131011387 (ID: 620)
Description: Integration test table
Auth Table: false
Created: 2026-01-11 11:30:48+0000
Updated: 2026-01-11 11:30:48+0000
```

##### ✅ gets table as XanoScript

- **Status:** passed
- **Duration:** 137ms
- **Command:** `xano table get 620 -p mcp-server -w 40 -o xs`
- **Output:**
```json
// Integration test table
table integration_table_test_1768131011387 {
  auth = false

  schema {
    int id
    timestamp created_at?=now
  }

  index = [
    {type: "primary", field: [{name: "id"}]}
    {type: "btree", field: [{name: "created_at", op: "desc"}]}
  ]
}
```

##### ✅ gets XanoScript table with schema

- **Status:** passed
- **Duration:** 150ms
- **Command:** `xano table get 621 -p mcp-server -w 40 -o xs`
- **Output:**
```json
// Created from XanoScript
table xs_table_test_1768131011387 {
  auth = false

  schema {
    int id
    text name
    text email
  }

  index = [{type: "primary", field: [{name: "id"}]}]
}
```

#### API Groups

##### ✅ gets API group details in JSON format

- **Status:** passed
- **Duration:** 93ms
- **Command:** `xano apigroup get 289 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 289,
  "created_at": "2026-01-11 11:30:49+0000",
  "updated_at": "2026-01-11 11:30:49+0000",
  "name": "integration_group_test_1768131011387",
  "description": "Integration test API group",
  "docs": "",
  "guid": "IY0ma1YA_ahREbrJ5ka1HNFjc60",
  "branch": "v1",
  "canonical": "0Dx2V5dU",
  "swagger": true,
  "documentation": {
    "link": "https://xhib-njau-6vza.d2.dev.xano.io/apispec:0Dx2V5dU:v1?type=json"
  },
  "tag": [],
  "xanoscript": null,
  "input": []
}
```

##### ✅ gets API group details in summary format

- **Status:** passed
- **Duration:** 92ms
- **Command:** `xano apigroup get 289 -p mcp-server -w 40`
- **Output:**
```json
API Group: integration_group_test_1768131011387 (ID: 289)
Canonical: api:0Dx2V5dU
Description: Integration test API group
Swagger: enabled
Branch: v1
Documentation: https://xhib-njau-6vza.d2.dev.xano.io/apispec:0Dx2V5dU:v1?type=json
Created: 2026-01-11 11:30:49+0000
Updated: 2026-01-11 11:30:49+0000
```

##### ✅ gets API group as XanoScript

- **Status:** passed
- **Duration:** 131ms
- **Command:** `xano apigroup get 289 -p mcp-server -w 40 -o xs`
- **Output:**
```json
// Integration test API group
api_group integration_group_test_1768131011387 {
  canonical = "0Dx2V5dU"
}
```

#### API Endpoints

##### ✅ gets API endpoint details in JSON format

- **Status:** passed
- **Duration:** 239ms
- **Command:** `xano api get 289 2208 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 2208,
  "created_at": "2026-01-11 11:30:49+0000",
  "updated_at": "2026-01-11 11:30:49+0000",
  "name": "get_endpoint_test_1768131011387",
  "description": "GET endpoint test",
  "docs": "",
  "guid": "cg9lDeOjfDMvBVDc0arvEH0OJVM",
  "auth": false,
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
  "verb": "GET",
  "input": [],
  "tag": [],
  "draft_updated_at": null,
 ... (truncated)
```

##### ✅ gets API endpoint details in summary format

- **Status:** passed
- **Duration:** 237ms
- **Command:** `xano api get 289 2208 -p mcp-server -w 40`
- **Output:**
```json
API: GET /get_endpoint_test_1768131011387 (ID: 2208)
Description: GET endpoint test
Created: 2026-01-11 11:30:49+0000
Updated: 2026-01-11 11:30:49+0000
```

##### ✅ gets API endpoint as XanoScript

- **Status:** passed
- **Duration:** 278ms
- **Command:** `xano api get 289 2208 -p mcp-server -w 40 -o xs`
- **Output:**
```json
// GET endpoint test
query get_endpoint_test_1768131011387 verb=GET {
  api_group = "integration_group_test_1768131011387"

  input {
  }

  stack {
  }

  response = null
}
```

### Phase 4: Edit Resources

#### Tables

##### ✅ edits table description

- **Status:** passed
- **Duration:** 335ms
- **Command:** `xano table edit 620 -p mcp-server -w 40 --description "Updated integration test table" -o json`
- **Output:**
```json
{
  "id": 620,
  "created_at": "2026-01-11 11:30:48+0000",
  "updated_at": "2026-01-11 11:30:53+0000",
  "name": "integration_table_test_1768131011387",
  "description": "Updated integration test table",
  "docs": "",
  "guid": "0-zi7Qkk4E8DktQmvbTL_IZWziY",
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
      "... (truncated)
```

##### ✅ edits table name

- **Status:** passed
- **Duration:** 362ms
- **Command:** `xano table edit 620 -p mcp-server -w 40 --name "renamed_table_test_1768131011387" -o json`
- **Output:**
```json
{
  "id": 620,
  "created_at": "2026-01-11 11:30:48+0000",
  "updated_at": "2026-01-11 11:30:53+0000",
  "name": "renamed_table_test_1768131011387",
  "description": "Updated integration test table",
  "docs": "",
  "guid": "0-zi7Qkk4E8DktQmvbTL_IZWziY",
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

##### ✅ shows table edit in summary format

- **Status:** passed
- **Duration:** 358ms
- **Command:** `xano table edit 620 -p mcp-server -w 40 --description "Final description"`
- **Output:**
```json
Table updated successfully!
ID: 620
Name: renamed_table_test_1768131011387
```

#### API Groups

##### ✅ edits API group description

- **Status:** passed
- **Duration:** 282ms
- **Command:** `xano apigroup edit 289 -p mcp-server -w 40 --description "Updated integration test API group" -o json`
- **Output:**
```json
{
  "id": 289,
  "created_at": "2026-01-11 11:30:49+0000",
  "updated_at": "2026-01-11 11:30:54+0000",
  "name": "integration_group_test_1768131011387",
  "description": "Updated integration test API group",
  "docs": "",
  "guid": "IY0ma1YA_ahREbrJ5ka1HNFjc60",
  "branch": "v1",
  "canonical": "0Dx2V5dU",
  "swagger": true,
  "documentation": {
    "link": "https://xhib-njau-6vza.d2.dev.xano.io/apispec:0Dx2V5dU:v1?type=json"
  },
  "tag": [],
  "xanoscript": null,
  "input": []
}
```

##### ✅ edits API group swagger setting

- **Status:** passed
- **Duration:** 575ms
- **Command:** `xano apigroup edit 289 -p mcp-server -w 40 --swagger -o json`
- **Output:**
```json
{
  "id": 289,
  "created_at": "2026-01-11 11:30:49+0000",
  "updated_at": "2026-01-11 11:30:55+0000",
  "name": "integration_group_test_1768131011387",
  "description": "Updated integration test API group",
  "docs": "",
  "guid": "IY0ma1YA_ahREbrJ5ka1HNFjc60",
  "branch": "v1",
  "canonical": "0Dx2V5dU",
  "swagger": true,
  "documentation": {
    "link": "https://xhib-njau-6vza.d2.dev.xano.io/apispec:0Dx2V5dU:v1?type=json"
  },
  "tag": [],
  "xanoscript": null,
  "input": []
}
```

#### API Endpoints

##### ✅ edits API endpoint description

- **Status:** passed
- **Duration:** 619ms
- **Command:** `xano api edit 289 2208 -p mcp-server -w 40 --description "Updated GET endpoint description" -o json`
- **Output:**
```json
{
  "id": 2208,
  "created_at": "2026-01-11 11:30:49+0000",
  "updated_at": "2026-01-11 11:30:55+0000",
  "name": "get_endpoint_test_1768131011387",
  "description": "Updated GET endpoint description",
  "docs": "",
  "guid": "cg9lDeOjfDMvBVDc0arvEH0OJVM",
  "auth": false,
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
  "verb": "GET",
  "input": [],
  "tag": [],
  "draft_updat... (truncated)
```

##### ✅ edits API endpoint name

- **Status:** passed
- **Duration:** 634ms
- **Command:** `xano api edit 289 2208 -p mcp-server -w 40 --name "renamed_endpoint_test_1768131011387" -o json`
- **Output:**
```json
{
  "id": 2208,
  "created_at": "2026-01-11 11:30:49+0000",
  "updated_at": "2026-01-11 11:30:56+0000",
  "name": "renamed_endpoint_test_1768131011387",
  "description": "Updated GET endpoint description",
  "docs": "",
  "guid": "cg9lDeOjfDMvBVDc0arvEH0OJVM",
  "auth": false,
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
  "verb": "GET",
  "input": [],
  "tag": [],
  "draft_u... (truncated)
```

##### ✅ shows API edit publishes by default

- **Status:** passed
- **Duration:** 632ms
- **Command:** `xano api edit 289 2208 -p mcp-server -w 40 --description "Published update"`
- **Output:**
```json
API updated and published!
ID: 2208
Name: renamed_endpoint_test_1768131011387
Verb: GET
```

### Phase 5: Error Handling

#### shows error for non-existent table

##### ✅ shows error for non-existent table

- **Status:** passed
- **Duration:** 111ms
- **Command:** `xano table get 999999 -p mcp-server -w 40`
- **Error:**
```
API request failed with status 404: Not Found
{"code":"ERROR_CODE_NOT_FOUND","message":""}
```

#### shows error for non-existent API group

##### ✅ shows error for non-existent API group

- **Status:** passed
- **Duration:** 82ms
- **Command:** `xano apigroup get 999999 -p mcp-server -w 40`
- **Error:**
```
API request failed with status 404: Not Found
{"code":"ERROR_CODE_NOT_FOUND","message":""}
```

#### shows error for non-existent API endpoint

##### ✅ shows error for non-existent API endpoint

- **Status:** passed
- **Duration:** 226ms
- **Command:** `xano api get 289 999999 -p mcp-server -w 40`
- **Error:**
```
API request failed with status 404: Not Found
{"code":"ERROR_CODE_NOT_FOUND","message":""}
```

#### shows error for missing required table argument

##### ✅ shows error for missing required table argument

- **Status:** passed
- **Duration:** 29ms
- **Command:** `xano table get -p mcp-server -w 40`
- **Error:**
```
Missing 1 required arg:
table_id  Table ID
See more help with --help
```

#### shows error for missing API group argument

##### ✅ shows error for missing API group argument

- **Status:** passed
- **Duration:** 29ms
- **Command:** `xano api list -p mcp-server -w 40`
- **Error:**
```
Missing 1 required arg:
apigroup_id  API Group ID
See more help with --help
```

### Phase 6: Delete Resources (Cleanup)

#### deletes POST API endpoint

##### ✅ deletes POST API endpoint

- **Status:** passed
- **Duration:** 397ms
- **Command:** `xano api delete 289 2209 -p mcp-server -w 40 --force`
- **Output:**
```json
API deleted successfully!
```

#### deletes GET API endpoint

##### ✅ deletes GET API endpoint

- **Status:** passed
- **Duration:** 389ms
- **Command:** `xano api delete 289 2208 -p mcp-server -w 40 --force`
- **Output:**
```json
API deleted successfully!
```

#### deletes API group

##### ✅ deletes API group

- **Status:** passed
- **Duration:** 285ms
- **Command:** `xano apigroup delete 289 -p mcp-server -w 40 --force`
- **Output:**
```json
API group deleted successfully!
```

#### deletes XanoScript table

##### ✅ deletes XanoScript table

- **Status:** passed
- **Duration:** 293ms
- **Command:** `xano table delete 621 -p mcp-server -w 40 --force`
- **Output:**
```json
Table deleted successfully!
```

#### deletes main table

##### ✅ deletes main table

- **Status:** passed
- **Duration:** 304ms
- **Command:** `xano table delete 620 -p mcp-server -w 40 --force`
- **Output:**
```json
Table deleted successfully!
```

### Phase 7: Verify Deletion

#### verifies tables are deleted

##### ✅ verifies tables are deleted

- **Status:** passed
- **Duration:** 187ms
- **Command:** `xano table list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 576,
    "created_at": "2026-01-11 07:48:36+0000",
    "updated_at": "2026-01-11 07:51:47+0000",
    "name": "book",
    "description": "Book catalog with inventory",
    "docs": "",
    "guid": "cwhKNpK8_SLj2Sl5s6Ymjrs2akw",
    "auth": false,
    "tag": [],
    "autocomplete": [],
    "schema": [
      {
        "name": "id",
        "type": "int",
        "description": "",
        "nullable": false,
        "default": "0",
        "required": true,
        "access": "public",... (truncated)
```

#### verifies API group is deleted

##### ✅ verifies API group is deleted

- **Status:** passed
- **Duration:** 240ms
- **Command:** `xano apigroup list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 275,
    "created_at": "2026-01-11 07:48:42+0000",
    "updated_at": "2026-01-11 07:48:42+0000",
    "name": "book",
    "description": "Book API endpoints",
    "docs": "",
    "guid": "A-nnu7j79skNpfHBvgWVgcG7kfk",
    "branch": "v1",
    "canonical": "l6EArTw6",
    "swagger": true,
    "documentation": {
      "link": "https://xhib-njau-6vza.d2.dev.xano.io/apispec:l6EArTw6:v1?type=json"
    },
    "tag": [],
    "xanoscript": null
  },
  {
    "id": 274,
    "created_at": "20... (truncated)
```

---

*Generated by Xano CLI Integration Tests*
