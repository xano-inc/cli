import type {DocTopic} from '../index.js'

export const addonDocs: DocTopic = {
  name: 'addon',
  title: 'Addon Documentation',
  description: 'Reusable database query components that extend tables',
  relatedTopics: ['table', 'function', 'api'],
  content: `
# Addon Documentation

## What is an Addon?

An **Addon** is a reusable database query component that extends a specific table.
Addons are used to fetch related data efficiently and can be called from within
other db.query operations in functions and API endpoints.

Think of addons as "sub-queries" that can be attached to main queries to enrich
the returned data with related information.

## Key Concepts

### 1. Addons Always Extend a Table
Every addon is tied to a specific database table. The table MUST exist before
you can create an addon that references it.

### 2. Single db.query Only
Addons are restricted to containing exactly ONE db.query statement.
No other operations (var, conditional, loops) are allowed in the addon stack.

### 3. Reusable Across Functions/APIs
Once created, an addon can be referenced from any db.query in your workspace,
making it easy to consistently fetch related data.

## XanoScript Syntax

\`\`\`xanoscript
addon <addon_name> {
  input {
    <type> <input_name>? {
      table = "<source_table>"    # Optional: Reference to related table
    }
  }
  stack {
    db.query <table_name> {
      where = <condition>
      return = {type: "<return_type>"}  # single, list, count, exists
    }
  }
}
\`\`\`

## Examples

### Example 1: Count Related Records

Count how many likes a blog post has:

\`\`\`xanoscript
addon blog_post_like_count {
  input {
    int blog_post_id? {
      table = "blog_post"
    }
  }
  stack {
    db.query blog_post_like {
      where = $db.blog_post_like.blog_post_id == $input.blog_post_id
      return = {type: "count"}
    }
  }
}
\`\`\`

### Example 2: Fetch Single Related Record

Get user details for a post author:

\`\`\`xanoscript
addon post_author {
  input {
    int user_id? {
      table = "user"
    }
  }
  stack {
    db.query user {
      where = $db.user.id == $input.user_id
      return = {type: "single"}
    }
  }
}
\`\`\`

### Example 3: Fetch List of Related Records

Get all comments for a post:

\`\`\`xanoscript
addon post_comments {
  input {
    int post_id? {
      table = "post"
    }
  }
  stack {
    db.query comment {
      where = $db.comment.post_id == $input.post_id
      return = {type: "list"}
    }
  }
}
\`\`\`

## Using Addons in Queries

Once created, reference addons in your db.query operations:

\`\`\`xanoscript
db.query blog_post {
  where = $db.blog_post.author_id == $auth.id
  return = {type: "list", paging: {page: 1, per_page: 25}}
  addon = [
    {
      name : "blog_post_like_count"
      input: {blog_post_id: $output.id}
      as   : "items.like_count"
    }
    {
      name : "blog_post_comment_count"
      input: {blog_post_id: $output.id}
      as   : "items.comment_count"
    }
  ]
} as $posts
\`\`\`

## CLI Commands

### Create an Addon
\`\`\`bash
# Create from XanoScript file
xano addon create -w <workspace_id> -f addon.xs

# With JSON output
xano addon create -w <workspace_id> -f addon.xs -o json
\`\`\`

### List Addons
\`\`\`bash
# List all addons
xano addon list -w <workspace_id>

# Search for specific addon
xano addon list -w <workspace_id> --search "like_count"
\`\`\`

### Get Addon Details
\`\`\`bash
xano addon get <addon_id> -w <workspace_id>
\`\`\`

### Edit an Addon
\`\`\`bash
xano addon edit <addon_id> -w <workspace_id> -f updated_addon.xs
\`\`\`

### Delete an Addon
\`\`\`bash
# With confirmation prompt
xano addon delete <addon_id> -w <workspace_id>

# Skip confirmation
xano addon delete <addon_id> -w <workspace_id> --force
\`\`\`

### Manage Security
\`\`\`bash
# Restrict to API group
xano addon security <addon_id> -w <workspace_id> --apigroup-guid <guid>

# Remove restrictions
xano addon security <addon_id> -w <workspace_id> --clear
\`\`\`

## Common Errors

### "Addons are restricted to a single db.query statement"
**Cause**: Your addon contains operations other than a single db.query.
**Solution**: Remove all var, conditional, or other statements. Keep only one db.query.

\`\`\`xanoscript
# WRONG - has var statement
addon my_addon {
  input { int id }
  stack {
    var $x { value = 1 }           # Not allowed!
    db.query table { ... }
  }
}

# CORRECT - only db.query
addon my_addon {
  input { int id }
  stack {
    db.query table {
      where = $db.table.id == $input.id
      return = {type: "single"}
    }
  }
}
\`\`\`

### "Syntax error: Invalid block: dbtable"
**Cause**: Using \`dbtable\` instead of \`table\` in input definition.
**Solution**: Use \`table = "table_name"\` syntax.

\`\`\`xanoscript
# WRONG
input {
  int record_id {
    dbtable = "my_table"    # Invalid!
  }
}

# CORRECT
input {
  int record_id? {
    table = "my_table"      # Correct syntax
  }
}
\`\`\`

### "Table not found"
**Cause**: The table referenced in the addon doesn't exist.
**Solution**: Create the table first, then create the addon.

\`\`\`bash
# 1. First create the table
xano table create -w 40 -f my_table.xs

# 2. Then create the addon that references it
xano addon create -w 40 -f my_addon.xs
\`\`\`

## Return Types

| Type | Description | Returns |
|------|-------------|---------|
| \`single\` | First matching record | Object or null |
| \`list\` | All matching records | Array of objects |
| \`count\` | Count of matches | Integer |
| \`exists\` | Whether any match exists | Boolean |

## Best Practices

1. **Name descriptively**: Use names like \`user_post_count\` not \`addon1\`
2. **Keep focused**: Each addon should do one thing well
3. **Use appropriate return types**: \`count\` for aggregations, \`single\` for lookups
4. **Consider performance**: Addons run for each record in parent query
5. **Document with table references**: Use \`table = "..."\` in inputs for clarity

## Related Documentation

- \`xano docs table\` - Table creation and schema
- \`xano docs function\` - Functions that can use addons
- \`xano docs api\` - API endpoints that can use addons
`.trim(),
}
