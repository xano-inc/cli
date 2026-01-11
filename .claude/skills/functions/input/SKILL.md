# input

An `input` block defines the parameters expected by a `query` or `function`. It specifies data types, optional status, filters, and metadata for each parameter.

## Syntax

```xs
input {
  type name filters=filter1|filter2 {
    description = "Field description"
    sensitive = false
  }
  type optional_name? {
    description = "Optional field"
  }
}
```

## Supported Types

| Type | Description |
|------|-------------|
| `text` | String/text data |
| `int` | Integer numbers |
| `decimal` | Decimal/float numbers |
| `bool` | Boolean true/false |
| `email` | Email address (validated) |
| `password` | Password (hashed, sensitive) |
| `timestamp` | Unix timestamp |
| `date` | Date value |
| `uuid` | UUID string |
| `json` | JSON object/array |
| `image` | Image file |
| `video` | Video file |
| `audio` | Audio file |
| `attachment` | Generic file attachment |
| `vector` | Vector data (for ML/embeddings) |

## Test Endpoints

**API Group:** xs-input (ID: 227)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:Vt8dVKtx`

### 1. Basic Input Types

**Endpoint:** `GET /input/basic-types` (ID: 1875)

```xs
query /input/basic-types verb=GET {
  input {
    text name
    int age
    bool active
  }
  stack {
    var $result {
      value = {
        name: $input.name,
        age: $input.age,
        active: $input.active
      }
    }
  }
  response = $result
}
```

**Test:** `?name=John&age=30&active=true`
```json
{
  "name": "John",
  "age": 30,
  "active": true
}
```

### 2. Optional vs Required Inputs

**Endpoint:** `GET /input/optional` (ID: 1876)

```xs
query /input/optional verb=GET {
  input {
    text required_field
    text optional_field?
    int optional_number?
  }
  stack {
    var $result {
      value = {
        required: $input.required_field,
        optional_text: $input.optional_field || "not provided",
        optional_num: $input.optional_number || 0
      }
    }
  }
  response = $result
}
```

**Key Pattern:** The `?` suffix makes a field optional.

**Test Cases:**
- `?required_field=hello` → Uses defaults for optional fields
- `?required_field=hello&optional_field=world&optional_number=42` → All provided

### 3. Input Filters

**Endpoint:** `GET /input/filters` (ID: 1877)

```xs
query /input/filters verb=GET {
  input {
    text username filters=trim
    email user_email filters=trim|lower
    text search filters=trim
  }
  stack {
    var $result {
      value = {
        username: $input.username,
        email: $input.user_email,
        search: $input.search
      }
    }
  }
  response = $result
}
```

**Available Filters:**
| Filter | Effect |
|--------|--------|
| `trim` | Remove leading/trailing whitespace |
| `lower` | Convert to lowercase |
| `upper` | Convert to uppercase |

**Chaining:** Use `|` to chain filters: `filters=trim|lower`

### 4. Complex Types

**Endpoint:** `POST /input/complex-types` (ID: 1878)

```xs
query /input/complex-types verb=POST {
  input {
    json metadata
    timestamp created_at?
    decimal price?
  }
  stack {
    var $result {
      value = {
        metadata: $input.metadata,
        created_at: $input.created_at,
        price: $input.price
      }
    }
  }
  response = $result
}
```

**Request Body:**
```json
{
  "metadata": {"key": "value", "nested": {"data": true}},
  "created_at": 1704067200,
  "price": 19.99
}
```

### 5. Input Metadata (Description & Sensitive)

**Endpoint:** `POST /input/metadata` (ID: 1879)

```xs
query /input/metadata verb=POST {
  input {
    text username {
      description = "User login name"
      sensitive = false
    }
    password user_password {
      description = "User password - marked sensitive"
      sensitive = true
    }
    email contact_email? {
      description = "Optional contact email"
    }
  }
  stack {
    var $result {
      value = {
        username: $input.username,
        password_received: true,
        email: $input.contact_email || "not provided"
      }
    }
  }
  response = $result
}
```

**Metadata Properties:**
| Property | Description |
|----------|-------------|
| `description` | Documentation for the field |
| `sensitive` | If true, value is masked in logs |

## Key Patterns

### Pattern 1: Accessing Input Values
Use `$input.fieldname` to access input values in your stack:

```xs
input {
  text name
}
stack {
  var $greeting { value = `"Hello, " + $input.name` }
}
```

### Pattern 2: Default Values with Optional Fields
Use `||` operator to provide defaults for optional inputs:

```xs
input {
  int limit?
}
stack {
  var $page_size { value = $input.limit || 10 }
}
```

### Pattern 3: Validation with Precondition
Combine input with precondition for custom validation:

```xs
input {
  int age
}
stack {
  precondition (`$input.age >= 18`) {
    error_type = "standard"
    error = "Must be 18 or older"
  }
}
```

## Gotchas and Edge Cases

1. **Required by Default**: Fields without `?` are required. Missing required fields return an error.

2. **Type Coercion**: Xano attempts to coerce values. String "123" becomes integer 123 for `int` type.

3. **Password Type**: The `password` type automatically hashes the value. Don't use it if you need the raw value.

4. **JSON Type**: The `json` type accepts both objects and arrays.

5. **Filter Order Matters**: Filters apply left to right. `trim|lower` trims first, then lowercases.

6. **Empty String vs Null**: An empty string `""` is different from a missing/null optional field.

## Related Functions

- [query](../query/SKILL.md) - API endpoint definition (contains input)
- [function](../function/SKILL.md) - Custom function definition (contains input)
- [response](../response/SKILL.md) - API response definition
- [precondition](../precondition/SKILL.md) - Input validation
