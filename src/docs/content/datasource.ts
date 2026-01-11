import type {DocTopic} from '../index.js'

export const datasourceDocs: DocTopic = {
  name: 'datasource',
  title: 'Datasource Documentation',
  description: 'Manage datasources for organizing and categorizing tables',
  relatedTopics: ['table', 'workspace'],
  content: `
# Datasource Documentation

## Overview

Datasources in Xano provide a way to organize and categorize your database tables.
They act as logical groupings that help manage larger workspaces with many tables.
Each datasource can have a custom label and color for visual organization.

Use cases include:
- Organizing tables by domain (users, products, orders)
- Separating core data from analytics
- Color-coding for visual management
- Team organization in large projects

## Key Concepts

### Datasource Properties
- **Label**: Unique identifier for the datasource
- **Color**: Visual color for organization (hex format)

### Default Datasource
Every workspace has a default datasource where tables are created if no
specific datasource is specified.

## CLI Commands

### List Datasources
\`\`\`bash
# List all datasources
xano datasource list -w <workspace_id>

# JSON output
xano datasource list -w <workspace_id> -o json
\`\`\`

**Example Output:**
\`\`\`
Datasources:
  - default (#3498db)
  - analytics (#e74c3c)
  - user_data (#2ecc71)
\`\`\`

### Create Datasource
\`\`\`bash
# Create with label
xano datasource create -w <workspace_id> --label analytics

# Create with custom color
xano datasource create -w <workspace_id> --label analytics --color "#e74c3c"

# JSON output
xano datasource create -w <workspace_id> --label analytics -o json
\`\`\`

**Example Output:**
\`\`\`
Datasource created successfully!
Label: analytics
Color: #e74c3c
\`\`\`

### Edit Datasource
\`\`\`bash
# Update color
xano datasource edit <datasource_label> -w <workspace_id> --color "#9b59b6"
\`\`\`

### Delete Datasource
\`\`\`bash
# Delete datasource
xano datasource delete <datasource_label> -w <workspace_id>

# Force delete
xano datasource delete <datasource_label> -w <workspace_id> --force
\`\`\`

**Note:** Deleting a datasource may require moving or deleting associated tables first.

## Using Datasources with Tables

### Create Table in Datasource
When creating tables, you can specify which datasource they belong to:

\`\`\`bash
xano table create -w <workspace_id> -f table.xs --datasource analytics
\`\`\`

### List Tables by Datasource
\`\`\`bash
# Filter tables by datasource
xano table list -w <workspace_id> --datasource analytics
\`\`\`

## Color Recommendations

Use consistent colors to categorize table types:

| Category | Suggested Color | Hex |
|----------|----------------|-----|
| Core/Default | Blue | #3498db |
| User Data | Green | #2ecc71 |
| Analytics | Red | #e74c3c |
| External | Purple | #9b59b6 |
| Archive | Gray | #95a5a6 |
| Temporary | Orange | #e67e22 |

## Organization Strategies

### By Domain
\`\`\`
- users (green) - User accounts, profiles, auth
- products (blue) - Product catalog, inventory
- orders (orange) - Orders, transactions, payments
- analytics (red) - Logs, metrics, reports
\`\`\`

### By Access Pattern
\`\`\`
- core (blue) - Frequently accessed data
- archive (gray) - Historical/cold data
- cache (purple) - Temporary/cached data
\`\`\`

### By Team
\`\`\`
- frontend (green) - Tables used by frontend team
- backend (blue) - Internal backend tables
- data (red) - Data team analytics tables
\`\`\`

## Best Practices

1. **Use meaningful labels**: Clear, descriptive names
2. **Consistent color scheme**: Establish conventions for your team
3. **Document purposes**: Keep notes on what each datasource contains
4. **Don't over-segment**: Too many datasources can be confusing
5. **Plan ahead**: Consider future growth when organizing

## Related Documentation

- \`xano docs table\` - Table management
- \`xano docs workspace\` - Workspace organization
`.trim(),
}
