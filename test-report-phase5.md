# Phase 5 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T10:51:56.549Z |
| **Total Duration** | 12.49s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 17 |
| **Passed** | 17 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Tool Commands > Create Tool > creates a new tool | 8.69s |
| PASS | Tool Commands > List Tools > lists tools and finds created tool | 379ms |
| PASS | Tool Commands > Get Tool > gets tool details | 267ms |
| PASS | Tool Commands > Edit Tool > updates tool via XanoScript file | 416ms |
| PASS | Tool Commands > Delete Tool > deletes the test tool | 163ms |
| PASS | Agent Commands > Create Agent > creates a new agent | 315ms |
| PASS | Agent Commands > List Agents > lists agents and finds created agent | 202ms |
| PASS | Agent Commands > Get Agent > gets agent details | 116ms |
| PASS | Agent Commands > Edit Agent > updates agent via XanoScript file | 266ms |
| PASS | Agent Commands > Delete Agent > deletes the test agent | 161ms |
| PASS | MCP Server Commands > Create MCP Server > creates a new MCP server | 304ms |
| PASS | MCP Server Commands > List MCP Servers > lists MCP servers and finds created server | 197ms |
| PASS | MCP Server Commands > Get MCP Server > gets MCP server details | 118ms |
| PASS | MCP Server Commands > Edit MCP Server > updates MCP server via XanoScript file | 242ms |
| PASS | MCP Server Commands > Delete MCP Server > deletes the test MCP server | 145ms |
| PASS | Realtime Commands > Get Realtime Config > gets realtime configuration | 104ms |
| PASS | Workflow Test Commands > List Workflow Tests > lists workflow tests | 312ms |

---

## Detailed Results

### Tool Commands

#### Create Tool

##### PASS creates a new tool

- **Status:** passed
- **Duration:** 8.69s
- **Command:** `xano tool create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/tool_1768128704147.xs -o json`
- **Output:**
```json
{
  "id": 67,
  "created_at": "2026-01-11 10:51:52+0000",
  "updated_at": "2026-01-11 10:51:52+0000",
  "name": "test_tool_phase5_1768128704057",
  "description": "Test tool for phase 5 integration tests",
  "docs": "",
  "instructions": "Use this tool to test the CLI create functionality.",
  "guid": "BOtIupAC3mLpEvLN0quJ37t_tLc",
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
- **Duration:** 379ms
- **Command:** `xano tool list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 67,
    "created_at": "2026-01-11 10:51:52+0000",
    "updated_at": "2026-01-11 10:51:52+0000",
    "name": "test_tool_phase5_1768128704057",
    "description": "Test tool for phase 5 integration tests",
    "docs": "",
    "instructions": "Use this tool to test the CLI create functionality.",
    "guid": "BOtIupAC3mLpEvLN0quJ37t_tLc",
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
- **Duration:** 267ms
- **Command:** `xano tool get 67 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 67,
  "created_at": "2026-01-11 10:51:52+0000",
  "updated_at": "2026-01-11 10:51:52+0000",
  "name": "test_tool_phase5_1768128704057",
  "description": "Test tool for phase 5 integration tests",
  "docs": "",
  "instructions": "Use this tool to test the CLI create functionality.",
  "guid": "BOtIupAC3mLpEvLN0quJ37t_tLc",
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
- **Duration:** 416ms
- **Command:** `xano tool edit 67 -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/tool_edit_1768128713485.xs`
- **Output:**
```json
Tool updated successfully!
```

#### Delete Tool

##### PASS deletes the test tool

- **Status:** passed
- **Duration:** 163ms
- **Command:** `xano tool delete 67 -p mcp-server -w 40 --force`
- **Output:**
```json
Tool deleted successfully!
```

### Agent Commands

#### Create Agent

##### PASS creates a new agent

- **Status:** passed
- **Duration:** 315ms
- **Command:** `xano agent create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/agent_1768128714065.xs -o json`
- **Output:**
```json
{
  "id": 110,
  "created_at": "2026-01-11 10:51:54+0000",
  "updated_at": "2026-01-11 10:51:54+0000",
  "name": "Test Agent _phase5_1768128704057",
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
- **Duration:** 202ms
- **Command:** `xano agent list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 110,
    "created_at": "2026-01-11 10:51:54+0000",
    "updated_at": "2026-01-11 10:51:54+0000",
    "name": "Test Agent _phase5_1768128704057",
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
- **Command:** `xano agent get 110 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 110,
  "created_at": "2026-01-11 10:51:54+0000",
  "updated_at": "2026-01-11 10:51:54+0000",
  "name": "Test Agent _phase5_1768128704057",
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
- **Duration:** 266ms
- **Command:** `xano agent edit 110 -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/agent_edit_1768128714699.xs`
- **Output:**
```json
Agent updated successfully!
```

#### Delete Agent

##### PASS deletes the test agent

- **Status:** passed
- **Duration:** 161ms
- **Command:** `xano agent delete 110 -p mcp-server -w 40 --force`
- **Output:**
```json
Agent deleted successfully!
```

### MCP Server Commands

#### Create MCP Server

##### PASS creates a new MCP server

- **Status:** passed
- **Duration:** 304ms
- **Command:** `xano mcp-server create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/mcp_server_1768128715126.xs -o json`
- **Output:**
```json
{
  "id": 111,
  "created_at": "2026-01-11 10:51:55+0000",
  "updated_at": "2026-01-11 10:51:55+0000",
  "name": "Test MCP _phase5_1768128704057",
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
- **Duration:** 197ms
- **Command:** `xano mcp-server list -p mcp-server -w 40 -o json`
- **Output:**
```json
[
  {
    "id": 111,
    "created_at": "2026-01-11 10:51:55+0000",
    "updated_at": "2026-01-11 10:51:55+0000",
    "name": "Test MCP _phase5_1768128704057",
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
- **Duration:** 118ms
- **Command:** `xano mcp-server get 111 -p mcp-server -w 40 -o json`
- **Output:**
```json
{
  "id": 111,
  "created_at": "2026-01-11 10:51:55+0000",
  "updated_at": "2026-01-11 10:51:55+0000",
  "name": "Test MCP _phase5_1768128704057",
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
- **Command:** `xano mcp-server edit 111 -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/mcp_edit_1768128715745.xs`
- **Output:**
```json
MCP Server updated successfully!
```

#### Delete MCP Server

##### PASS deletes the test MCP server

- **Status:** passed
- **Duration:** 145ms
- **Command:** `xano mcp-server delete 111 -p mcp-server -w 40 --force`
- **Output:**
```json
MCP Server deleted successfully!
```

### Realtime Commands

#### Get Realtime Config

##### PASS gets realtime configuration

- **Status:** passed
- **Duration:** 104ms
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
- **Duration:** 312ms
- **Command:** `xano workflow-test list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]
```

