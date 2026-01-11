# Xano CLI Skill

The Xano CLI provides full command-line access to Xano's Metadata API for **tables**, **APIs**, and **functions**.

## CLI vs MCP - Complete Comparison

| Capability | CLI | MCP | Best Tool |
|------------|-----|-----|-----------|
| **Create Tables** | `table create` | `xano_execute` | **Either** |
| **Edit Tables** | `table edit` | `xano_execute` | CLI (for XanoScript files) |
| **Create API Groups** | `apigroup create` | `xano_execute` | **Either** |
| **Create API Endpoints** | `api create` | `xano_execute` | CLI (for XanoScript files) |
| **Edit API Endpoints** | `api edit` | `xano_execute` | CLI (for XanoScript files) |
| **Export XanoScript** | `table/api get -o xs` | Limited | CLI |
| **Create Functions** | `function create` | N/A | CLI |
| **Edit Functions** | `function edit` | N/A | CLI |
| **Auto-CRUD Generation** | Manual | Automatic | MCP |
| **Natural Language** | N/A | Full support | MCP |
| **Ephemeral Jobs** | `ephemeral:run:job` | N/A | CLI |
| **Version Control** | Export to files | N/A | CLI |

**Key Insight:** Use CLI for **file-based workflows** and **version control**. Use MCP for **natural language** and **auto-CRUD**.

---

## Installation & Configuration

### Verify Installation
```bash
# From project's xano-cli folder
cd xano-cli && npm install && npm link

# Verify
xano --version
xano profile:list --details
```

**Default Profile:** `mcp-server`
- Instance: `https://xhib-njau-6vza.d2.dev.xano.io`
- Workspace: `40`

---

## Database Tables

### List Tables
```bash
xano table list -w 40
xano table list -w 40 -o json
```

### Get Table (with XanoScript export)
```bash
xano table get 123 -w 40           # Summary
xano table get 123 -w 40 -o xs     # Export as XanoScript
xano table get 123 -w 40 -o json   # Full JSON
```

### Create Table
```bash
# From flags
xano table create -w 40 --name users --description "User accounts"

# From XanoScript file
xano table create -w 40 -f table.xs

# From JSON file
xano table create -w 40 -f table.json
```

### Edit Table
```bash
xano table edit 123 -w 40              # Opens in $EDITOR
xano table edit 123 -w 40 -f table.xs  # Update from file
xano table edit 123 -w 40 --name new_name
```

### Delete Table
```bash
xano table delete 123 -w 40
xano table delete 123 -w 40 --force   # Skip confirmation
```

---

## API Groups

### List API Groups
```bash
xano apigroup list -w 40
xano apigroup list -w 40 -o json
```

### Get API Group
```bash
xano apigroup get 5 -w 40
xano apigroup get 5 -w 40 -o xs    # Export as XanoScript
```

### Create API Group
```bash
# From flags
xano apigroup create -w 40 --name user --description "User APIs" --swagger

# From XanoScript file
xano apigroup create -w 40 -f apigroup.xs
```

### Edit API Group
```bash
xano apigroup edit 5 -w 40
xano apigroup edit 5 -w 40 --name new_name --no-swagger
```

### Delete API Group
```bash
xano apigroup delete 5 -w 40
xano apigroup delete 5 -w 40 --force
```

---

## API Endpoints

### List APIs in a Group
```bash
xano api list 5 -w 40              # List APIs in group 5
xano api list 5 -w 40 -o json --include_draft
```

### Get API Endpoint
```bash
xano api get 5 123 -w 40           # Get API 123 in group 5
xano api get 5 123 -w 40 -o xs     # Export as XanoScript
```

### Create API Endpoint
```bash
# From flags
xano api create 5 -w 40 --name user --verb GET --description "Get user"

# From XanoScript file
xano api create 5 -w 40 -f endpoint.xs

# From stdin
cat endpoint.xs | xano api create 5 -w 40 --stdin
```

### Edit API Endpoint
```bash
xano api edit 5 123 -w 40              # Opens in $EDITOR
xano api edit 5 123 -w 40 -f new.xs    # Update from file
xano api edit 5 123 -w 40 --publish    # Publish after editing
```

### Delete API Endpoint
```bash
xano api delete 5 123 -w 40
xano api delete 5 123 -w 40 --force
```

---

## Functions

### List Functions
```bash
xano function:list -w 40
xano function:list -w 40 -o json
xano function:list -w 40 --include_xanoscript
```

### Get Function
```bash
xano function:get 156 -w 40           # Summary
xano function:get 156 -w 40 -o xs     # XanoScript (for editing)
xano function:get 156 -w 40 -o json   # Full JSON
```

### Create Function
```bash
xano function:create -w 40 -f function.xs
cat function.xs | xano function:create -w 40 --stdin
```

### Edit Function
```bash
xano function:edit 156 -w 40           # Opens in $EDITOR
xano function:edit 156 -w 40 -f new.xs
xano function:edit 156 -w 40 --publish
```

---

## Ephemeral Jobs & Services

Run XanoScript code without creating permanent resources.

### Run Job (execute and return result)
```bash
xano ephemeral:run:job -f script.xs
xano ephemeral:run:job -f script.xs -a args.json  # With input arguments
xano ephemeral:run:job -f script.xs --edit        # Edit in $EDITOR first
```

### Run Service (start API endpoints)
```bash
xano ephemeral:run:service -f service.xs
```

---

## Complete Development Workflow

### 1. Export Existing Resources for Version Control
```bash
# Export table schema
xano table get 534 -w 40 -o xs > schemas/user.xs

# Export API endpoint
xano api get 217 1458 -w 40 -o xs > apis/get_users.xs

# Export function
xano function:get 156 -w 40 -o xs > functions/get_low_stock.xs
```

### 2. Create New Table from File
```bash
# Write table schema
cat > schemas/product.xs << 'EOF'
table product {
  description = "Product catalog"
  column id { type = int, auto = true }
  column name { type = text }
  column price { type = decimal }
  column stock { type = int, default = 0 }
}
EOF

# Create in Xano
xano table create -w 40 -f schemas/product.xs
```

### 3. Create API Endpoint from File
```bash
# Write endpoint
cat > apis/get_products.xs << 'EOF'
query "products" verb=GET {
  description = "List all products"
  input {
    int limit?=10 { description = "Max results" }
  }
  stack {
    db.direct_query {
      sql = "SELECT * FROM x40_575 LIMIT ?"
      response_type = "list"
      arg = $input.limit
    } as $products
  }
  response = $products
}
EOF

# Create in Xano (in API group 5)
xano api create 5 -w 40 -f apis/get_products.xs
```

### 4. Create Function and Use in Endpoint
```bash
# Write function
cat > functions/calculate_total.xs << 'EOF'
function calculate_total {
  description = "Calculate order total with tax"
  input {
    decimal subtotal { description = "Order subtotal" }
    decimal tax_rate?=0.08 { description = "Tax rate" }
  }
  stack {
    var $tax { value = `$input.subtotal * $input.tax_rate` }
    var $total { value = `$input.subtotal + $tax` }
  }
  response = {
    subtotal: $input.subtotal,
    tax: $tax,
    total: $total
  }
}
EOF

# Create function
xano function:create -w 40 -f functions/calculate_total.xs

# Then call it from an endpoint using function.run
```

---

## Version Control Workflow

### Export All Resources
```bash
#!/bin/bash
# export-all.sh

WORKSPACE=40
mkdir -p schemas apis functions

# Export tables
for id in $(xano table list -w $WORKSPACE -o json | jq -r '.[].id'); do
  name=$(xano table get $id -w $WORKSPACE -o json | jq -r '.name')
  echo "Exporting table: $name"
  xano table get $id -w $WORKSPACE -o xs > "schemas/${name}.xs"
done

# Export API groups and endpoints
for group_id in $(xano apigroup list -w $WORKSPACE -o json | jq -r '.[].id'); do
  group_name=$(xano apigroup get $group_id -w $WORKSPACE -o json | jq -r '.name')
  mkdir -p "apis/${group_name}"

  for api_id in $(xano api list $group_id -w $WORKSPACE -o json | jq -r '.[].id'); do
    api_name=$(xano api get $group_id $api_id -w $WORKSPACE -o json | jq -r '.name')
    echo "Exporting API: $group_name/$api_name"
    xano api get $group_id $api_id -w $WORKSPACE -o xs > "apis/${group_name}/${api_name}.xs"
  done
done

# Export functions
for id in $(xano function:list -w $WORKSPACE -o json | jq -r '.[].id'); do
  name=$(xano function:get $id -w $WORKSPACE -o json | jq -r '.name')
  echo "Exporting function: $name"
  xano function:get $id -w $WORKSPACE -o xs > "functions/${name}.xs"
done
```

### Git Workflow
```bash
# 1. Export current state
./export-all.sh

# 2. Edit locally
code apis/crm/get_contacts.xs

# 3. Push back to Xano
xano api edit 217 1458 -w 40 -f apis/crm/get_contacts.xs --publish

# 4. Commit to Git
git add .
git commit -m "Update get_contacts endpoint"
```

---

## Table Name Convention

When writing SQL in XanoScript, use: `x{workspace_id}_{table_id}`

```bash
# Get table IDs first
xano table list -w 40 -o json | jq '.[] | {id, name}'

# Returns:
# {"id": 534, "name": "user"}
# {"id": 575, "name": "product"}

# Use in SQL:
# x40_534 = user table
# x40_575 = product table
```

---

## XanoScript Syntax Reference

### Table Definition
```xs
table my_table {
  description = "Table description"

  column id { type = int, auto = true }
  column name { type = text, required = true }
  column email { type = text, unique = true }
  column status { type = enum, values = ["active", "inactive"], default = "active" }
  column created_at { type = timestamp, default = now }
}
```

### API Endpoint (Query)
```xs
query "endpoint-name" verb=GET {
  description = "What this endpoint does"
  auth = "user"  // Optional: require authentication

  input {
    int id { description = "Record ID" }
    text search? { description = "Search term (optional)" }
    int limit?=10 { description = "Limit with default" }
  }

  stack {
    // Database, logic, etc.
  }

  response = $result
}
```

### Function
```xs
function my_function {
  description = "What this function does"

  input {
    text name { description = "Required parameter" }
    int count?=10 { description = "Optional with default" }
  }

  stack {
    // Your logic here
  }

  response = $result
}
```

---

## Global Options

All commands support these options:

| Flag | Description |
|------|-------------|
| `-p, --profile` | Profile to use (or set `XANO_PROFILE` env var) |
| `-w, --workspace` | Workspace ID (overrides profile default) |
| `-o, --output` | Output format: `summary` (default), `json`, or `xs` |
| `-b, --branch` | Branch name (for API operations) |

---

## When to Use CLI vs MCP

### Use CLI When:
- Version controlling XanoScript files
- Bulk exporting resources
- Editing in your IDE with `$EDITOR`
- Running ephemeral jobs for testing
- Scripting/automation workflows

### Use MCP When:
- Natural language is easier than writing XanoScript
- Auto-generating CRUD endpoints with tables
- Quick one-off operations
- Don't need file-based workflow

---

## Troubleshooting

### "Profile not found"
```bash
xano profile:list
xano profile:set-default mcp-server
```

### "Workspace not found"
```bash
xano workspace:list
# Find correct workspace ID, then:
xano profile:edit mcp-server -w CORRECT_ID
```

### Authentication Errors
```bash
xano profile:delete mcp-server
xano profile:wizard  # Recreate interactively
```

### Syntax Errors in XanoScript
Export and debug:
```bash
xano api get GROUP_ID API_ID -w 40 -o xs > debug.xs
code debug.xs  # Inspect syntax
```

---

## Help

```bash
xano --help
xano table --help
xano api --help
xano apigroup --help
xano function --help
xano <command> --help
```
