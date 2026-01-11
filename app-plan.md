# AI Chatbot Application - Build Plan

## Overview

Build a simple AI chatbot application using the Xano CLI to test the developer experience and validate documentation accuracy. The application will use Gemini as the LLM provider.

## Application Features

- **User Management**: Register, authenticate, and manage users
- **Conversations**: Create and manage chat conversations
- **Messages**: Store and retrieve conversation messages
- **AI Integration**: Connect to Gemini for intelligent responses

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Users     │────▶│Conversations│────▶│  Messages   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  AI Agent   │
                    │  (Gemini)   │
                    └─────────────┘
```

## Environment

- **Workspace**: 36 (CLI Built Application)
- **LLM Provider**: Google Gemini via `$env.gemini_key`
- **CLI Profile**: mcp-server

---

## Phase 1: Database Schema

### Goal
Create the database tables to store users, conversations, and messages.

### Tables

#### 1.1 users
| Column | Type | Description |
|--------|------|-------------|
| id | int (auto) | Primary key |
| email | text | User email (unique) |
| name | text | Display name |
| password | password | Hashed password |
| created_at | timestamp | Account creation time |

#### 1.2 conversations
| Column | Type | Description |
|--------|------|-------------|
| id | int (auto) | Primary key |
| user_id | int (tableref:users) | Owner of conversation |
| title | text | Conversation title |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last activity |

#### 1.3 messages
| Column | Type | Description |
|--------|------|-------------|
| id | int (auto) | Primary key |
| conversation_id | int (tableref:conversations) | Parent conversation |
| role | enum (user/assistant) | Message sender |
| content | text | Message content |
| created_at | timestamp | Message time |

### CLI Commands to Execute
```bash
# Create users table
xano table create -f tables/users.xs

# Create conversations table
xano table create -f tables/conversations.xs

# Create messages table
xano table create -f tables/messages.xs

# Verify tables
xano table list
```

### Success Criteria
- [ ] All three tables created successfully
- [ ] Table relationships properly configured
- [ ] Can verify via `xano table list`

---

## Phase 2: API Endpoints

### Goal
Create RESTful API endpoints for user authentication and conversation management.

### API Group: chatbot

#### 2.1 Authentication APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| /auth/signup | POST | Register new user |
| /auth/login | POST | Authenticate user |
| /auth/me | GET | Get current user |

#### 2.2 Conversation APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| /conversations | GET | List user's conversations |
| /conversations | POST | Create new conversation |
| /conversations/{id} | GET | Get conversation with messages |
| /conversations/{id} | DELETE | Delete conversation |

#### 2.3 Message APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| /conversations/{id}/messages | POST | Send message & get AI response |

### CLI Commands to Execute
```bash
# Create API group
xano apigroup create -f api/chatbot-group.xs

# Create auth endpoints
xano api create -f api/auth-signup.xs
xano api create -f api/auth-login.xs
xano api create -f api/auth-me.xs

# Create conversation endpoints
xano api create -f api/conversations-list.xs
xano api create -f api/conversations-create.xs
xano api create -f api/conversations-get.xs
xano api create -f api/conversations-delete.xs

# Create message endpoint
xano api create -f api/messages-send.xs

# Verify APIs
xano api list -g <group_id>
```

### Success Criteria
- [ ] API group created
- [ ] All endpoints created and accessible
- [ ] Authentication flow works

---

## Phase 3: AI Integration

### Goal
Create an AI agent using Gemini to generate chatbot responses.

### Agent: Chatbot Assistant

#### Configuration
- **Provider**: google-genai
- **Model**: gemini-2.0-flash
- **API Key**: `{{ $env.gemini_key }}`
- **Max Steps**: 3
- **Temperature**: 0.7

#### System Prompt
```
You are a helpful AI assistant. Respond clearly and concisely to user questions.
Be friendly and conversational while remaining informative.
```

### CLI Commands to Execute
```bash
# Create the AI agent
xano agent create -f agents/chatbot-assistant.xs

# Verify agent
xano agent list
xano agent get <agent_id>
```

### Success Criteria
- [ ] Agent created successfully
- [ ] Agent can be called from API endpoints
- [ ] Responses are generated correctly

---

## Phase 4: Integration & Testing

### Goal
Wire everything together and test the complete flow.

### Test Scenarios

#### 4.1 User Flow
1. Sign up new user
2. Login and get auth token
3. Verify token with /auth/me

#### 4.2 Conversation Flow
1. Create new conversation
2. Send message
3. Receive AI response
4. List conversations
5. Get conversation with messages
6. Delete conversation

### CLI Commands for Testing
```bash
# Check workspace context
xano workspace context

# View API history
xano history request list

# Check for errors
xano history request search --status 500
```

### Success Criteria
- [ ] Full user registration and login works
- [ ] Conversations can be created and managed
- [ ] AI responses are generated and stored
- [ ] All CRUD operations function correctly

---

## Phase 5: Enhancements (Optional)

### Potential Additions
- [ ] Conversation title auto-generation from first message
- [ ] Message streaming support
- [ ] Rate limiting middleware
- [ ] Conversation sharing between users

---

## Build Approach

**Local Files + CLI** - XanoScript files are stored locally in `chatbot-app/` and pushed to Xano workspace 36 via CLI commands. This provides version control and reproducibility.

## File Structure

```
chatbot-app/
├── tables/
│   ├── users.xs
│   ├── conversations.xs
│   └── messages.xs
├── api/
│   ├── chatbot-group.xs
│   ├── auth-signup.xs
│   ├── auth-login.xs
│   ├── auth-me.xs
│   ├── conversations-list.xs
│   ├── conversations-create.xs
│   ├── conversations-get.xs
│   ├── conversations-delete.xs
│   └── messages-send.xs
├── agents/
│   └── chatbot-assistant.xs
└── functions/
    └── (helper functions if needed)
```

---

## CLI Feedback Log

Track all CLI findings, issues, and suggestions during the build process.

**Log Location**: `cli-feedback-log.md`

### Categories to Track
1. **Bugs**: Commands that don't work as expected
2. **Documentation Gaps**: Missing or unclear documentation
3. **UX Issues**: Confusing flags, poor error messages
4. **Suggestions**: Ideas for improvement
5. **Gotchas**: Non-obvious behaviors developers should know

---

## Timeline

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Database Schema | ✅ Complete |
| Phase 2 | API Endpoints | ✅ Complete |
| Phase 3 | AI Integration | ✅ Complete |
| Phase 4 | Integration & Testing | ✅ Complete |
| Phase 5 | Enhancements | ⏳ Optional |

## Created Resources

| Resource | ID | Name |
|----------|-----|------|
| Table | 622 | users |
| Table | 623 | conversations |
| Table | 624 | messages |
| API Group | 290 | chatbot |
| API | 2210 | POST /auth/signup |
| API | 2211 | POST /auth/login |
| API | 2212 | GET /auth/me |
| API | 2213 | GET /conversations |
| API | 2214 | POST /conversations |
| API | 2215 | GET /conversations/{id} |
| API | 2216 | DELETE /conversations/{id} |
| API | 2217 | POST /conversations/{id}/messages |
| Agent | 114 | Chatbot Assistant |

---

*Plan created: 2026-01-11*
