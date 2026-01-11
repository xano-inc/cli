# array.has

Checks if any element in an array matches a condition. Returns `true` if at least one element passes the test, `false` otherwise. **Use `api.lambda` with JavaScript's `some()` method** for reliable results.

## Recommended Syntax (api.lambda)

```xs
api.lambda {
  code = "return $var.array_name.some(x => condition);"
  timeout = 10
} as $has_match
```

## Test Endpoints

**API Group:** xs-array-has (ID: 256)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:WsHKzZ3M`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `has-basic` | 2019 | Check if any number > 10 |
| `has-object` | 2020 | Check if any object matches property |
| `has-not-found` | 2021 | Returns false when no match |
| `has-with-input` | 2022 | Check with input parameter |
| `has-empty` | 2023 | Check on empty array |

## Patterns

### Pattern 1: Basic Value Check

```xs
query "has-basic" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 5, 10, 15, 20]
    }

    api.lambda {
      code = "return $var.nums.some(x => x > 10);"
      timeout = 10
    } as $has_over_10
  }

  response = $has_over_10
}
```

**Response:**
```json
true
```

### Pattern 2: Check Object Property

```xs
query "has-object" verb=POST {
  input {}

  stack {
    var $users {
      value = [{ name: "Alice", active: false }, { name: "Bob", active: true }, { name: "Charlie", active: false }]
    }

    api.lambda {
      code = "return $var.users.some(u => u.active === true);"
      timeout = 10
    } as $has_active
  }

  response = $has_active
}
```

**Response:**
```json
true
```

### Pattern 3: No Match Found (Returns false)

```xs
query "has-not-found" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3, 4, 5]
    }

    api.lambda {
      code = "return $var.nums.some(x => x > 100);"
      timeout = 10
    } as $has_over_100
  }

  response = $has_over_100
}
```

**Response:**
```json
false
```

### Pattern 4: Check with Input Parameter

```xs
query "has-with-input" verb=POST {
  input {
    text search_name
  }

  stack {
    var $names {
      value = ["Alice", "Bob", "Charlie", "Diana"]
    }

    api.lambda {
      code = "return $var.names.some(n => n === $input.search_name);"
      timeout = 10
    } as $found
  }

  response = $found
}
```

**Response with `{"search_name": "Bob"}`:**
```json
true
```

**Response with `{"search_name": "Eve"}`:**
```json
false
```

### Pattern 5: Empty Array (Always false)

```xs
query "has-empty" verb=POST {
  input {}

  stack {
    var $empty {
      value = []
    }

    api.lambda {
      code = "return $var.empty.some(x => x > 0);"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
false
```

## Common "Has" Patterns

| Use Case | JavaScript Pattern |
|----------|-------------------|
| **Has value above threshold** | `.some(x => x > 10)` |
| **Has active item** | `.some(o => o.active)` |
| **Has specific value** | `.some(x => x === 'target')` |
| **Has matching property** | `.some(o => o.status === 'pending')` |
| **Has non-empty string** | `.some(s => s && s.length > 0)` |
| **Has valid item** | `.some(o => o.isValid)` |
| **Has item with value** | `.some(o => o.price > 0)` |

## Comparison: some vs every vs find

| Method | Returns | Purpose |
|--------|---------|---------|
| `some()` | `boolean` | True if **ANY** element matches |
| `every()` | `boolean` | True if **ALL** elements match |
| `find()` | element or `undefined` | Returns **first** matching element |

```javascript
// some - at least one matches
[1, 2, 3].some(x => x > 2)  // true (3 matches)

// every - all must match
[1, 2, 3].every(x => x > 0)  // true (all positive)
[1, 2, 3].every(x => x > 2)  // false (1 and 2 fail)

// find - get the element, not boolean
[1, 2, 3].find(x => x > 2)   // 3
```

## Use Cases

| Scenario | Use `some()` When... |
|----------|---------------------|
| **Validation** | Check if any input is invalid |
| **Authorization** | Check if user has any required role |
| **Inventory** | Check if any product is in stock |
| **Notifications** | Check if any message is unread |
| **Search** | Quick existence check before detailed find |

## Gotchas

### 1. Returns Boolean, Not Element

```javascript
[1, 2, 3].some(x => x > 2)  // Returns true, not 3
```

To get the element, use `find()` instead.

### 2. Empty Array Always Returns false

```javascript
[].some(x => true)  // false - no elements to test
```

### 3. Access Variables via $var

```xs
// CORRECT
code = "return $var.items.some(...);"

// WRONG
code = "return $items.some(...);"
```

### 4. Input Access via $input

```xs
code = "return $var.names.some(n => n === $input.search_name);"
```

## Related Functions

- [array.every](../array-every/SKILL.md) - Check if ALL elements match
- [array.find](../array-find/SKILL.md) - Find first matching element
- [array.filter](../array-filter/SKILL.md) - Get all matching elements
