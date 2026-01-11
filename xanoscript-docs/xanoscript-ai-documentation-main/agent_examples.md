---
applyTo: "agents/**/*.xs"
---

# Xanoscript Agent Examples

Below are some examples of agent configurations that can be made using Xanoscript. The `xano-free` model is a free, rate-limited model ideal for testing and development. Other examples showcase configurations for popular LLMs like Google Gemini, OpenAI, and Anthropic Claude and will require appropriate API keys.

## Xano Test Agent

A free, rate-limited model for testing and development, powered by our included `xano-free` model which runs on Google Gemini. Ideal for new users.

```xs
agent "Xano Test Agent" {
  canonical = "x-test-123"
  llm = {
    type         : "xano-free"
    system_prompt: "You are a test AI Agent. Respond clearly and concisely."
    prompt       : "{{ $args.message }}"
    max_steps    : 3
    temperature     : 0
    search_grounding: false
  }
  tools = []
}
```

## Google Gemini Agent

An agent using Google Gemini 1.5 Flash

```xs
agent "Google Gemini Agent" {
  description = "An agent using Google Gemini 1.5 Flash."
  canonical = "ggl-gem-456"
  llm = {
    type         : "google-genai"
    system_prompt: "You are a helpful AI Agent that uses its tools to find accurate information. Explain your reasoning."
    max_steps    : 5
    prompt       : "Fulfill this request for user {{ $args.user_id }}: {{ $args.user_message }}"
    api_key         : "{{ $env.gemini_key }}"
    model           : "gemini-1.5-flash"
    temperature     : 0.2
    search_grounding: false
    thinking_tokens : 8000
    include_thoughts: true
  }
  tools = [
    "tool-get-user-info-abc",
    "tool-search-docs-def"
  ]
}
```

## OpenAI Agent

A simple agent config for OpenAI models.

```xs
agent "OpenAI Agent" {
  description = "A simple agent config for OpenAI models."
  canonical = "oai-gpt-789"
  llm = {
    type         : "openai"
    system_prompt: "You are a helpful AI Agent that completes tasks accurately. Use your tools when necessary."
    max_steps    : 3
    prompt       : "Handle this request: {{ $args.user_message }}"

    api_key         : "{{ $env.openai_key }}"
    model           : "gpt-4o"
    temperature     : 0.8
    reasoning_effort: "low"
    baseURL         : ""
  }
  tools = []
}
```

## Anthropic Claude Agent

An agent powered by Claude 3.5 Sonnet.

```xs
agent "Anthropic Claude Agent" {
  description = "An agent powered by Claude 3.5 Sonnet."
  canonical = "ant-son-101"
  llm = {
    type         : "anthropic"
    system_prompt: "You are a thoughtful and careful AI assistant. You must use tools to verify facts before answering. Break down complex problems step-by-step."
    max_steps    : 8
    prompt       : """
      Please assist with the following task:
      {{ $args.task_description }}
      """
    api_key        : "{{ $env.anthropic_key }}"
    model          : "claude-3-5-sonnet-20240620"
    temperature    : 0.3
    send_reasoning : true
  }
  tools = ["tool-verify-facts-ghi"]
}
```

## Customer Support Agent with Tools

This agent is configured to use a set of tools to help with customer support tasks.

```xs
agent "Customer Support Agent" {
  canonical = "support-agent-v2"
  llm = {
    type         : "openai"
    system_prompt: "You are a customer support agent. Use your tools to find customer information and resolve their issues."
    max_steps    : 5
    prompt       : "The customer with email {{ $args.email }} has the following issue: {{ $args.issue }}"
    api_key         : "{{ $env.openai_key }}"
    model           : "gpt-4o"
    temperature     : 0.5
  }

  tools = [
    { name: "get_user_details_by_email" },
    { name: "cancel_subscription" },
    { name: "create_support_ticket" }
  ]
}
```
