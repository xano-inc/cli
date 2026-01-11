---
name: util-template-engine
description: XanoScript util.template_engine function - renders TWIG templates with dynamic content. Use for HTML pages, emails, AI prompts, and formatted text.
---

# util.template_engine

Renders a template using the TWIG templating engine, allowing for dynamic content generation.

## Syntax

```xs
util.template_engine {
  value = """
    Hello, {{ $input.name }}!
    {% for item in $var.items %}
    - {{ item }}
    {% endfor %}
  """
} as $rendered
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | text | Yes | The TWIG template string |

## Return Value

Returns the rendered template string with all variables and logic evaluated.

## Available Variables in Templates

Variables from XanoScript context are automatically available:
- `$input.*` - Input parameters
- `$var.*` - Stack variables
- `$env.*` - Environment variables

## Examples

### Basic Template

```xs
query "template-engine" verb=POST {
  input {
    text name { description = "Name to insert" }
    json colors { description = "Array of colors" }
  }

  stack {
    util.template_engine {
      value = """
Hello, {{ $input.name|capitalize }}!

Your favorite colors are:
{% for color in $input.colors %}
- {{ color|upper }}
{% endfor %}

Total: {{ $input.colors|length }} colors
"""
    } as $rendered
  }

  response = {
    rendered: $rendered
  }
}
// Input: name="john", colors=["red","green","blue"]
// Output: "Hello, John!\n\nYour favorite colors are:\n- RED\n- GREEN\n- BLUE\n\nTotal: 3 colors"
```

### HTML Email Template

```xs
query "email-template" verb=POST {
  input {
    text user_name { description = "User's name" }
    text order_id { description = "Order ID" }
    decimal total { description = "Order total" }
  }

  stack {
    util.template_engine {
      value = """
<html>
<body>
  <h1>Thank you, {{ $input.user_name }}!</h1>
  <p>Your order <strong>#{{ $input.order_id }}</strong> has been confirmed.</p>
  <p>Total: ${{ $input.total|number_format(2) }}</p>
</body>
</html>
"""
    } as $html
  }

  response = {
    html: $html
  }
}
```

### Conditional Content

```xs
query "conditional-template" verb=POST {
  input {
    text status { description = "Order status" }
    bool is_premium { description = "Premium customer" }
  }

  stack {
    util.template_engine {
      value = """
{% if $input.is_premium %}
Dear Valued Customer,
{% else %}
Hello,
{% endif %}

Your order status: {{ $input.status|upper }}

{% if $input.status == 'shipped' %}
Track your package at our website.
{% elseif $input.status == 'pending' %}
We're processing your order.
{% else %}
Contact support for more information.
{% endif %}
"""
    } as $message
  }

  response = {
    message: $message
  }
}
```

### SQL Query Template

```xs
query "dynamic-query" verb=POST {
  input {
    text table_name { description = "Table to query" }
    json fields { description = "Fields to select" }
    text where_clause? { description = "Optional WHERE clause" }
  }

  stack {
    util.template_engine {
      value = """
SELECT {{ $input.fields|join(', ') }}
FROM {{ $input.table_name }}
{% if $input.where_clause %}
WHERE {{ $input.where_clause }}
{% endif %}
"""
    } as $sql
  }

  response = {
    sql: $sql
  }
}
```

### AI Prompt Template

```xs
query "ai-prompt" verb=POST {
  input {
    text topic { description = "Topic to discuss" }
    json context_items { description = "Context items" }
    text tone?="professional" { description = "Response tone" }
  }

  stack {
    util.template_engine {
      value = """
You are a helpful assistant. Please respond in a {{ $input.tone }} tone.

Topic: {{ $input.topic }}

Context:
{% for item in $input.context_items %}
- {{ item }}
{% endfor %}

Please provide a comprehensive response.
"""
    } as $prompt
  }

  response = {
    prompt: $prompt
  }
}
```

## Common TWIG Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `capitalize` | First letter uppercase | `{{ name\|capitalize }}` |
| `upper` | All uppercase | `{{ text\|upper }}` |
| `lower` | All lowercase | `{{ text\|lower }}` |
| `title` | Title Case | `{{ text\|title }}` |
| `trim` | Remove whitespace | `{{ text\|trim }}` |
| `length` | Array/string length | `{{ items\|length }}` |
| `join` | Join array elements | `{{ items\|join(', ') }}` |
| `first` | First element | `{{ items\|first }}` |
| `last` | Last element | `{{ items\|last }}` |
| `default` | Default value | `{{ value\|default('N/A') }}` |
| `number_format` | Format number | `{{ price\|number_format(2) }}` |
| `date` | Format date | `{{ date\|date('Y-m-d') }}` |
| `json_encode` | To JSON string | `{{ obj\|json_encode }}` |
| `escape` | HTML escape | `{{ html\|escape }}` |

## Control Structures

### For Loop
```twig
{% for item in items %}
  {{ loop.index }}: {{ item }}
{% endfor %}
```

### If/Else
```twig
{% if condition %}
  ...
{% elseif other_condition %}
  ...
{% else %}
  ...
{% endif %}
```

### Set Variable
```twig
{% set greeting = 'Hello' %}
{{ greeting }}
```

## Important Notes

1. **Use triple quotes** - Multi-line templates need `"""` delimiters
2. **Automatic context** - `$input`, `$var`, `$env` are available
3. **HTML safe** - Use `|escape` filter for user input in HTML
4. **TWIG syntax** - Full TWIG templating support

## Test API Group

**API Group:** xs-util (ID: 269)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:3KzrYiuB`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| template-engine | 2127 | Render TWIG template | Working |

## Related Functions

- `util.send_email` - Send templated emails
- `util.set_header` - Set content-type for HTML responses
