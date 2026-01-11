# Xano CLI Feedback Log

## Overview

This log tracks all findings, issues, and suggestions discovered while building the AI Chatbot application using the Xano CLI. The goal is to evaluate the developer experience and documentation accuracy.

**Project**: AI Chatbot Application
**Workspace**: 36 (CLI Built Application)
**Date Started**: 2026-01-11

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Bugs | 0 |
| Documentation Gaps | 3 |
| UX Issues | 0 |
| Gotchas | 2 |
| Suggestions | 1 |

---

## Bugs

Issues where commands don't work as expected or produce errors.

<!-- Template:
### BUG-001: [Title]
**Command**: `xano <command>`
**Expected**: What should happen
**Actual**: What actually happened
**Error Message**: (if applicable)
**Workaround**: (if found)
**Status**: Open/Resolved
-->

*No bugs recorded yet.*

---

## Documentation Gaps

Missing or unclear documentation that made tasks difficult.

### DOC-001: Enum field syntax not documented in table docs
**Topic**: table (CLI docs) / table_guideline.md (XanoScript docs)
**Issue**: The `xano docs table` documentation doesn't show the enum field syntax. The table_guideline.md mentions `enum` as a supported type but doesn't show the syntax. Had to look at table_examples.md to find that enums use `values = [...]` not `items = [...]`.
**Suggestion**: Add enum example to table documentation showing:
```xanoscript
enum status {
  values = ["active", "inactive", "pending"]
  description = "Status field"
}
```
**Status**: Open

### DOC-002: Password verification function not in CLI docs or easily discoverable
**Topic**: api / function documentation
**Issue**: When building a login endpoint, I tried `security.verify_password` which doesn't exist. The correct function is `security.check_password` with parameters `text_password` and `hash_password`. Had to grep through `functions.md` to find this.
**Suggestion**: Add authentication examples (signup/login patterns) to the API documentation, or create an `auth` docs topic showing common patterns.
**Status**: Open

### DOC-003: Agent response structure not documented
**Topic**: agent / ai.agent.run
**Issue**: The `ai.agent.run` documentation shows how to call an agent but doesn't document the response structure. After calling the agent, the result variable is an object, but the property to access the actual text response (`$agent_result.result`) is not documented. Tried `.text`, `.response`, `.content` before discovering `.result` through debugging.
**Suggestion**: Add documentation showing the agent response structure:
```json
{
  "result": "The AI's text response",
  "finishReason": "stop",
  "usage": { "inputTokens": 61, "outputTokens": 19, "totalTokens": 80 },
  "steps": [...],
  "providerMetadata": {...}
}
```
Example usage:
```xanoscript
ai.agent.run "My Agent" {
  args = {}|set:"message":$input.query
} as $agent_result

var $ai_response {
  value = $agent_result.result
}
```
**Status**: Open

---

## UX Issues

Confusing flags, poor error messages, or awkward workflows.

<!-- Template:
### UX-001: [Title]
**Command**: `xano <command>`
**Issue**: What was confusing
**Suggestion**: How to improve
**Priority**: Low/Medium/High
-->

*No UX issues recorded yet.*

---

## Gotchas

Non-obvious behaviors that developers should be aware of.

### GOTCHA-001: API endpoints require an input block even when empty
**Context**: Creating an API endpoint with no input parameters (e.g., GET /auth/me)
**Behavior**: XanoScript parser throws "Missing block: input" error even though the endpoint logically has no inputs
**Solution**: Always include an empty `input { }` block in your query definitions
**Should Document**: Yes - this isn't obvious from the documentation

### GOTCHA-002: No bulk delete - must iterate with foreach
**Context**: Trying to delete multiple records matching a where clause
**Behavior**: There's no `db.query { where = ... delete }` syntax. The `db.del` only deletes single records by field_name/field_value.
**Solution**: Query the records first, then use `foreach` to delete each one:
```xanoscript
db.query "messages" {
  where = $db.messages.conversation_id == $id
  return = {type: "list"}
} as $to_delete

foreach ($to_delete) {
  each as $item {
    db.del messages {
      field_name = "id"
      field_value = $item.id
    }
  }
}
```
**Should Document**: Yes - common pattern for cascade deletes

---

## Suggestions

Ideas for new features or improvements.

### SUGGEST-001: Allow table name as alternative to table ID in commands
**Context**: When running `table get users`, the command fails because it expects an ID (622), not a name. Since `table list` shows names prominently, it's natural to use them.
**Description**: Allow commands like `table get`, `table schema get`, etc. to accept either table ID or table name. The CLI could resolve the name to ID internally.
**Priority**: Medium

---

## Session Log

Chronological log of commands run and observations made.

### Session 1: 2026-01-11 - Phase 1: Database Tables

**Goal**: Create users, conversations, and messages tables

**Commands Run**:
```bash
# Check existing tables
xano table list
# Result: No tables found

# Create users table
xano table create -f ./chatbot-app/tables/users.xs
# Result: Success - ID: 622

# Create conversations table
xano table create -f ./chatbot-app/tables/conversations.xs
# Result: Success - ID: 623

# Create messages table (first attempt)
xano table create -f ./chatbot-app/tables/messages.xs
# Result: FAILED - enum syntax error (used "items" instead of "values")

# Create messages table (fixed)
xano table create -f ./chatbot-app/tables/messages.xs
# Result: Success - ID: 624

# Verify tables
xano table list
# Result: All 3 tables created

# Get table schema
xano table get 622 -o xs
# Result: Success - schema matches input
```

**Findings**:
- DOC-001: Enum syntax (`values = [...]`) not documented in table docs
- SUGGEST-001: Commands should accept table names, not just IDs

**Outcome**: Phase 1 complete - all tables created successfully

### Session 2: 2026-01-11 - Phase 2: API Endpoints

**Goal**: Create API group and 8 endpoints for auth and conversations

**Commands Run**:
```bash
# Create API group
xano apigroup create --name chatbot --description "AI Chatbot API endpoints" --swagger --canonical chatbot
# Result: Success - ID: 290

# Create auth endpoints
xano api create 290 -f ./chatbot-app/api/auth-signup.xs
# Result: Success - ID: 2210

xano api create 290 -f ./chatbot-app/api/auth-login.xs
# Result: FAILED - security.verify_password doesn't exist (should be security.check_password)
# After fix: Success - ID: 2211

xano api create 290 -f ./chatbot-app/api/auth-me.xs
# Result: FAILED - Missing block: input (even for endpoints with no inputs)
# After fix: Success - ID: 2212

# Create conversation endpoints
xano api create 290 -f ./chatbot-app/api/conversations-list.xs
# Result: Success - ID: 2213

xano api create 290 -f ./chatbot-app/api/conversations-create.xs
# Result: Success - ID: 2214

xano api create 290 -f ./chatbot-app/api/conversations-get.xs
# Result: Success - ID: 2215

xano api create 290 -f ./chatbot-app/api/conversations-delete.xs
# Result: FAILED - no bulk delete syntax
# After fix (using foreach): Success - ID: 2216

xano api create 290 -f ./chatbot-app/api/messages-send.xs
# Result: Success - ID: 2217

# Verify endpoints
xano api list 290
# Result: All 8 endpoints created
```

**Findings**:
- DOC-002: Password verification function not documented (security.check_password)
- GOTCHA-001: API endpoints require empty input block even with no params
- GOTCHA-002: No bulk delete - must use foreach iteration

**Outcome**: Phase 2 complete - API group + 8 endpoints created

### Session 3: 2026-01-11 - API Testing

**Goal**: Create reusable test script and validate all endpoints

**Test Results**: All 10 tests passed!
```
✓ Test 1: POST /auth/signup - User created successfully
✓ Test 2: POST /auth/login - Login and token refresh works
✓ Test 3: GET /auth/me - Returns authenticated user
✓ Test 4: POST /conversations - Creates conversation
✓ Test 5: GET /conversations - Lists user's conversations
✓ Test 6: POST /conversations/{id}/messages - Sends message, gets placeholder response
✓ Test 7: GET /conversations/{id} - Returns conversation with messages
✓ Test 8: DELETE /conversations/{id} - Deletes conversation and messages
✓ Test 9: Verify Deletion - Confirms 404 for deleted conversation
✓ Test 10: Unauthorized Access - Properly rejects unauthenticated requests
```

**Observations**:
- API responses are well-structured JSON
- Error messages are clear and include error codes
- Auth token generation works correctly
- Cascade delete (messages then conversation) works as implemented

**Test Script**: `chatbot-app/test-api.sh` - reusable for future testing

### Session 4: 2026-01-11 - Phase 3: AI Integration

**Goal**: Create AI agent with Gemini and integrate with messages endpoint

**Commands Run**:
```bash
# Create AI agent
xano agent create -f ./chatbot-app/agents/chatbot-assistant.xs
# Result: Success - ID: 114

# Update messages endpoint with agent integration
xano api edit 290 2217 -f ./chatbot-app/api/messages-send.xs --publish
# Result: Success (after fixing agent response property)

# Run full test suite
./chatbot-app/test-api.sh
# Result: All 10 tests passed including AI response
```

**Findings**:
- DOC-003: Agent response structure not documented (`$agent_result.result`)
- Agent creation via CLI works smoothly
- Gemini integration works with `google-genai` provider type

**Debug Process**:
1. First tried `$agent_result.text` - failed (var not found)
2. Tried `$agent_result.response` - failed (var not found)
3. Returned raw `$agent_result` to see structure
4. Discovered correct property is `$agent_result.result`

**Agent Configuration**:
```xanoscript
agent "Chatbot Assistant" {
  canonical = "chatbot-assistant"
  llm = {
    type: "google-genai"
    api_key: "{{ $env.gemini_key }}"
    model: "gemini-2.0-flash"
    temperature: 0.7
    max_steps: 3
    prompt: "{{ $args.message }}"
    system_prompt: "You are a helpful AI assistant..."
  }
}
```

**Test Results**: All 10 tests passed with real AI responses!
```
✓ Send Message - AI response: "Hello! I received your test message. Is there anyt..."
```

**Outcome**: Phase 3 complete - AI chatbot fully functional with Gemini

---

## Resolution Tracking

| ID | Category | Title | Status | Resolution |
|----|----------|-------|--------|------------|
| - | - | - | - | - |

---

*Last Updated: 2026-01-11*
