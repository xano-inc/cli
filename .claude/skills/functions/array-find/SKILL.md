# array.find

Finds the first element in an array that matches a condition. Returns the element or `null` if not found.

## Native XanoScript Syntax (Recommended)

```xs
array.find ($arrayVariable) if ($this > 18) as $found
```

**Parameters:**
| Parameter | Purpose | Example |
|-----------|---------|---------|
| `$arrayVariable` | The array to search (in parentheses) | `($nums)` |
| `if (condition)` | Condition using `$this` for current element | `if ($this > 18)` |
| `as $result` | Variable to store found element | `as $found` |

**Context Variables:**
- `$this` - The current element being evaluated
- `$index` - The numerical index of current element
- `$parent` - The entire array

### Native Syntax Examples

```xs
// Find first number greater than 25
array.find ($nums) if ($this > 25) as $found

// Find first user by property
array.find ($users) if ($this.role == "admin") as $admin

// Find object with specific ID
array.find ($items) if ($this.id == $input.item_id) as $item
```

---

## Fallback: api.lambda Syntax

For complex conditions, use JavaScript's `find()` method:

```xs
api.lambda {
  code = "return $var.array_name.find(x => condition);"
  timeout = 10
} as $found
```

## Test Endpoints

**API Group:** xs-array-find (ID: 252)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:iOMqVxYl`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `find-basic` | 1999 | Find first number > 18 |
| `find-object` | 2000 | Find first object matching condition |
| `find-by-property` | 2001 | Find by property with input |
| `find-not-found` | 2002 | Returns null when no match |
| `find-index` | 2003 | Find index of element |

## Patterns

### Pattern 1: Find First Matching Value

```xs
query "find-basic" verb=POST {
  input {}

  stack {
    var $ages {
      value = [10, 15, 21, 25, 30]
    }

    api.lambda {
      code = "return $var.ages.find(x => x > 18);"
      timeout = 10
    } as $first_adult
  }

  response = $first_adult
}
```

**Response:**
```json
21
```

### Pattern 2: Find Object in Array

```xs
query "find-object" verb=POST {
  input {}

  stack {
    var $users {
      value = [{ name: "Alice", age: 17 }, { name: "Bob", age: 21 }, { name: "Charlie", age: 25 }]
    }

    api.lambda {
      code = "return $var.users.find(u => u.age >= 21);"
      timeout = 10
    } as $adult_user
  }

  response = $adult_user
}
```

**Response:**
```json
{"name": "Bob", "age": 21}
```

### Pattern 3: Find by Property with Input

```xs
query "find-by-property" verb=POST {
  input {
    text search_name
  }

  stack {
    var $users {
      value = [{ name: "Alice", role: "admin" }, { name: "Bob", role: "user" }]
    }

    api.lambda {
      code = "return $var.users.find(u => u.name === $input.search_name);"
      timeout = 10
    } as $found_user
  }

  response = $found_user
}
```

**Response with `{"search_name": "Bob"}`:**
```json
{"name": "Bob", "role": "user"}
```

### Pattern 4: Handle Not Found (Returns null)

```xs
query "find-not-found" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3, 4, 5]
    }

    api.lambda {
      code = "return $var.nums.find(x => x > 100);"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
null
```

### Pattern 5: Find Index

```xs
query "find-index" verb=POST {
  input {}

  stack {
    var $items {
      value = ["apple", "banana", "cherry", "date"]
    }

    api.lambda {
      code = "return $var.items.findIndex(x => x === 'cherry');"
      timeout = 10
    } as $idx

    var $result {
      value = $idx
    }
  }

  response = $result
}
```

**Response:**
```json
2
```

## JavaScript find() Methods in Lambda

| Method | Returns | When No Match |
|--------|---------|---------------|
| `find(fn)` | First matching element | `undefined` (becomes `null`) |
| `findIndex(fn)` | Index of first match | `-1` |
| `findLast(fn)` | Last matching element | `undefined` |
| `findLastIndex(fn)` | Index of last match | `-1` |

## Use Cases

| Use Case | Pattern |
|----------|---------|
| **Find user by ID** | `.find(u => u.id === id)` |
| **Find first valid** | `.find(x => x.isValid)` |
| **Find by status** | `.find(o => o.status === 'active')` |
| **Check existence** | `.find(...) !== undefined` |

## Gotchas and Limitations

### 1. Parentheses Required Around Array Variable

The array variable MUST be in parentheses:

```xs
// CORRECT
array.find ($nums) if ($this > 10) as $found

// WRONG - will fail
array.find $nums if ($this > 10) as $found
```

### 2. Access Variables via $var in Lambda

```xs
// WRONG - $ages not accessible
code = "return $ages.find(...);"

// CORRECT - use $var prefix
code = "return $var.ages.find(...);"
```

### 3. Access Input via $input in Lambda

```xs
// Input is accessible as $input (not $var.input)
code = "return $var.users.find(u => u.name === $input.search_name);"
```

### 4. Lambda Result May Need Intermediate Variable

When using `as $var` with api.lambda, the result may need to be assigned to an intermediate variable before using in response:

```xs
api.lambda { ... } as $idx

// Sometimes needed:
var $result { value = $idx }
response = $result
```

## Related Functions

- [array.filter](../array-filter/SKILL.md) - Find ALL matching elements
- [array.find_index](../array-find-index/SKILL.md) - Find index of element
- [array.has](../array-has/SKILL.md) - Check if element exists
