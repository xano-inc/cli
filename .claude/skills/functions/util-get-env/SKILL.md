---
name: util-get-env
description: XanoScript util.get_env function - retrieves environment variables. Use for API keys, secrets, and configuration values.
---

# util.get_env

Retrieves all environment variables available in the script's context.

## Syntax

```xs
util.get_env as $env_vars
```

## Parameters

None.

## Return Value

Returns an object containing all environment variables defined in the workspace.

## Examples

### Get All Environment Variables

```xs
query "get-env" verb=GET {
  input {}

  stack {
    util.get_env as $env_vars
  }

  response = {
    environment: $env_vars
  }
}
// Returns: { "environment": { "API_KEY": "...", "SECRET": "..." } }
```

### Access Specific Environment Variable

```xs
query "use-api-key" verb=GET {
  input {}

  stack {
    util.get_env as $env

    // Access specific key
    var $api_key { value = $env.OPENAI_KEY }
  }

  response = {
    key_exists: `$api_key != null`
  }
}
```

### Use in External API Call

```xs
query "call-external-api" verb=POST {
  input {
    text prompt { description = "AI prompt" }
  }

  stack {
    util.get_env as $env

    // Use env var in API call
    api.call "openai_completion" {
      params = {
        api_key: $env.OPENAI_KEY,
        prompt: $input.prompt
      }
    } as $result
  }

  response = $result
}
```

## Accessing $env Directly

You can also access environment variables directly using `$env`:

```xs
stack {
  // Direct access without util.get_env
  var $key { value = $env.API_KEY }
}
```

## Important Notes

1. **Security** - Never expose sensitive env vars in responses
2. **Read-only** - Cannot modify environment variables at runtime
3. **Workspace scope** - Returns variables for current workspace
4. **Direct access** - `$env.KEY` works without calling util.get_env

## Common Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_KEY` | OpenAI API key |
| `RESEND_API_KEY` | Email service key |
| `DATABASE_URL` | External database connection |
| `JWT_SECRET` | Token signing secret |

## Test API Group

**API Group:** xs-util (ID: 269)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:3KzrYiuB`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| get-env | 2129 | Get environment variables | Working |

## Related Functions

- `security.create_secret_key` - Generate secrets
