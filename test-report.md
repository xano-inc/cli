# Xano CLI Integration Test Report

## Overall Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T21:15:17.994Z |
| **Total Duration** | 273.20s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 155 |
| **Passed** | 155 |
| **Failed** | 0 |
| **Skipped** | 0 |
| **Pass Rate** | 100.0% |

## Suite Overview

| Suite | Description | Passed | Failed | Skipped | Duration |
|-------|-------------|--------|--------|---------|----------|
| PASS addons | Addon CRUD with Table Dependencies | 16 | 0 | 0 | 14.42s |
| PASS agents-mcp-tools | AI Agents, MCP Servers, Tools, and Realtime | 17 | 0 | 0 | 18.56s |
| PASS core-resources | Tables, API Groups, and API Endpoints | 46 | 0 | 0 | 30.35s |
| PASS function-workspace | Functions and Workspace Operations | 11 | 0 | 0 | 34.90s |
| PASS metadata | Branches, Files, Audit Logs, and History | 10 | 0 | 0 | 36.47s |
| PASS middleware-task-datasource | Middleware, Tasks, and Datasources | 21 | 0 | 0 | 42.78s |
| PASS table-data | Table Content, Schema, and Index Operations | 16 | 0 | 0 | 45.04s |
| PASS triggers | Workspace and Table Triggers | 18 | 0 | 0 | 50.68s |

---

## addons

**Addon CRUD with Table Dependencies**

| Status | Test | Category | Duration |
|--------|------|----------|----------|
| PASS | creates a table for the addon to extend | Create Test Table | 10.87s |
| PASS | creates an addon that extends the test table | creates an addon that extends the test table | 467ms |
| PASS | lists addons in JSON format | List Addons | 222ms |
| PASS | lists addons in summary format | List Addons | 119ms |
| PASS | lists addons with search filter | List Addons | 182ms |
| PASS | gets addon details in JSON format | Get Addon | 121ms |
| PASS | gets addon in summary format | Get Addon | 105ms |
| PASS | edits addon with updated XanoScript | edits addon with updated XanoScript | 300ms |
| PASS | verifies addon was updated | verifies addon was updated | 159ms |
| PASS | clears addon security | clears addon security | 178ms |
| PASS | handles get with non-existent addon ID | handles get with non-existent addon ID | 183ms |
| PASS | handles create with invalid XanoScript | handles create with invalid XanoScript | 326ms |
| PASS | handles create with missing file | handles create with missing file | 28ms |
| PASS | deletes the test addon | Delete Addon | 288ms |
| PASS | deletes the test table after addon is removed | Delete Table Dependency | 289ms |
| PASS | verifies addon was deleted | verifies addon was deleted | 194ms |

---

## agents-mcp-tools

**AI Agents, MCP Servers, Tools, and Realtime**

| Status | Test | Category | Duration |
|--------|------|----------|----------|
| PASS | creates a new tool | Create Tool | 449ms |
| PASS | lists tools and finds created tool | List Tools | 346ms |
| PASS | gets tool details | Get Tool | 261ms |
| PASS | updates tool via XanoScript file | Edit Tool | 434ms |
| PASS | deletes the test tool | Delete Tool | 147ms |
| PASS | creates a new agent | Create Agent | 379ms |
| PASS | lists agents and finds created agent | List Agents | 199ms |
| PASS | gets agent details | Get Agent | 105ms |
| PASS | updates agent via XanoScript file | Edit Agent | 249ms |
| PASS | deletes the test agent | Delete Agent | 177ms |
| PASS | creates a new MCP server | Create MCP Server | 316ms |
| PASS | lists MCP servers and finds created server | List MCP Servers | 193ms |
| PASS | gets MCP server details | Get MCP Server | 111ms |
| PASS | updates MCP server via XanoScript file | Edit MCP Server | 249ms |
| PASS | deletes the test MCP server | Delete MCP Server | 131ms |
| PASS | gets realtime configuration | Get Realtime Config | 138ms |
| PASS | lists workflow tests | List Workflow Tests | 316ms |

---

## core-resources

**Tables, API Groups, and API Endpoints**

| Status | Test | Category | Duration |
|--------|------|----------|----------|
| PASS | creates a table with name and description | Tables | 233ms |
| PASS | creates a table from XanoScript file | Tables | 359ms |
| PASS | shows error when creating table without required fields | Tables | 25ms |
| PASS | creates an API group with swagger enabled | API Groups | 338ms |
| PASS | shows error when creating API group without required fields | API Groups | 43ms |
| PASS | creates a GET API endpoint | API Endpoints | 371ms |
| PASS | creates a POST API endpoint | API Endpoints | 505ms |
| PASS | shows error when creating API without verb | API Endpoints | 29ms |
| PASS | lists tables in JSON format and finds created tables | Tables | 325ms |
| PASS | lists tables in summary format | Tables | 145ms |
| PASS | lists tables with search filter | Tables | 153ms |
| PASS | lists tables with pagination | Tables | 118ms |
| PASS | lists API groups in JSON format | API Groups | 246ms |
| PASS | lists API groups in summary format | API Groups | 182ms |
| PASS | lists APIs in JSON format | API Endpoints | 264ms |
| PASS | lists APIs in summary format | API Endpoints | 238ms |
| PASS | gets table details in JSON format | Tables | 95ms |
| PASS | gets table details in summary format | Tables | 87ms |
| PASS | gets table as XanoScript | Tables | 138ms |
| PASS | gets XanoScript table with schema | Tables | 204ms |
| PASS | gets API group details in JSON format | API Groups | 99ms |
| PASS | gets API group details in summary format | API Groups | 84ms |
| PASS | gets API group as XanoScript | API Groups | 137ms |
| PASS | gets API endpoint details in JSON format | API Endpoints | 250ms |
| PASS | gets API endpoint details in summary format | API Endpoints | 222ms |
| PASS | gets API endpoint as XanoScript | API Endpoints | 278ms |
| PASS | edits table description | Tables | 353ms |
| PASS | edits table name | Tables | 389ms |
| PASS | shows table edit in summary format | Tables | 359ms |
| PASS | edits API group description | API Groups | 290ms |
| PASS | edits API group swagger setting | API Groups | 685ms |
| PASS | edits API endpoint description | API Endpoints | 631ms |
| PASS | edits API endpoint name | API Endpoints | 620ms |
| PASS | shows API edit publishes by default | API Endpoints | 656ms |
| PASS | shows error for non-existent table | shows error for non-existent table | 189ms |
| PASS | shows error for non-existent API group | shows error for non-existent API group | 95ms |
| PASS | shows error for non-existent API endpoint | shows error for non-existent API endpoint | 231ms |
| PASS | shows error for missing required table argument | shows error for missing required table argument | 25ms |
| PASS | shows error for missing API group argument | shows error for missing API group argument | 34ms |
| PASS | deletes POST API endpoint | deletes POST API endpoint | 504ms |
| PASS | deletes GET API endpoint | deletes GET API endpoint | 392ms |
| PASS | deletes API group | deletes API group | 290ms |
| PASS | deletes XanoScript table | deletes XanoScript table | 254ms |
| PASS | deletes main table | deletes main table | 269ms |
| PASS | verifies tables are deleted | verifies tables are deleted | 189ms |
| PASS | verifies API group is deleted | verifies API group is deleted | 237ms |

---

## function-workspace

**Functions and Workspace Operations**

| Status | Test | Category | Duration |
|--------|------|----------|----------|
| PASS | creates a test function | Create Function | 450ms |
| PASS | updates function security (clear) | Function Security | 384ms |
| PASS | shows error when no security option provided | Function Security | 25ms |
| PASS | deletes the test function | Function Delete | 406ms |
| PASS | shows error for non-existent function | Function Delete | 91ms |
| PASS | gets workspace details in summary format | Workspace Get | 104ms |
| PASS | gets workspace details in JSON format | Workspace Get | 99ms |
| PASS | gets workspace context (text format) | Workspace Context | 404ms |
| PASS | gets workspace OpenAPI spec | Workspace OpenAPI | 1.64s |
| PASS | exports workspace schema to file | Workspace Export/Import Schema | 374ms |
| PASS | exports workspace to file | Workspace Export | 603ms |

---

## metadata

**Branches, Files, Audit Logs, and History**

| Status | Test | Category | Duration |
|--------|------|----------|----------|
| PASS | lists branches in workspace | List Branches | 228ms |
| PASS | lists files in workspace | List Files | 85ms |
| PASS | lists audit logs for workspace | List Audit Logs | 253ms |
| PASS | lists global audit logs | Global Audit Logs | 245ms |
| PASS | lists request history | Request History | 152ms |
| PASS | lists function history | Function History | 121ms |
| PASS | lists middleware history | Middleware History | 188ms |
| PASS | lists task history | Task History | 119ms |
| PASS | lists trigger history | Trigger History | 90ms |
| PASS | lists tool history | Tool History | 121ms |

---

## middleware-task-datasource

**Middleware, Tasks, and Datasources**

| Status | Test | Category | Duration |
|--------|------|----------|----------|
| PASS | creates a middleware from XanoScript | Create Middleware | 383ms |
| PASS | lists middleware in JSON format | List Middleware | 361ms |
| PASS | lists middleware in summary format | List Middleware | 232ms |
| PASS | gets middleware details in JSON format | Get Middleware | 237ms |
| PASS | gets middleware in summary format | Get Middleware | 228ms |
| PASS | edits middleware description | Edit Middleware | 381ms |
| PASS | clears middleware security | Middleware Security | 330ms |
| PASS | deletes the test middleware | Delete Middleware | 395ms |
| PASS | creates a task from XanoScript | Create Task | 435ms |
| PASS | lists tasks in JSON format | List Tasks | 324ms |
| PASS | lists tasks in summary format | List Tasks | 240ms |
| PASS | gets task details in JSON format | Get Task | 238ms |
| PASS | gets task in summary format | Get Task | 220ms |
| PASS | edits task description | Edit Task | 529ms |
| PASS | clears task security | Task Security | 342ms |
| PASS | deletes the test task | Delete Task | 375ms |
| PASS | creates a datasource | Create Datasource | 516ms |
| PASS | lists datasources in JSON format | List Datasources | 94ms |
| PASS | lists datasources in summary format | List Datasources | 100ms |
| PASS | edits datasource color | Edit Datasource | 143ms |
| PASS | deletes the test datasource | Delete Datasource | 261ms |

---

## table-data

**Table Content, Schema, and Index Operations**

| Status | Test | Category | Duration |
|--------|------|----------|----------|
| PASS | creates a table for content tests | Create Test Table | 274ms |
| PASS | creates a record in the table | Create Record | 114ms |
| PASS | lists records in JSON format | List Records | 84ms |
| PASS | lists records in summary format | List Records | 82ms |
| PASS | gets record details in JSON format | Get Record | 79ms |
| PASS | updates a record | Edit Record | 82ms |
| PASS | bulk creates multiple records | Bulk Create Records | 85ms |
| PASS | bulk deletes multiple records | Bulk Delete Records | 84ms |
| PASS | deletes the test record | Delete Record | 80ms |
| PASS | gets table schema | Get Schema | 90ms |
| PASS | adds a text column to the schema | Add Column | 241ms |
| PASS | gets column details | Get Column | 128ms |
| PASS | renames a column | Rename Column | 195ms |
| PASS | deletes a column | Delete Column | 264ms |
| PASS | lists table indexes | List Indexes | 197ms |
| PASS | deletes the test table | Delete Test Table | 231ms |

---

## triggers

**Workspace and Table Triggers**

| Status | Test | Category | Duration |
|--------|------|----------|----------|
| PASS | creates a workspace trigger from XanoScript | Create Trigger | 483ms |
| PASS | lists triggers in JSON format | List Triggers | 333ms |
| PASS | lists triggers in summary format | List Triggers | 247ms |
| PASS | gets trigger details in JSON format | Get Trigger | 277ms |
| PASS | gets trigger in summary format | Get Trigger | 223ms |
| PASS | edits trigger using XanoScript file | Edit Trigger | 407ms |
| PASS | clears trigger security | Trigger Security | 418ms |
| PASS | deletes the test trigger | Delete Trigger | 191ms |
| PASS | creates a table for table trigger tests | Setup Test Table | 333ms |
| PASS | creates a table trigger from XanoScript | Create Table Trigger | 524ms |
| PASS | lists table triggers in JSON format | List Table Triggers | 296ms |
| PASS | lists table triggers in summary format | List Table Triggers | 240ms |
| PASS | gets table trigger details in JSON format | Get Table Trigger | 260ms |
| PASS | gets table trigger in summary format | Get Table Trigger | 245ms |
| PASS | edits table trigger using XanoScript file | Edit Table Trigger | 405ms |
| PASS | clears table trigger security | Table Trigger Security | 313ms |
| PASS | deletes the test table trigger | Delete Table Trigger | 139ms |
| PASS | deletes the test table | Cleanup Test Table | 343ms |

---


*Generated by Xano CLI Integration Tests*
