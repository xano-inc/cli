import type {DocTopic} from '../index.js'

export const mcpServerDocs: DocTopic = {
  name: 'mcp-server',
  title: 'MCP Server Documentation',
  description: 'Model Context Protocol servers that expose AI tools to external clients',
  relatedTopics: ['tool', 'agent', 'api'],
  content: `
# MCP Server Documentation

## Overview

MCP (Model Context Protocol) servers in Xano are gateways that expose your AI Tools
to external clients and AI models. They provide a standardized endpoint that
AI-powered applications can connect to, discover available tools, and execute them.

Use cases include:
- Exposing tools to Claude Desktop, Cursor, and other MCP clients
- Creating unified interfaces for AI tool collections
- Enabling external AI integrations with your backend

## Key Concepts

### MCP Server Structure
- **canonical**: Unique identifier for the server
- **description**: Internal documentation
- **instructions**: Guidelines for AI on the server's purpose
- **tags**: Categories for organization
- **tools**: List of tools exposed by the server

### MCP Protocol
The Model Context Protocol is an open standard for connecting AI models
to external data sources and tools. Xano MCP servers implement this protocol.

## CLI Commands

### List MCP Servers
\`\`\`bash
# List all MCP servers
xano mcp-server list -w <workspace_id>

# JSON output
xano mcp-server list -w <workspace_id> -o json
\`\`\`

### Get MCP Server Details
\`\`\`bash
# Get server info
xano mcp-server get <server_id> -w <workspace_id>

# Get as XanoScript
xano mcp-server get <server_id> -w <workspace_id> -o xs
\`\`\`

### Create MCP Server
\`\`\`bash
# Create from XanoScript file
xano mcp-server create -w <workspace_id> -f mcp-server.xs

# Create with JSON output
xano mcp-server create -w <workspace_id> -f mcp-server.xs -o json
\`\`\`

### Edit MCP Server
\`\`\`bash
xano mcp-server edit <server_id> -w <workspace_id> -f updated.xs
\`\`\`

### Delete MCP Server
\`\`\`bash
# With confirmation
xano mcp-server delete <server_id> -w <workspace_id>

# Force delete
xano mcp-server delete <server_id> -w <workspace_id> --force
\`\`\`

### MCP Server Triggers
\`\`\`bash
# List server triggers
xano mcp-server trigger list <server_id> -w <workspace_id>

# Create server trigger
xano mcp-server trigger create <server_id> -w <workspace_id> -f trigger.xs

# Delete server trigger
xano mcp-server trigger delete <server_id> <trigger_id> -w <workspace_id> --force
\`\`\`

## XanoScript Syntax

### Basic MCP Server
\`\`\`xanoscript
mcp_server "Task Manager MCP" {
  canonical = "task-manager-v1"
  description = "MCP server for task management operations"
  instructions = "Manages tasks for users. All tools relate to user task records."
  tags = ["internal", "tasks"]
  tools = [
    { name: "add_task" },
    { name: "delete_task" },
    { name: "edit_task" },
    { name: "get_user_tasks" }
  ]
}
\`\`\`

### Customer Support MCP Server
\`\`\`xanoscript
mcp_server "Customer Support MCP" {
  canonical = "support-mcp-v1"
  description = "Tools for customer support operations"
  instructions = "A set of tools for managing customer support tickets, including creating, updating, and closing tickets."
  tags = ["support", "customer-service"]
  tools = [
    { name: "get_customer_info" },
    { name: "create_ticket" },
    { name: "update_ticket" },
    { name: "close_ticket" },
    { name: "search_knowledge_base" }
  ]
}
\`\`\`

### E-commerce MCP Server
\`\`\`xanoscript
mcp_server "E-commerce MCP" {
  canonical = "ecommerce-mcp-v1"
  description = "Tools for e-commerce operations"
  instructions = "Provides tools for product lookup, inventory management, and order processing."
  tags = ["ecommerce", "sales"]
  tools = [
    { name: "search_products" },
    { name: "get_inventory" },
    { name: "create_order" },
    { name: "get_order_status" },
    { name: "process_return" }
  ]
}
\`\`\`

## Connecting to MCP Servers

### Claude Desktop Configuration
Add to your Claude Desktop config:
\`\`\`json
{
  "mcpServers": {
    "my-xano-server": {
      "url": "https://your-workspace.xano.io/mcp/server-canonical"
    }
  }
}
\`\`\`

### Cursor Configuration
Add to your Cursor settings:
\`\`\`json
{
  "mcp.servers": {
    "my-xano-server": {
      "url": "https://your-workspace.xano.io/mcp/server-canonical"
    }
  }
}
\`\`\`

## Best Practices

1. **Use clear naming conventions**: Descriptive names and memorable canonical IDs
2. **Write comprehensive instructions**: Provide high-level overview of tool capabilities
3. **Group related tools**: Create logical groupings within each server
4. **Use tags for organization**: Categorize servers for easier management
5. **Keep servers focused**: Each server should serve a specific domain

## MCP Server URL Structure

After creating an MCP server, it will be accessible at:
\`\`\`
https://your-workspace.xano.io/mcp/{canonical}
\`\`\`

The canonical ID must be unique within your workspace.

## Related Documentation

- \`xano docs tool\` - AI tools that MCP servers expose
- \`xano docs agent\` - AI agents that can use MCP tools
- \`xano docs api\` - REST API endpoints for comparison
`.trim(),
}
