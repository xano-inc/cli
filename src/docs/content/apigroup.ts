import type {DocTopic} from '../index.js'

export const apigroupDocs: DocTopic = {
  name: 'apigroup',
  title: 'API Group Documentation',
  description: 'Organize and manage groups of related API endpoints',
  relatedTopics: ['api', 'middleware'],
  content: `
# API Group Documentation

## Overview

API Groups are containers that organize related API endpoints together.
They define shared settings like base paths, authentication requirements,
and can apply common middleware to all endpoints in the group.

## Key Concepts

### Grouping by Domain
Organize endpoints by business domain:
- \`users\` - User management endpoints
- \`auth\` - Authentication endpoints
- \`products\` - Product catalog endpoints

### Base Path
Each group has a base path that prefixes all its endpoints:
- Group base: \`/api:users\`
- Endpoint path: \`/profile\`
- Full URL: \`/api:users/profile\`

## CLI Commands

### List API Groups
\`\`\`bash
# List all groups
xano apigroup list -w <workspace_id>

# JSON output
xano apigroup list -w <workspace_id> -o json
\`\`\`

### Get Group Details
\`\`\`bash
xano apigroup get <group_id> -w <workspace_id>
\`\`\`

### Create API Group
\`\`\`bash
# Create with name
xano apigroup create -w <workspace_id> --name "users" --description "User APIs"
\`\`\`

### Edit API Group
\`\`\`bash
xano apigroup edit <group_id> -w <workspace_id> --name "new_name"
\`\`\`

### Delete API Group
\`\`\`bash
# Warning: This deletes all endpoints in the group!
xano apigroup delete <group_id> -w <workspace_id> --force
\`\`\`

## Best Practices

1. **Use domain-based naming**: Group by feature area (users, orders, etc.)
2. **Keep groups focused**: Each group should handle one area of concern
3. **Apply consistent auth**: Set authentication at the group level when possible
4. **Document group purpose**: Add clear descriptions

## Related Documentation

- \`xano docs api\` - Creating API endpoints
- \`xano docs middleware\` - Shared middleware
`.trim(),
}
