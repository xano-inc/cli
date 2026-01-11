# XanoScript Function Skill Template

Use this template when creating new function skills.

## Directory Structure

```
.claude/skills/functions/{function-name}/
├── SKILL.md          # Required - main skill file
├── EXAMPLES.md       # Optional - additional examples if needed
└── GOTCHAS.md        # Optional - edge cases and warnings
```

## Naming Conventions

- **Folder name**: Use hyphens for nested functions
  - `var` → `var/`
  - `var.update` → `var-update/`
  - `array.find` → `array-find/`
  - `db.direct_query` → `db-direct-query/`
  - `security.create_auth_token` → `security-create-auth-token/`

- **Skill name**: Same as folder name (lowercase, hyphens, max 64 chars)

## SKILL.md Template

```markdown
---
name: {function-name}
description: XanoScript {function} function - {brief description}. Use when {trigger conditions}.
---

# {function}

{One-paragraph description of what this function does}

## Syntax

\`\`\`xs
{basic syntax example}
\`\`\`

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `param1` | type | Yes/No | Description |

## Return Value

{What the function returns, if applicable}

## Examples

### Example 1: Basic Usage
{Description of what this example demonstrates}

\`\`\`xs
{working code example}
\`\`\`

**Tested in API:** `xs-{function}/example-1-basic`

### Example 2: With Parameters
{Description}

\`\`\`xs
{working code example}
\`\`\`

**Tested in API:** `xs-{function}/example-2-params`

### Example 3: Edge Case
{Description}

\`\`\`xs
{working code example}
\`\`\`

**Tested in API:** `xs-{function}/example-3-edge`

### Example 4: Practical Use Case
{Description}

\`\`\`xs
{working code example}
\`\`\`

**Tested in API:** `xs-{function}/example-4-practical`

### Example 5: Combined with Other Functions
{Description}

\`\`\`xs
{working code example}
\`\`\`

**Tested in API:** `xs-{function}/example-5-combined`

## Gotchas and Warnings

- {List any issues discovered during testing}
- {Common mistakes}
- {Edge cases that don't work as expected}

## Test Results

| API Group | Status | Notes |
|-----------|--------|-------|
| `xs-{function}` | ✅ Passed | {brief notes} |

## Related Functions

- [{related-function}](../{related-function}/SKILL.md)
```

## Writing Tips

1. **Description is critical** - Claude uses it to decide when to apply the skill
   - Include trigger keywords users would say
   - Be specific about what the function does and when to use it

2. **Test everything** - Every example must be tested via a real API endpoint

3. **Document failures** - If something doesn't work, document it in Gotchas

4. **Keep it concise** - Under 500 lines; use EXAMPLES.md for overflow

5. **Link to test APIs** - Reference the API group where examples were tested

## API Group Creation

For each function, create an API group:

```
xano_execute: "Create API group 'xs-{function}' with description 'XanoScript {function} examples - validated test endpoints'"
```

## Endpoint Naming

Within each API group, name endpoints clearly:

- `GET /example-1-basic` - Basic usage
- `GET /example-2-params` - With parameters
- `GET /example-3-edge` - Edge case handling
- `GET /example-4-practical` - Real-world scenario
- `GET /example-5-combined` - Combined with other functions
