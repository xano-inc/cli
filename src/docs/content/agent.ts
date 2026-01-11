import type {DocTopic} from '../index.js'

export const agentDocs: DocTopic = {
  name: 'agent',
  title: 'Agent Documentation',
  description: 'AI-powered autonomous agents that use LLMs to perform complex tasks',
  relatedTopics: ['tool', 'mcp-server', 'function'],
  content: `
# Agent Documentation

## Overview

Agents in Xano are autonomous AI entities that leverage Large Language Models (LLMs)
from providers like OpenAI, Google, and Anthropic to perform complex tasks, interact
with data, and execute tools.

Use cases include:
- Customer support automation
- Data analysis and reporting
- Task management and workflow automation
- Content generation and processing

## Key Concepts

### Supported LLM Providers
- **xano-free**: Free, rate-limited model for testing (powered by Gemini)
- **google-genai**: Google Gemini models
- **openai**: OpenAI GPT models (also compatible with Groq, Mistral, OpenRouter)
- **anthropic**: Anthropic Claude models

### Dynamic Variables
- \`{{ $args.variable_name }}\`: Runtime arguments passed to the agent
- \`{{ $env.variable_name }}\`: Environment variables (for API keys)

## CLI Commands

### List Agents
\`\`\`bash
# List all agents
xano agent list -w <workspace_id>

# JSON output
xano agent list -w <workspace_id> -o json
\`\`\`

### Get Agent Details
\`\`\`bash
# Get agent info
xano agent get <agent_id> -w <workspace_id>

# Get as XanoScript
xano agent get <agent_id> -w <workspace_id> -o xs
\`\`\`

### Create Agent
\`\`\`bash
# Create from XanoScript file
xano agent create -w <workspace_id> -f agent.xs

# Create with JSON output
xano agent create -w <workspace_id> -f agent.xs -o json
\`\`\`

### Edit Agent
\`\`\`bash
xano agent edit <agent_id> -w <workspace_id> -f updated.xs
\`\`\`

### Delete Agent
\`\`\`bash
# With confirmation
xano agent delete <agent_id> -w <workspace_id>

# Force delete
xano agent delete <agent_id> -w <workspace_id> --force
\`\`\`

### Agent Triggers
\`\`\`bash
# List agent triggers
xano agent trigger list <agent_id> -w <workspace_id>

# Create agent trigger
xano agent trigger create <agent_id> -w <workspace_id> -f trigger.xs

# Delete agent trigger
xano agent trigger delete <agent_id> <trigger_id> -w <workspace_id> --force
\`\`\`

## XanoScript Syntax

### Basic Agent with Xano Free Model
\`\`\`xanoscript
agent "My Assistant" {
  canonical = "my-assistant-v1"
  description = "A helpful AI assistant"
  llm = {
    type: "xano-free"
    system_prompt: "You are a helpful AI assistant."
    prompt: "{{ $args.message }}"
    max_steps: 3
    temperature: 0
    search_grounding: false
  }
  tools = []
}
\`\`\`

### Agent with OpenAI
\`\`\`xanoscript
agent "Customer Support Agent" {
  canonical = "support-agent-v1"
  description = "Handles customer inquiries"
  llm = {
    type: "openai"
    system_prompt: "You are a customer support agent. Be helpful and professional."
    prompt: "Handle this request: {{ $args.user_message }}"
    api_key: "{{ $env.openai_key }}"
    model: "gpt-4o"
    max_steps: 5
    temperature: 0.7
    reasoning_effort: "medium"
  }
  tools = [
    { name: "get_user_details" },
    { name: "create_support_ticket" }
  ]
}
\`\`\`

### Agent with Anthropic Claude
\`\`\`xanoscript
agent "Analysis Agent" {
  canonical = "analysis-agent-v1"
  description = "Analyzes data and provides insights"
  llm = {
    type: "anthropic"
    system_prompt: "You are a data analyst. Provide clear, actionable insights."
    prompt: "Analyze: {{ $args.data }}"
    api_key: "{{ $env.anthropic_key }}"
    model: "claude-sonnet-4-5-20250929"
    max_steps: 8
    temperature: 0.3
    send_reasoning: true
  }
  tools = [
    { name: "query_database" }
  ]
}
\`\`\`

### Agent with Google Gemini
\`\`\`xanoscript
agent "Research Agent" {
  canonical = "research-agent-v1"
  description = "Researches topics using web search"
  llm = {
    type: "google-genai"
    system_prompt: "You are a research assistant. Verify facts before answering."
    prompt: "Research: {{ $args.topic }}"
    api_key: "{{ $env.gemini_key }}"
    model: "gemini-2.5-flash"
    max_steps: 5
    temperature: 0.2
    search_grounding: true
    thinking_tokens: 10000
    include_thoughts: true
  }
  tools = []
}
\`\`\`

## Calling Agents from Function Stacks

Use the \`ai.agent.run\` statement to call an agent:

\`\`\`xanoscript
ai.agent.run "Customer Support Agent" {
  args = {}|set:"prompt":$input.user_query
  allow_tool_execution = true
} as $agent_result
\`\`\`

## Best Practices

1. **Use environment variables for API keys**: Never hardcode keys
2. **Write clear system prompts**: Define persona, goals, and constraints
3. **Set appropriate max_steps**: Prevent infinite loops
4. **Don't describe tools in prompts**: Tools are automatically provided
5. **Use structured outputs when needed**: For consistent response formats

## Related Documentation

- \`xano docs tool\` - AI tools that agents can execute
- \`xano docs mcp-server\` - Expose tools via MCP protocol
- \`xano docs function\` - Reusable logic for agent stacks
`.trim(),
}
