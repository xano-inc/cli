import type {DocTopic} from '../index.js'

export const gettingStartedDocs: DocTopic = {
  name: 'getting-started',
  title: 'Getting Started with Xano CLI',
  description: 'Quick start guide for the Xano CLI',
  relatedTopics: ['table', 'addon', 'function', 'api'],
  content: `
# Getting Started with Xano CLI

## Overview

The Xano CLI (\`@xano/cli\`) is a command-line interface for managing your Xano
workspace. It allows you to create, read, update, and delete resources like
tables, functions, APIs, and more using XanoScript files.

## Installation

\`\`\`bash
npm install -g @xano/cli
\`\`\`

## Setting Up a Profile

Before using the CLI, you need to create a profile with your Xano credentials:

\`\`\`bash
# Interactive setup (recommended)
xano profile create

# Or with flags
xano profile create --name my-profile \\
  --token YOUR_API_TOKEN \\
  --instance YOUR_INSTANCE \\
  --workspace 40
\`\`\`

### Finding Your Credentials

1. **API Token**: Settings > Account > Metadata API > Generate Token
2. **Instance**: Your Xano instance URL (e.g., \`x123-abc-456.xano.io\`)
3. **Workspace ID**: Found in your workspace URL

## Basic Usage

### Profile Management
\`\`\`bash
xano profile list              # List all profiles
xano profile get my-profile    # Get profile details
xano profile set-default prof  # Set default profile
\`\`\`

### Working with Tables
\`\`\`bash
xano table list -w 40          # List tables in workspace 40
xano table get 123 -w 40       # Get table details
xano table create -w 40 -f table.xs   # Create from XanoScript
\`\`\`

### Working with Functions
\`\`\`bash
xano function list -w 40
xano function get 456 -w 40
xano function create -w 40 -f function.xs
\`\`\`

### Working with APIs
\`\`\`bash
xano apigroup list -w 40
xano api list -w 40 -g 789
xano api create -w 40 -g 789 -f api.xs
\`\`\`

## XanoScript Files

Most create/edit commands accept a XanoScript file (\`.xs\`). XanoScript is a
domain-specific language for defining Xano resources.

### Example: Table Definition
\`\`\`xanoscript
table "product" {
  auth = false
  schema {
    int id
    text name filters=trim
    decimal price filters=min:0
    timestamp created_at?=now
  }
  index = [
    {type: "primary", field: [{name: "id"}]}
  ]
}
\`\`\`

### Example: Function Definition
\`\`\`xanoscript
function "utils/calculate_total" {
  input {
    decimal[] prices
    decimal tax_rate?=0.1
  }
  stack {
    var $subtotal {
      value = $input.prices|sum
    }
    var $tax {
      value = $subtotal * $input.tax_rate
    }
    var $total {
      value = $subtotal + $tax
    }
  }
  response = {subtotal: $subtotal, tax: $tax, total: $total}
}
\`\`\`

## Output Formats

Most commands support multiple output formats:

| Format | Description |
|--------|-------------|
| \`summary\` | Human-readable format (default) |
| \`json\` | Full JSON response |
| \`xs\` | XanoScript format (where applicable) |

\`\`\`bash
xano table get 123 -w 40             # Summary format
xano table get 123 -w 40 -o json     # JSON format
xano table get 123 -w 40 -o xs       # XanoScript format
\`\`\`

## Using Environment Variables

Set profile via environment variable:
\`\`\`bash
export XANO_PROFILE=my-profile
xano table list -w 40    # Uses my-profile automatically
\`\`\`

## Common Workflows

### 1. Export Existing Resource, Modify, Re-import
\`\`\`bash
# Export to XanoScript
xano table get 123 -w 40 -o xs > my_table.xs

# Edit the file...

# Update the table
xano table edit 123 -w 40 -f my_table.xs
\`\`\`

### 2. Create Resources in Order (Dependencies)
\`\`\`bash
# 1. Create table first (required for addons)
xano table create -w 40 -f user_activity.xs

# 2. Create addon that references the table
xano addon create -w 40 -f user_activity_count.xs

# 3. Create function that uses the addon
xano function create -w 40 -f get_user_stats.xs
\`\`\`

### 3. Batch Operations
\`\`\`bash
# List all functions as JSON for processing
xano function list -w 40 -o json | jq '.[].name'
\`\`\`

## Getting Help

\`\`\`bash
xano --help              # Global help
xano table --help        # Topic help
xano table create --help # Command help

# Detailed documentation
xano docs                # List all documentation
xano docs addon          # Addon documentation
xano docs table          # Table documentation
\`\`\`

## Next Steps

1. **Set up a profile**: \`xano profile create\`
2. **Explore your workspace**: \`xano table list -w <id>\`
3. **Read topic documentation**: \`xano docs <topic>\`
4. **Check XanoScript examples** in the xanoscript-docs folder

## Available Topics

Run \`xano docs\` to see all available documentation topics, including:
- \`table\` - Database tables and schemas
- \`addon\` - Reusable query components
- \`function\` - Custom functions
- \`api\` - API endpoint management
- \`task\` - Scheduled tasks
`.trim(),
}
