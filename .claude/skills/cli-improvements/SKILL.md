---
name: cli-improvements
description: Use this skill to document bugs, unexpected behavior, or improvement opportunities discovered while using the Xano CLI.
---

# CLI Improvement Tracking

When you encounter bugs, unexpected results, or improvement opportunities while using the Xano CLI, document them for future fixes.

## When to Document

- CLI command returns unexpected error
- Output format is inconsistent or confusing
- Missing functionality that would be useful
- Error messages that are unclear
- Edge cases that aren't handled well
- API responses that could be parsed better

## How to Document

Add issues to `.claude/cli-issues.md` using this format:

```markdown
## [DATE] - Brief Title

**Command:** `xano <command> <args>`

**Expected:** What you expected to happen

**Actual:** What actually happened

**Error/Output:**
```
paste relevant output here
```

**Suggested Fix:** (optional) Ideas for how to improve

**Priority:** low | medium | high

**Status:** open | in-progress | fixed

---
```

## Example Entry

```markdown
## 2025-01-12 - Table content list missing pagination info

**Command:** `xano table content list 123 -w 40`

**Expected:** Should show pagination metadata (total records, current page)

**Actual:** Only shows raw records array, no pagination context

**Error/Output:**
```
[
  {"id": 1, "name": "test"},
  {"id": 2, "name": "test2"}
]
```

**Suggested Fix:** Add `--show-meta` flag or include pagination in summary output

**Priority:** medium

**Status:** open

---
```

## Issue Categories

Tag issues with these categories in the title:

- `[BUG]` - Something is broken
- `[UX]` - User experience could be better
- `[FEATURE]` - Missing functionality
- `[DOCS]` - Documentation needs improvement
- `[PERF]` - Performance issue

## Reviewing Issues

Periodically review `.claude/cli-issues.md` to:

1. Prioritize fixes
2. Group related issues
3. Create implementation tasks
4. Mark resolved issues as fixed

## Quick Add

For quick issue logging during a session:

```bash
# Append to issues file
echo "## $(date +%Y-%m-%d) - Brief description of issue\n\n**Status:** open\n\n---\n" >> .claude/cli-issues.md
```
