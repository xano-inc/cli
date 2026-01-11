# Phase 5 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T11:30:47.323Z |
| **Total Duration** | 36.06s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 17 |
| **Passed** | 17 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Tool Commands > Create Tool > creates a new tool | 457ms |
| PASS | Tool Commands > List Tools > lists tools and finds created tool | 332ms |
| PASS | Tool Commands > Get Tool > gets tool details | 261ms |
| PASS | Tool Commands > Edit Tool > updates tool via XanoScript file | 394ms |
| PASS | Tool Commands > Delete Tool > deletes the test tool | 156ms |
| PASS | Agent Commands > Create Agent > creates a new agent | 306ms |
| PASS | Agent Commands > List Agents > lists agents and finds created agent | 195ms |
| PASS | Agent Commands > Get Agent > gets agent details | 116ms |
| PASS | Agent Commands > Edit Agent > updates agent via XanoScript file | 243ms |
| PASS | Agent Commands > Delete Agent > deletes the test agent | 143ms |
| PASS | MCP Server Commands > Create MCP Server > creates a new MCP server | 310ms |
| PASS | MCP Server Commands > List MCP Servers > lists MCP servers and finds created server | 198ms |
| PASS | MCP Server Commands > Get MCP Server > gets MCP server details | 110ms |
| PASS | MCP Server Commands > Edit MCP Server > updates MCP server via XanoScript file | 242ms |
| PASS | MCP Server Commands > Delete MCP Server > deletes the test MCP server | 146ms |
| PASS | Realtime Commands > Get Realtime Config > gets realtime configuration | 108ms |
| PASS | Workflow Test Commands > List Workflow Tests > lists workflow tests | 320ms |

---

## Detailed Results

### Tool Commands

#### Create Tool

##### PASS creates a new tool

- **Status:** passed
- **Duration:** 457ms
- **Command:** `xano tool create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/tool_1768131043278.xs -o json`
- **Output:**
```json
{
  "id": 68,
  "created_at": "2026-01-11 11:30:43+0000",
  "updated_at": "2026-01-11 11:30:43+0000",
  "name": "test_tool_phase5_1768131011257",
  "description": "Test tool for phase 5 integration tests",
  "docs": "",
  "instructions": "Use this tool to test the CLI create functionality.",
  "guid": "6xyn_4Q_fjufajarwvAqYk0XDHE",
  "branch": "v1",
  "input": [
    {
      "name": "test_input",
      "type": "text",
      "description": "Optional test input parameter",
      "nullable": false,
... (truncated)
```

#### List Tools

##### PASS lists tools and finds created tool

- **Status:** passed
- **Duration:** 332ms
- **Command:** `xano tool list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 68,
    "created_at": "2026-01-11 11:30:43+0000",
    "updated_at": "2026-01-11 11:30:43+0000",
    "name": "test_tool_phase5_1768131011257",
    "description": "Test tool for phase 5 integration tests",
    "docs": "",
    "instructions": "Use this tool to test the CLI create functionality.",
    "guid": "6xyn_4Q_fjufajarwvAqYk0XDHE",
    "branch": "v1",
    "input": [
      {
        "name": "test_input",
        "type": "text",
        "description": "Optional test input param... (truncated)
```

#### Get Tool

##### PASS gets tool details

- **Status:** passed
- **Duration:** 261ms
- **Command:** `xano tool get 68 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 68,
  "created_at": "2026-01-11 11:30:43+0000",
  "updated_at": "2026-01-11 11:30:43+0000",
  "name": "test_tool_phase5_1768131011257",
  "description": "Test tool for phase 5 integration tests",
  "docs": "",
  "instructions": "Use this tool to test the CLI create functionality.",
  "guid": "6xyn_4Q_fjufajarwvAqYk0XDHE",
  "branch": "v1",
  "input": [
    {
      "name": "test_input",
      "type": "text",
      "description": "Optional test input parameter",
      "nullable": false,
... (truncated)
```

#### Edit Tool

##### PASS updates tool via XanoScript file

- **Status:** passed
- **Duration:** 394ms
- **Command:** `xano tool edit 68 -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/tool_edit_1768131044328.xs`
- **Output:**
```json
Tool updated successfully!
```

#### Delete Tool

##### PASS deletes the test tool

- **Status:** passed
- **Duration:** 156ms
- **Command:** `xano tool delete 68 -p mcp-server -w 40 --force`
- **Output:**
```json
Tool deleted successfully!
```

### Agent Commands

#### Create Agent

##### PASS creates a new agent

- **Status:** passed
- **Duration:** 306ms
- **Command:** `xano agent create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/agent_1768131044879.xs -o json`
- **Output:**
```json
{
  "id": 112,
  "created_at": "2026-01-11 11:30:45+0000",
  "updated_at": "2026-01-11 11:30:45+0000",
  "name": "Test Agent _phase5_1768131011257",
  "description": "Test agent for phase 5 integration tests",
  "llm": "xano-free",
  "tag": [],
  "xanoscript": null,
  "input": []
}
```

#### List Agents

##### PASS lists agents and finds created agent

- **Status:** passed
- **Duration:** 195ms
- **Command:** `xano agent list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 112,
    "created_at": "2026-01-11 11:30:45+0000",
    "updated_at": "2026-01-11 11:30:45+0000",
    "name": "Test Agent _phase5_1768131011257",
    "description": "Test agent for phase 5 integration tests",
    "llm": "xano-free",
    "tag": [],
    "xanoscript": null
  }
]
```

#### Get Agent

##### PASS gets agent details

- **Status:** passed
- **Duration:** 116ms
- **Command:** `xano agent get 112 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 112,
  "created_at": "2026-01-11 11:30:45+0000",
  "updated_at": "2026-01-11 11:30:45+0000",
  "name": "Test Agent _phase5_1768131011257",
  "description": "Test agent for phase 5 integration tests",
  "llm": "xano-free",
  "tag": [],
  "xanoscript": null,
  "input": []
}
```

#### Edit Agent

##### PASS updates agent via XanoScript file

- **Status:** passed
- **Duration:** 243ms
- **Command:** `xano agent edit 112 -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/agent_edit_1768131045497.xs`
- **Output:**
```json
Agent updated successfully!
```

#### Delete Agent

##### PASS deletes the test agent

- **Status:** passed
- **Duration:** 143ms
- **Command:** `xano agent delete 112 -p mcp-server -w 40 --force`
- **Output:**
```json
Agent deleted successfully!
```

### MCP Server Commands

#### Create MCP Server

##### PASS creates a new MCP server

- **Status:** passed
- **Duration:** 310ms
- **Command:** `xano mcp-server create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/mcp_server_1768131045885.xs -o json`
- **Output:**
```json
{
  "id": 113,
  "created_at": "2026-01-11 11:30:46+0000",
  "updated_at": "2026-01-11 11:30:46+0000",
  "name": "Test MCP _phase5_1768131011257",
  "description": "Test MCP server for phase 5 integration tests",
  "tag": [
    "test",
    "integration"
  ],
  "xanoscript": null,
  "input": []
}
```

#### List MCP Servers

##### PASS lists MCP servers and finds created server

- **Status:** passed
- **Duration:** 198ms
- **Command:** `xano mcp-server list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 113,
    "created_at": "2026-01-11 11:30:46+0000",
    "updated_at": "2026-01-11 11:30:46+0000",
    "name": "Test MCP _phase5_1768131011257",
    "description": "Test MCP server for phase 5 integration tests",
    "tag": [
      "test",
      "integration"
    ],
    "xanoscript": null
  }
]
```

#### Get MCP Server

##### PASS gets MCP server details

- **Status:** passed
- **Duration:** 110ms
- **Command:** `xano mcp-server get 113 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 113,
  "created_at": "2026-01-11 11:30:46+0000",
  "updated_at": "2026-01-11 11:30:46+0000",
  "name": "Test MCP _phase5_1768131011257",
  "description": "Test MCP server for phase 5 integration tests",
  "tag": [
    "test",
    "integration"
  ],
  "xanoscript": null,
  "input": []
}
```

#### Edit MCP Server

##### PASS updates MCP server via XanoScript file

- **Status:** passed
- **Duration:** 242ms
- **Command:** `xano mcp-server edit 113 -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/mcp_edit_1768131046504.xs`
- **Output:**
```json
MCP Server updated successfully!
```

#### Delete MCP Server

##### PASS deletes the test MCP server

- **Status:** passed
- **Duration:** 146ms
- **Command:** `xano mcp-server delete 113 -p mcp-server -w 40 --force`
- **Output:**
```json
MCP Server deleted successfully!
```

### Realtime Commands

#### Get Realtime Config

##### PASS gets realtime configuration

- **Status:** passed
- **Duration:** 108ms
- **Command:** `xano realtime get -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "enabled": true,
  "hash": "tixBsYsDDCx6P717WgX9j1TwkPA",
  "channels": [
    {
      "anonymous_clients": true,
      "client_authenticated_messaging": true,
      "client_private_messaging": true,
      "client_private_messaging_authenticated_only": true,
      "client_public_messaging": true,
      "client_public_messaging_authenticated_only": true,
      "description": "dedscription",
      "enabled": true,
      "history": 50,
      "id": 68327953636970,
      "pattern": "test",
      "... (truncated)
```

### Workflow Test Commands

#### List Workflow Tests

##### PASS lists workflow tests

- **Status:** passed
- **Duration:** 320ms
- **Command:** `xano workflow-test list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]
```

