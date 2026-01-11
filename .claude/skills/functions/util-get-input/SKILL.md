---
name: util-get-input
description: XanoScript util.get_all_input and util.get_input functions - retrieve request input data. Use for accessing raw or parsed request body.
---

# util.get_all_input / util.get_input

Functions to retrieve input data from the request.

## Syntax

```xs
// Get all parsed input parameters
util.get_all_input as $all_input

// Get raw, unparsed input
util.get_input as $raw_input
```

## Parameters

None for either function.

## Return Value

- `util.get_all_input` - Returns parsed input as structured object
- `util.get_input` - Returns raw request body (may be string or object)

## Examples

### Get All Input

```xs
query "get-input" verb=POST {
  input {
    text name { description = "User name" }
    int age { description = "User age" }
  }

  stack {
    util.get_all_input as $all_input
    util.get_input as $raw_input
  }

  response = {
    all_input: $all_input,
    raw_input: $raw_input
  }
}
// POST {"name": "John", "age": 30}
// Returns: {
//   "all_input": { "name": "John", "age": 30 },
//   "raw_input": { "name": "John", "age": 30 }
// }
```

### Handle Dynamic Input

```xs
query "dynamic-handler" verb=POST {
  input {}  // No defined input

  stack {
    // Get whatever was sent
    util.get_all_input as $data

    // Process dynamically
    var $keys { value = `$data|keys` }
  }

  response = {
    received_keys: $keys,
    data: $data
  }
}
```

### Validate Raw Input

```xs
query "validate-input" verb=POST {
  input {
    json payload { description = "Request payload" }
  }

  stack {
    util.get_input as $raw

    // Check if specific fields exist
    var $has_required { value = `$raw.required_field != null` }

    precondition ($has_required) {
      error_type = "validation"
      error = "Missing required_field"
    }
  }

  response = {
    valid: true,
    payload: $raw
  }
}
```

## Differences

| Function | Returns | Use Case |
|----------|---------|----------|
| `util.get_all_input` | Parsed, typed input | Standard form/JSON data |
| `util.get_input` | Raw request body | XML, binary, custom formats |

## When to Use

### util.get_all_input
- Standard JSON/form data
- When you need typed values
- Working with defined input schema

### util.get_input
- Accessing raw request body
- Custom content types
- Debugging input issues

## Important Notes

1. **$input shortcut** - For defined inputs, use `$input.field` directly
2. **No modification** - These return copies, not references
3. **Content-Type aware** - Parsing depends on request Content-Type
4. **Empty input** - Returns empty object if no input provided

## Test API Group

**API Group:** xs-util (ID: 269)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:3KzrYiuB`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| get-input | 2130 | Get parsed and raw input | Working |

## Related Functions

- `util.get_env` - Get environment variables
