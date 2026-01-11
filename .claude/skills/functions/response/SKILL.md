# response

A `response` block specifies the data to return as the result of a `query` or `function`. It defines what data is sent back to the caller.

## Syntax

```xs
response = $variable
```

The response is always placed at the end of a `query` or `function` block, outside the `stack`.

## Test Endpoints

**API Group:** xs-response (ID: 228)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:YmDZDi1i`

### 1. Simple String Response

**Endpoint:** `GET /response/simple` (ID: 1880)

```xs
query /response/simple verb=GET {
  input {}
  stack {
    var $message { value = "Hello, World!" }
  }
  response = $message
}
```

**Response:**
```json
"Hello, World!"
```

### 2. Object Response

**Endpoint:** `GET /response/object` (ID: 1881)

```xs
query /response/object verb=GET {
  input {
    text name?
  }
  stack {
    var $user {
      value = {
        id: 1,
        name: $input.name || "Guest",
        role: "user",
        active: true
      }
    }
  }
  response = $user
}
```

**Response:**
```json
{
  "id": 1,
  "name": "Guest",
  "role": "user",
  "active": true
}
```

### 3. Array Response

**Endpoint:** `GET /response/array` (ID: 1882)

```xs
query /response/array verb=GET {
  input {}
  stack {
    var $items { value = [] }
    array.push $items { value = { id: 1, name: "Item One" } }
    array.push $items { value = { id: 2, name: "Item Two" } }
    array.push $items { value = { id: 3, name: "Item Three" } }
  }
  response = $items
}
```

**Response:**
```json
[
  {"id": 1, "name": "Item One"},
  {"id": 2, "name": "Item Two"},
  {"id": 3, "name": "Item Three"}
]
```

### 4. Computed Response

**Endpoint:** `GET /response/calculate` (ID: 1886)

```xs
query /response/calculate verb=GET {
  input {
    int a?
    int b?
  }
  stack {
    var $x { value = $input.a || 10 }
    var $y { value = $input.b || 5 }
    var $result {
      value = {
        inputs: { a: $x, b: $y },
        computed: {
          sum: `$x + $y`,
          product: `$x * $y`
        }
      }
    }
  }
  response = $result
}
```

**Response (default):**
```json
{
  "inputs": {"a": 10, "b": 5},
  "computed": {"sum": 15, "product": 50}
}
```

### 5. Conditional Response

**Endpoint:** `GET /response/conditional` (ID: 1885)

```xs
query /response/conditional verb=GET {
  input {
    text type?
  }
  stack {
    var $response_data { value = null }
    var $input_type { value = $input.type || "default" }
    conditional {
      if (`$input_type == "user"`) {
        var.update $response_data { value = { type: "user", id: 1, name: "John" } }
      }
      elseif (`$input_type == "product"`) {
        var.update $response_data { value = { type: "product", id: 100, name: "Widget" } }
      }
      else {
        var.update $response_data { value = { type: "default", message: "No type specified" } }
      }
    }
  }
  response = $response_data
}
```

**Test Cases:**
- `?type=user` → `{"type": "user", "id": 1, "name": "John"}`
- `?type=product` → `{"type": "product", "id": 100, "name": "Widget"}`
- No params → `{"type": "default", "message": "No type specified"}`

## Key Patterns

### Pattern 1: Response Placement
Response is always OUTSIDE the stack, at the end of the query/function:

```xs
query /example verb=GET {
  input { ... }
  stack {
    // Logic here
    var $result { value = "data" }
  }
  response = $result  // Outside stack!
}
```

### Pattern 2: Response Types
Response can be any data type:

```xs
// String
response = "Hello"

// Number
response = 42

// Boolean
response = true

// Object
response = $user_object

// Array
response = $items_array

// Null
response = null
```

### Pattern 3: Direct Literals
You can use literal values directly (not just variables):

```xs
response = { status: "ok", message: "Success" }
response = [1, 2, 3]
response = "Done"
```

### Pattern 4: Database Query Results
Common pattern for API endpoints:

```xs
stack {
  db.query "users" { ... } as $users
}
response = $users
```

## Gotchas and Edge Cases

1. **Position Matters**: `response` must be at the end of the query block, after the stack closes.

2. **Single Response**: You can only have one response per query/function.

3. **No Response = Null**: If you omit the response, the API returns `null`.

4. **Variable Must Exist**: The variable you reference must be declared in the stack.

5. **Not Inside Stack**: Don't put `response = ` inside the stack block - it won't work.

6. **Early Exit with return**: Use `return { value = $x }` inside stack for early termination (different from response).

## Response vs Return

| Statement | Location | Purpose |
|-----------|----------|---------|
| `response = $var` | Outside stack | Final API response |
| `return { value = $var }` | Inside stack | Early termination |

```xs
stack {
  conditional {
    if (`$error`) {
      return { value = { error: "Something went wrong" } }  // Early exit
    }
  }
  var $result { value = "Success" }
}
response = $result  // Normal exit
```

## Related Functions

- [query](../query/SKILL.md) - API endpoint definition (contains response)
- [function](../function/SKILL.md) - Custom function definition (contains response)
- [input](../input/SKILL.md) - API input definition
- [return](../return/SKILL.md) - Early termination with value
