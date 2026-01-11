# CLI Help Documentation Improvement Plan

## Current State

The CLI uses oclif's default help system with minimal customization:
- **Short descriptions**: One-line command descriptions
- **Basic examples**: Simple usage examples showing command + expected output
- **Flag definitions**: Standard flag help with options
- **No contextual documentation**: Missing XanoScript syntax, dependencies, best practices

### Current Help Output (Example: `xano addon create --help`)
```
Create a new addon from XanoScript file

USAGE
  $ xano addon create -f <value> [-p <value>] [-w <value>] [-o summary|json]

FLAGS
  -f, --file=<value>     (required) Path to XanoScript file
  -o, --output=<option>  [default: summary] Output format
  -p, --profile=<value>  Profile to use for this command
  -w, --workspace=<value> Workspace ID

EXAMPLES
  $ xano addon create -w 40 -f addon.xs
  Addon created successfully!
```

### What's Missing
- **What is an addon?** No conceptual explanation
- **XanoScript syntax**: No guidance on what the file should contain
- **Dependencies**: No mention that addons require a table
- **Best practices**: No tips for common patterns
- **Troubleshooting**: No help for common errors

## Proposed Solution: `xano docs` Command

### Overview
Add a new `docs` command that provides verbose, contextual documentation for any topic or command.

### Usage
```bash
# Topic documentation
xano docs addon              # Full addon documentation
xano docs table              # Full table documentation

# Command-specific documentation
xano docs addon:create       # Detailed addon create guide

# List available documentation
xano docs                    # List all available docs
xano docs --list             # Same as above

# Search documentation
xano docs --search "db.query" # Find docs mentioning db.query
```

### Features
1. **Markdown rendering**: Documentation stored as markdown, rendered nicely in terminal
2. **XanoScript examples**: Full, working code examples
3. **Dependency information**: What needs to exist before using a command
4. **Common errors**: Troubleshooting guide for frequent issues
5. **Links to external docs**: References to xanoscript-docs and metadata-api-docs

## Implementation Plan

### Phase 1: Documentation Infrastructure

1. **Create docs directory structure**
   ```
   src/docs/
   ├── index.ts           # Documentation registry
   ├── renderer.ts        # Markdown terminal renderer
   └── content/
       ├── addon.md
       ├── table.md
       ├── function.md
       ├── api.md
       └── ...
   ```

2. **Create `docs` command**
   - `src/commands/docs/index.ts` - Main docs command
   - Lists available topics when run without args
   - Shows full documentation for specified topic

### Phase 2: Add Documentation Content

1. **Addon Documentation** (priority - as example)
   - What addons are
   - XanoScript syntax
   - Table dependency requirement
   - Common patterns
   - Troubleshooting

2. **Table Documentation**
   - Schema syntax
   - Field types
   - Index configuration
   - Relationships

3. **Other topics** (prioritized by complexity)
   - function, api, apigroup, task, middleware, etc.

### Phase 3: Integration

1. **Help command enhancement**
   - Add hint at bottom of --help: "Run 'xano docs <topic>' for detailed documentation"

2. **Error message enhancement**
   - When syntax errors occur, suggest: "See 'xano docs addon' for XanoScript syntax"

## Documentation Template

Each documentation file should include:

```markdown
# {Topic} Documentation

## Overview
Brief explanation of what this resource is and when to use it.

## Prerequisites
- Required resources that must exist first
- Required permissions
- Profile setup

## XanoScript Syntax
Full syntax documentation with annotated examples.

## Commands

### create
Detailed explanation of the create command.

### list
...

## Examples

### Basic Example
Working example with explanation.

### Advanced Example
More complex real-world example.

## Common Errors

### Error: "Addons are restricted to a single db.query statement"
Cause and solution.

### Error: "Syntax error: Invalid block"
Cause and solution.

## Related
- Links to related topics
- External documentation
```

## Alternative Approaches Considered

### Option A: Extended --help flag
```bash
xano addon create --help --verbose
```
**Pros**: Familiar pattern
**Cons**: Clutters help output, hard to maintain in command files

### Option B: Man pages
```bash
man xano-addon
```
**Pros**: Unix convention
**Cons**: Harder to install, not cross-platform

### Option C: Web docs only
**Pros**: Easy to update
**Cons**: Requires internet, not integrated

## Recommendation

**Implement the `xano docs` command** because:
1. Separates concerns: --help for quick reference, docs for learning
2. Easy to maintain: Markdown files are simple to update
3. Discoverable: Users can browse available documentation
4. AI-friendly: Full context available for AI assistants
5. Extensible: Can add search, examples, etc.

## Success Metrics

1. Users can find XanoScript syntax without external docs
2. Common errors include helpful suggestions
3. AI assistants can provide accurate help using `xano docs` output
4. Reduced support questions for syntax/usage issues
