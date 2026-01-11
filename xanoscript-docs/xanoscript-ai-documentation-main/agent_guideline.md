---
applyTo: "agents/**/*.xs"
---

# Xanoscript Syntax Guide for Xano Agents

Xano Agents are autonomous entities that leverage Large Language Models (LLMs) from providers like OpenAI, Google, and Anthropic to perform complex tasks, interact with data, and execute tools.

Agents can be called in function stacks like [api endpoint](./api_query_guideline.md), [functions](./function_guideline.md) etc ... via the Call agent statement `ai.agent.run`.

For example, to pass a user query to an agent named "Task Management Agent" and allow it to execute tools, you would use:

```xs
ai.agent.run "Task Management Agent" {
  args = {}|set:"prompt":$input.user_query
  allow_tool_execution = true
} as $task_agent
```

## Core Concepts

- **Agent**: The top-level definition, containing the agent's identity, LLM configuration, and associated tools.
- **LLM Configuration**: Defines the AI provider, model, core instructions (system prompt), and provider-specific settings (e.g., temperature, reasoning).
- **Prompt**: The user-facing input template, which can be dynamically populated at runtime.
- **Tools**: A set of pre-defined Xano functions the agent can execute to gather information or perform actions.
- **Dynamic Variables**: Placeholders that insert runtime data into prompts and settings.
  - `{{ $args.variable_name }}`: For runtime arguments passed into the agent.
  - `{{ $env.variable_name }}`: For accessing Xano Environment Variables, primarily used for API keys.

## Core Agent Syntax

Every agent is defined within an `agent` block.

```xs
agent "Agent Display Name" {
  canonical = "unique-agent-id"
  description = "A brief explanation of what this agent does."
  llm = {
    type: "xano-free"
    system_prompt: "You are a test AI Agent. Respond clearly and concisely."
    prompt: "{{ $args.message }}"
    max_steps    : 3
    temperature     : 0
    search_grounding: false
  }
  tools = [
    { name: "tool-name-1" },
    { name: "tool-name-2" }
  ]
}
```

### Key Fields

- **`agent "Name"`**: The top-level declaration. The name is a human-readable string.
- **`canonical`**: A unique, non-changeable string identifier for the agent. This is required.
- **`description`**: An optional string for internal documentation.
- **`llm`**: An object containing all configuration for the Language Model. This block is required.
- **`tools`**: A list of objects, where each object references a pre-configured tool by its name. See Section 5 for details.

---

## LLM Configuration (`llm` block)

The `llm` block defines the behavior of the AI model. It consists of common properties and a provider-specific configuration object.

### Common LLM Properties

These properties are required for all agent configurations, regardless of the AI provider.

```xs
llm = {
  type: "<provider_type>"
  system_prompt: "You are a helpful AI assistant..."
  max_steps: 5
  prompt: """
    User message: {{ $args.user_message }}
    User ID: {{ $args.user_id }}
    """
}
```

- **`type`** (string): Specifies the LLM provider.
  - Valid values: `xano-free`, `google-genai`, `openai`, `anthropic`.
- **`system_prompt`** (string): The foundational instructions for the agent. It defines its persona, goals, constraints, and how it should use tools.
- **`max_steps`** (integer): The maximum number of sequential LLM calls the agent can perform in a single run. This prevents infinite loops.

**Prompt or messages** (one of the following is required):

- `prompt` (string): A string containing the prompt. Use `"""` for multi-line strings.
- `messages` (string): An array of objects but JSON stringified; Instead of a single prompt string, you can define a series of messages to create a conversational context. Each message object must have a `role` (`system`, `user`, or `assistant`) and `content` (the message text). This is particularly useful for models that support chat-based interactions.

### Structured Outputs

Agents can be configured to return responses in a specific JSON format. This is defined within the `llm` block.

**Important Note:** When structured outputs are enabled, tool usage is disabled by the underlying model provider. So tools should not be added to an Agent with structured outputs enabled. Output follows similar rules as our [input](./input_guideline.md) are defined:

```xs
llm = {
  structured_outputs: true

  output {
    text description? filters=trim
    bool is_correct?
  }
}
```

## Provider-Specific Configurations

### Xano Test Model (`xano-free`)

A free, rate-limited model for testing and development, powered by Gemini. Ideal for new users.

- **Block name:** `xano_free`

| Parameter          | Type    | Description                                                 | Example |
| ------------------ | ------- | ----------------------------------------------------------- | ------- |
| `temperature`      | number  | Controls randomness. `0` is deterministic. `1` is creative. | `0.5`   |
| `search_grounding` | boolean | If `true`, enables Google Search grounding. Disables tools. | `false` |

```xs
agent "Xano Test Agent" {
  canonical = "x-test-123"
  llm = {
    type: "xano-free"
    system_prompt: "You are a test AI Agent. Respond clearly and concisely."
    max_steps: 3
    prompt: "{{ $args.message }}"
    temperature: 0
    search_grounding: false
  }
  tools = []
}
```

### Google Gemini (`google-genai`)

Configuration for Google's Gemini family of models.

- **Block name:** `google_genai`

| Parameter          | Type    | Description                                                                                                                 | Example                   |
| ------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `api_key`          | string  | Your Google Gemini API key. **Always use an environment variable.**                                                         | `"{{ $env.gemini_key }}"` |
| `model`            | string  | The specific Gemini model to use.                                                                                           | `"gemini-2.5-flash"`      |
| `temperature`      | number  | Controls randomness. `0.0` to `1.0`.                                                                                        | `0.7`                     |
| `search_grounding` | boolean | If `true`, grounds the model's response in Google Search results. **Disables tools.**                                       | `true`                    |
| `thinking_tokens`  | integer | The number of tokens the model can use for internal thinking before responding. Range `0` to `24576`. Use `-1` for dynamic. | `10000`                   |
| `include_thoughts` | boolean | If `true`, the model's internal reasoning or "thoughts" will be included in the response.                                   | `true`                    |
| `safety_settings`  | string  | JSON string for configuring safety thresholds. (See Google API docs).                                                       | `""`                      |
| `dynamic_retrival` | string  | Configuration for dynamic retrieval features. (See Google API docs).                                                        | `""`                      |

```xs
agent "Google Gemini Agent" {
  description = "An agent using Google Gemini 2.5 Flash."
  canonical = "ggl-gem-456"
  llm = {
    type: "google-genai"
    system_prompt: "You are a helpful AI Agent that uses its tools to find accurate information. Explain your reasoning."
    max_steps: 5
    prompt: "Fulfill this request for user {{ $args.user_id }}: {{ $args.user_message }}"
    api_key: "{{ $env.gemini_key }}"
    model: "gemini-2.5-flash"
    temperature: 0.2
    search_grounding: false
    thinking_tokens: 10000
    include_thoughts: true
  }
  tools = ["tool-get-user-info-abc", "tool-search-docs-def"]
}
```

### OpenAI (`openai`)

Configuration for OpenAI's GPT models. This can also be used for other OpenAI-compatible APIs by changing the `baseURL`.

- **Block name:** `openai`

> **Using OpenAI-Compatible Endpoints**
> The `baseURL` parameter can be overridden to use other providers like Groq, Mistral, OpenRouter, or X.AI.
>
> - **Groq:** `https://api.groq.com/openai/v1`
> - **Mistral:** `https://api.mistral.ai/v1`
> - **OpenRouter:** `https://openrouter.ai/api/v1`

| Parameter          | Type   | Description                                                                                        | Example                            |
| ------------------ | ------ | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `api_key`          | string | Your OpenAI API key. **Always use an environment variable.**                                       | `"{{ $env.openai_key }}"`          |
| `model`            | string | The specific OpenAI model to use.                                                                  | `"gpt-5-mini"`                     |
| `temperature`      | number | Controls randomness. `0.0` to `2.0`.                                                               | `1.0`                              |
| `reasoning_effort` | string | For reasoning models, sets how much effort is spent on thinking.                                   | `"low"`, `"medium"`, `"high"`      |
| `baseURL`          | string | Custom URL for API calls. Defaults to OpenAI. Leave blank for default.                             | `"https://api.groq.com/openai/v1"` |
| `organization`     | string | OpenAI organization ID.                                                                            | `""`                               |
| `project`          | string | OpenAI project ID.                                                                                 | `""`                               |
| `compatibility`    | string | Sets the API compatibility mode. `strict` or `compatible` use compaatible to allow other providers | `"strict"`                         |

```xs
agent "OpenAI Agent" {
  description = "A simple agent config for OpenAI models."
  canonical = "oai-gpt-789"
  llm = {
    type: "openai"
    system_prompt: "You are a helpful AI Agent that completes tasks accurately. Use your tools when necessary."
    max_steps: 3
    prompt: "Handle this request: {{ $args.user_message }}"
    api_key: "{{ $env.openai_key }}"
    model: "gpt-5-mini"
    temperature: 0.8
    reasoning_effort: "low"
    baseURL: ""
  }
  tools = []
}
```

### Anthropic (`anthropic`)

Configuration for Anthropic's Claude family of models.

- **Block name:** `anthropic`

| Parameter        | Type    | Description                                                                                          | Example                                                 |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `api_key`        | string  | Your Anthropic API key. **Always use an environment variable.**                                      | `"{{ $env.anthropic_key }}"`                            |
| `model`          | string  | The specific Claude model to use.                                                                    | `"claude-sonnet-4-5-20250929"`                          |
| `temperature`    | number  | Controls randomness. `0.0` to `1.0`.                                                                 | `0.5`                                                   |
| `send_reasoning` | boolean | If `true`, Claude creates `thinking` content blocks showing its reasoning before the final response. | `true`                                                  |
| `thinking`       | string  | JSON string to enable extended thinking and set a token budget. See Anthropic docs.                  | `"{ \"type\": \"enabled\", \"budget_tokens\": 10000 }"` |

```xs
agent "Anthropic Claude Agent" {
  description = "An agent powered by Claude 4.5 Sonnet."
  canonical = "ant-son-101"
  llm = {
    type         : "anthropic"
    system_prompt: "You are a thoughtful and careful AI assistant. You must use tools to verify facts before answering. Break down complex problems step-by-step."
    max_steps    : 8
    prompt       : """Please assist with the following task:
      {{ $args.task_description }}
      """
    api_key        : "{{ $env.anthropic_key }}"
    model          : "claude-sonnet-4-5-20250929"
    temperature    : 0.3
    send_reasoning : true
  }
  tools = ["tool-verify-facts-ghi"]
}
```

---

## Configuring Tools (`tools` block)

Tools are Xano functions that an agent can execute to interact with your database, call external APIs, or perform any defined action.

### Syntax

The `tools` property is a list of objects, where each object specifies a tool by its unique name.

```xs
agent "Customer Support Agent" {
  canonical = "support-agent-v2"
  llm = {

  }

  tools = [
    { name: "get_user_details_by_email" },
    { name: "cancel_subscription" },
    { name: "create_support_ticket" }
  ]
}
```

- **`{ name: "tool-name" }`**: Each tool is an object with a single `name` key. The value must be a string that exactly matches the name of a tool created in your Xano workspace.

### Runtime Behavior and Best Practices

!IMPORTANT: DO NOT DESCRIBE THE TOOLS IN THE `system_prompt` OR `prompt`. The agent automatically receives the tool descriptions and input schemas at runtime.

## Prompting and Dynamic Variables

Prompts are the primary way to provide runtime instructions to an agent. Xanoscript uses the **Twig** templating engine, allowing you to create dynamic, context-aware prompts allowing for variable substitution using `{{ $var.variable_name }}` syntax.

#### Runtime Arguments (`$args`)

`$args` are variables passed into the agent when it is called from a Xano function stack. This is the primary method for providing task-specific data.

- **Syntax**: `{{ $args.variable_name }}`
- **Use Case**: Passing user input, session IDs, or any other data unique to a specific agent run.

**Example:**

```xs
llm = {
  type: "openai"
  prompt: """
    {% if $args.user_input|length > 0 %}
      Generate a {{ $args.tone|capitalize }} response to the following request: "{{ $args.user_input|trim|escape }}".
      Ensure the response is concise, under {{ $args.max_length }} words, and includes relevant examples.
      {% if $args.tone == "professional" %}
        Use formal language and industry-specific terminology.
      {% elseif $args.tone == "casual" %}
        Use conversational language and relatable analogies.
      {% else %}
        Adapt tone to context, maintaining clarity.
      {% endif %}
      Format the output as a JSON object with "prompt" and "timestamp" fields, where timestamp is "{{ "now"|date("Y-m-d H:i:s") }}".
    {% else %}
      Error: No input provided, ask the user to provide input.
    {% endif %}
    """
  api_key: "{{ $env.openai_key }}"
  model: "gpt-5-mini"
  temperature: 0.7
  reasoning_effort: "medium"
  max_steps: 4
}
```

Note the use of `{{ $env.openai_key }}` in the api_key field, `$env` variables are useful to securely pass API keys and other secrets to the agent but should be avoided in prompts and system prompts to prevent accidental exposure.

### Prompting Best Practices

1.  **Be Clear and Specific**: Write prompts that clearly define the agent's goal for the specific task. The `system_prompt` sets the overall persona and role, while the `prompt` gives the immediate task.
2.  **Provide Rich Context**: Use `$args` to give the agent all the context it needs. The more relevant information it has (like user history, account status, etc.), the better its decisions will be.
3.  **Use Multi-line Strings for Readability**: Use triple quotes (`"""`) to structure larger prompts cleanly, separating instructions from dynamic data.
4.  **Keep Logic Minimal**: Although Twig supports logic (e.g., `{% if %}`, `{% for %}`), it should be used sparingly within prompts. The agent's core strength is its own reasoning ability. Overly complex templating can be brittle and hard to debug. Leave the decision-making to the LLM.
    - **Acceptable Use of Logic:** Conditionally providing a piece of information.
      ```twig
      {% if $args.is_priority_customer %}
      This is a priority customer. Respond within 5 minutes.
      {% endif %}
      ```
5.  **Do Not Repeat Tool Instructions**: As stated above, there is no need to repeat the tool instructions in the prompt. The system handles this automatically. Focus the prompt on the _what_, _why_ and _when_, and let the agent figure out the _how_ by using its tools.
