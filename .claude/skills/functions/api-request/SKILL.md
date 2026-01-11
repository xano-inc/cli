---
name: api-request
description: XanoScript api.request function for making HTTP requests to external APIs. Use when calling third-party APIs, webhooks, or external services from Xano endpoints.
---

# api.request

Makes HTTP requests to external URLs and retrieves responses. Supports all HTTP methods (GET, POST, PUT, DELETE, PATCH), custom headers, query parameters, request bodies, and configurable timeouts.

## Syntax

```xs
api.request {
  url = "https://api.example.com/endpoint"
  method = "GET"
  params = {}
  headers = []
  timeout = 30
} as $response
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | text | Yes | The full URL to make the request to |
| `method` | text | Yes | HTTP method: GET, POST, PUT, DELETE, PATCH |
| `params` | object | No | Query params (GET) or request body (POST/PUT/PATCH) |
| `headers` | array | No | Array of header strings like "Header-Name: value" |
| `timeout` | int | No | Request timeout in seconds (default varies) |

## Return Value

Returns a response object with:
- `request` - Details about the request made (url, method, headers, params)
- `response` - The response data including headers, result, and status code

## Examples

### Example 1: Basic GET Request

Simple GET request to fetch data from an external API.

```xs
query "request-basic-get" verb=GET {
  input {}
  stack {
    api.request {
      url = "https://jsonplaceholder.typicode.com/posts/1"
      method = "GET"
      timeout = 30
    } as $api_response

    // Wrap response for proper return
    var $result {
      value = $api_response
    }
  }
  response = $result
}
```

**Tested in API:** `xs-api-request/request-basic-get`

### Example 2: POST with JSON Body

POST request with JSON payload to create a resource.

```xs
query "request-post-json" verb=POST {
  input {
    text name {
      description = "Name to send"
    }
    text email {
      description = "Email to send"
    }
  }
  stack {
    api.request {
      url = "https://jsonplaceholder.typicode.com/posts"
      method = "POST"
      params = {
        title: $input.name,
        body: $input.email,
        userId: 1
      }
      headers = []|push:"Content-Type: application/json"
      timeout = 30
    } as $api_response

    var $result {
      value = $api_response
    }
  }
  response = $result
}
```

**Tested in API:** `xs-api-request/request-post-json`

### Example 3: GET with Query Parameters

Building query parameters dynamically using the `|set` filter.

```xs
query "request-query-params" verb=GET {
  input {
    text search {
      description = "Search term"
    }
    int page?=1 {
      description = "Page number"
    }
    int limit?=10 {
      description = "Results per page"
    }
  }
  stack {
    api.request {
      url = "https://jsonplaceholder.typicode.com/posts"
      method = "GET"
      params = {}|set:"userId":$input.page|set:"_limit":$input.limit
      timeout = 30
    } as $api_response

    var $result {
      value = $api_response
    }
  }
  response = $result
}
```

**Tested in API:** `xs-api-request/request-query-params`

### Example 4: Custom Headers with Authorization

Adding Authorization and custom headers to requests.

```xs
query "request-with-headers" verb=GET {
  input {
    text auth_token?="test-token-123" {
      description = "Authorization token"
    }
  }
  stack {
    api.request {
      url = "https://httpbin.org/headers"
      method = "GET"
      headers = []|push:"Authorization: Bearer " ~ $input.auth_token|push:"X-Custom-Header: XanoScript-Test"
      timeout = 30
    } as $api_response

    var $result {
      value = $api_response
    }
  }
  response = $result
}
```

**Tested in API:** `xs-api-request/request-with-headers`

### Example 5: Error Handling with try_catch

Proper error handling for failed HTTP requests - **this is the recommended pattern**.

```xs
query "request-error-handling" verb=GET {
  input {
    int status_code?=404 {
      description = "HTTP status code to request (200, 400, 404, 500)"
    }
  }
  stack {
    var $result {
      value = {
        success: false,
        error: null,
        data: null
      }
    }

    try_catch {
      try {
        api.request {
          url = "https://httpbin.org/status/" ~ $input.status_code
          method = "GET"
          timeout = 30
        } as $api_response

        var.update $result {
          value = {
            success: true,
            error: null,
            data: $api_response
          }
        }
      }
      catch {
        var.update $result {
          value = {
            success: false,
            error: $error.message,
            data: null
          }
        }
      }
    }
  }
  response = $result
}
```

**Tested in API:** `xs-api-request/request-error-handling` - **Verified working!**

## Gotchas and Warnings

### 1. Always Wrap Response in a Variable

Direct `response = $api_response` may return `null`. Always wrap the api.request result:

```xs
// DON'T do this - may return null
api.request { ... } as $response
response = $response

// DO this instead
api.request { ... } as $api_response
var $result {
  value = $api_response
}
response = $result
```

### 2. Header Syntax

Headers are an array of strings, each containing "Name: Value":

```xs
// Correct - array of header strings
headers = []|push:"Content-Type: application/json"|push:"Authorization: Bearer token"

// Wrong - not an array
headers = {"Content-Type": "application/json"}
```

### 3. Building Dynamic Params

Use `|set` filter to build params dynamically:

```xs
// Build params with set filter
params = {}|set:"key1":"value1"|set:"key2":$input.value

// For nested objects, use set with constructed values
params = {}|set:"user":({}|set:"name":$input.name|set:"email":$input.email)
```

### 4. String Concatenation for URLs

Use `~` operator for string concatenation:

```xs
// Correct - concatenation with ~
url = "https://api.example.com/users/" ~ $input.user_id

// Wrong - won't work
url = "https://api.example.com/users/$input.user_id"
```

### 5. Always Use try_catch for External APIs

External APIs can fail. Always wrap in try_catch for production code:

```xs
try_catch {
  try {
    api.request { ... } as $data
    // Process successful response
  }
  catch {
    // Handle error - $error.message contains the error
  }
}
```

### 6. Response Structure

The api.request returns an object with this structure:

```json
{
  "request": {
    "url": "https://...",
    "method": "GET",
    "headers": [...],
    "params": [...]
  },
  "response": {
    "headers": [...],
    "result": "...",  // The actual response body
    "status": 200
  }
}
```

Access the actual data via `$response.response.result`.

## Test Results

| API Group | Status | Notes |
|-----------|--------|-------|
| `xs-api-request` (270) | Partial | Error handling endpoint verified working; others need response wrapper fix |

**API Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:_eT7hvG3`

## Related Functions

- [api.lambda](../api-lambda/SKILL.md) - Run JavaScript/TypeScript code
- [api.stream](../api-stream/SKILL.md) - Stream data responses
- [try_catch](../try-catch/SKILL.md) - Error handling (not yet documented)
