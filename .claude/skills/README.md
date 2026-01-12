# Claude Code Skills for Xano CLI

This directory contains skills that enhance Claude Code's capabilities for working with the Xano CLI and XanoScript.

## Available Skills

| Skill | Description | When to Use |
|-------|-------------|-------------|
| `xano-cli` | Xano CLI command reference | Managing workspaces, tables, APIs, functions via CLI |
| `xanoscript-authoring` | XanoScript documentation map and search strategies | Writing, editing, or debugging XanoScript code |
| `cli-improvements` | Issue tracking format for CLI bugs and improvements | Encountered a bug or unexpected CLI behavior |

## Usage

These skills are automatically available when working in this project. They are triggered based on the task at hand:

- **Creating XanoScript?** → `/xanoscript-authoring` provides reference documentation
- **Running CLI commands?** → `/xano-cli` provides command reference
- **Found a bug or issue?** → `/cli-improvements` provides the format for documenting it

## Reference Documentation

The XanoScript reference documentation is located in:
```
.claude/reference/xanoscript-ai-documentation/
```

Key files:
- `functions.md` - Complete function reference (all XanoScript functions)
- `*_guideline.md` - Structure guides for each resource type
- `*_examples.md` - Real-world examples for each resource type
