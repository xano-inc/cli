import type {DocTopic} from '../index.js'

export const branchDocs: DocTopic = {
  name: 'branch',
  title: 'Branch Documentation',
  description: 'Manage workspace branches for development and deployment',
  relatedTopics: ['workspace'],
  content: `
# Branch Documentation

## Overview

Branches in Xano allow you to create isolated versions of your workspace for
development, testing, and deployment. Each branch can have its own API endpoints,
database schema changes, and configuration.

Use cases include:
- Development and testing in isolation
- Feature branches for new functionality
- Staging environments before going live

## Key Concepts

### Branch Types
- **Live Branch**: The production branch serving live traffic
- **Default Branch**: The primary development branch
- **Feature Branches**: Additional branches for development

### Branch Protection
- You cannot delete the live branch
- You cannot delete the default branch
- Branches can be promoted to live status

## CLI Commands

### List Branches
\`\`\`bash
# List all branches
xano branch list -w <workspace_id>

# JSON output
xano branch list -w <workspace_id> -o json
\`\`\`

**Example Output:**
\`\`\`
Available branches:
  - v1 (live)
  - dev
  - feature-auth
\`\`\`

### Delete Branch
\`\`\`bash
# Delete a branch (with confirmation)
xano branch delete <branch_label> -w <workspace_id>

# Force delete
xano branch delete <branch_label> -w <workspace_id> --force
\`\`\`

**Note:** Cannot delete live or default branches.

## Branch Workflow

### Typical Development Flow
1. Create a feature branch from the default branch
2. Make changes and test in the feature branch
3. Merge changes back to default
4. Promote default to live when ready

### Using Branches with CLI
Most CLI commands support a \`--branch\` flag to target specific branches:

\`\`\`bash
# List APIs in a specific branch
xano api list -w <workspace_id> --branch dev

# Get table schema from a branch
xano table schema get <table_name> -w <workspace_id> --branch feature-auth
\`\`\`

## Branch Naming Conventions

Recommended patterns:
- \`main\` or \`v1\` - Live/production branch
- \`dev\` or \`development\` - Main development branch
- \`feature-*\` - Feature branches
- \`fix-*\` - Bug fix branches
- \`staging\` - Pre-production testing

## Best Practices

1. **Use descriptive branch names**: Clearly indicate the purpose
2. **Test before promoting**: Always test in a branch before going live
3. **Clean up old branches**: Delete branches when no longer needed
4. **Document branch purposes**: Keep track of what each branch is for

## Related Documentation

- \`xano docs workspace\` - Workspace management
- \`xano docs api\` - API endpoints affected by branches
- \`xano docs table\` - Table schema changes across branches
`.trim(),
}
