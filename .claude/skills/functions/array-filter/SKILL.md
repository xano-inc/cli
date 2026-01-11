# array.filter

Filters an array to return only elements that match a condition.

## Native XanoScript Syntax (Recommended)

```xs
array.filter ($arrayVariable) if ($this > 2) as $filtered
```

**Parameters:**
| Parameter | Purpose | Example |
|-----------|---------|---------|
| `$arrayVariable` | The array to filter (in parentheses) | `($nums)` |
| `if (condition)` | Condition using `$this` for current element | `if ($this > 2)` |
| `as $result` | Variable to store filtered array | `as $filtered` |

**Context Variables:**
- `$this` - The current element being evaluated
- `$index` - The numerical index of current element
- `$parent` - The entire array

### Native Syntax Examples

```xs
// Filter numbers greater than 2
array.filter ($nums) if ($this > 2) as $filtered

// Filter objects by property
array.filter ($users) if ($this.active == true) as $activeUsers

// Filter with multiple conditions
array.filter ($products) if ($this.price > 10 && $this.inStock == true) as $available
```

---

## Fallback: api.lambda Syntax

For complex filtering logic, use JavaScript's `filter()` method:

```xs
api.lambda {
  code = "return $var.array_name.filter(x => condition);"
  timeout = 10
} as $filtered
```

## Test Endpoints

**API Group:** xs-array-filter (ID: 253)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:qn5e-xh1`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `filter-basic` | 2004 | Filter numbers >= 18 |
| `filter-objects` | 2005 | Filter objects by property |
| `filter-by-status` | 2006 | Filter with input parameter |
| `filter-empty-result` | 2007 | Returns empty array when no match |
| `filter-multiple-conditions` | 2008 | Filter with AND conditions |

## Patterns

### Pattern 1: Filter by Value

```xs
query "filter-basic" verb=POST {
  input {}

  stack {
    var $ages {
      value = [10, 15, 21, 25, 18, 30, 12]
    }

    api.lambda {
      code = "return $var.ages.filter(x => x >= 18);"
      timeout = 10
    } as $adults
  }

  response = $adults
}
```

**Response:**
```json
[21, 25, 18, 30]
```

### Pattern 2: Filter Objects by Property

```xs
query "filter-objects" verb=POST {
  input {}

  stack {
    var $products {
      value = [{ name: "Apple", price: 1.5 }, { name: "Banana", price: 0.5 }, { name: "Steak", price: 15 }, { name: "Milk", price: 3 }]
    }

    api.lambda {
      code = "return $var.products.filter(p => p.price > 2);"
      timeout = 10
    } as $expensive
  }

  response = $expensive
}
```

**Response:**
```json
[
  {"name": "Steak", "price": 15},
  {"name": "Milk", "price": 3}
]
```

### Pattern 3: Filter with Input Parameter

```xs
query "filter-by-status" verb=POST {
  input {
    text status
  }

  stack {
    var $tasks {
      value = [{ title: "Task 1", status: "done" }, { title: "Task 2", status: "pending" }, { title: "Task 3", status: "done" }]
    }

    api.lambda {
      code = "return $var.tasks.filter(t => t.status === $input.status);"
      timeout = 10
    } as $filtered
  }

  response = $filtered
}
```

**Response with `{"status": "done"}`:**
```json
[
  {"title": "Task 1", "status": "done"},
  {"title": "Task 3", "status": "done"}
]
```

### Pattern 4: Empty Result (No Matches)

```xs
query "filter-empty-result" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3, 4, 5]
    }

    api.lambda {
      code = "return $var.nums.filter(x => x > 100);"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[]
```

### Pattern 5: Multiple Conditions (AND)

```xs
query "filter-multiple-conditions" verb=POST {
  input {}

  stack {
    var $users {
      value = [{ name: "Alice", age: 25, active: true }, { name: "Bob", age: 17, active: true }, { name: "Charlie", age: 30, active: false }, { name: "Diana", age: 22, active: true }]
    }

    api.lambda {
      code = "return $var.users.filter(u => u.age >= 18 && u.active === true);"
      timeout = 10
    } as $active_adults
  }

  response = $active_adults
}
```

**Response:**
```json
[
  {"name": "Alice", "age": 25, "active": true},
  {"name": "Diana", "age": 22, "active": true}
]
```

## Common Filter Patterns

| Use Case | JavaScript Pattern |
|----------|-------------------|
| **By value** | `.filter(x => x > 10)` |
| **By property** | `.filter(o => o.status === 'active')` |
| **Multiple AND** | `.filter(o => o.a && o.b)` |
| **Multiple OR** | `.filter(o => o.a \|\| o.b)` |
| **Not equal** | `.filter(o => o.type !== 'deleted')` |
| **Contains** | `.filter(o => o.name.includes('test'))` |
| **Truthy** | `.filter(o => o.isValid)` |
| **Falsy** | `.filter(o => !o.isDeleted)` |

## Comparison: find vs filter

| Method | Returns | When No Match |
|--------|---------|---------------|
| `find()` | First matching element | `null` |
| `filter()` | Array of ALL matches | `[]` (empty array) |

```xs
// find - returns single element or null
.find(x => x > 10)     // 21

// filter - returns array (possibly empty)
.filter(x => x > 10)   // [21, 25, 30]
```

## Gotchas

### 1. Filter Always Returns an Array

Even with one match, filter returns an array:

```javascript
[1, 2, 3].filter(x => x === 2)  // Returns [2], not 2
```

### 2. Access Variables via $var

```xs
// CORRECT
code = "return $var.users.filter(...);"

// WRONG
code = "return $users.filter(...);"
```

### 3. Input Access via $input

```xs
code = "return $var.items.filter(x => x.type === $input.filter_type);"
```

## Related Functions

- [array.find](../array-find/SKILL.md) - Find FIRST matching element
- [array.map](../array-map/SKILL.md) - Transform array elements
- [array.every](../array-every/SKILL.md) - Check if ALL match
- [array.has](../array-has/SKILL.md) - Check if ANY match
