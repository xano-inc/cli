# array.find_index

Finds the index of the first element in an array that matches a condition. Returns the index (0-based) if found, or `-1` if no element matches. **Use `api.lambda` with JavaScript's `findIndex()` method** for reliable results.

## Recommended Syntax (api.lambda)

```xs
api.lambda {
  code = "return $var.array_name.findIndex(x => condition);"
  timeout = 10
} as $index
```

## Test Endpoints

**API Group:** xs-array-find-index (ID: 258)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:JFC6rD8w`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `find-index-basic` | 2029 | Find index of first number > 25 |
| `find-index-not-found` | 2030 | Returns -1 when no match |
| `find-index-object` | 2031 | Find index of object by property |
| `find-index-with-input` | 2032 | Find index using input parameter |
| `find-index-last` | 2033 | Find last index (findLastIndex) |

## Patterns

### Pattern 1: Find Index by Value Condition

```xs
query "find-index-basic" verb=POST {
  input {}

  stack {
    var $nums {
      value = [10, 20, 30, 40, 50]
    }

    api.lambda {
      code = "return $var.nums.findIndex(x => x > 25);"
      timeout = 10
    } as $idx
  }

  response = $idx
}
```

**Response:**
```json
2
```

(30 is at index 2, the first element > 25)

### Pattern 2: Not Found Returns -1

```xs
query "find-index-not-found" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3, 4, 5]
    }

    api.lambda {
      code = "return $var.nums.findIndex(x => x > 100);"
      timeout = 10
    } as $idx
  }

  response = $idx
}
```

**Response:**
```json
-1
```

### Pattern 3: Find Index of Object by Property

```xs
query "find-index-object" verb=POST {
  input {}

  stack {
    var $users {
      value = [{ name: "Alice", active: false }, { name: "Bob", active: true }, { name: "Charlie", active: true }]
    }

    api.lambda {
      code = "return $var.users.findIndex(u => u.active === true);"
      timeout = 10
    } as $idx
  }

  response = $idx
}
```

**Response:**
```json
1
```

(Bob at index 1 is the first active user)

### Pattern 4: Find Index with Input Parameter

```xs
query "find-index-with-input" verb=POST {
  input {
    text search_name
  }

  stack {
    var $names {
      value = ["Alice", "Bob", "Charlie", "Diana"]
    }

    api.lambda {
      code = "return $var.names.findIndex(n => n === $input.search_name);"
      timeout = 10
    } as $idx
  }

  response = $idx
}
```

**Response with `{"search_name": "Charlie"}`:**
```json
2
```

**Response with `{"search_name": "Eve"}`:**
```json
-1
```

### Pattern 5: Find Last Index (findLastIndex)

```xs
query "find-index-last" verb=POST {
  input {}

  stack {
    var $nums {
      value = [2, 4, 6, 8, 4, 10]
    }

    api.lambda {
      code = "return $var.nums.findLastIndex(x => x === 4);"
      timeout = 10
    } as $idx
  }

  response = $idx
}
```

**Response:**
```json
4
```

(The last occurrence of 4 is at index 4)

## JavaScript Index Methods

| Method | Returns | When No Match |
|--------|---------|---------------|
| `findIndex(fn)` | Index of **first** match | `-1` |
| `findLastIndex(fn)` | Index of **last** match | `-1` |
| `indexOf(value)` | Index of **first** exact match | `-1` |
| `lastIndexOf(value)` | Index of **last** exact match | `-1` |

### indexOf vs findIndex

```javascript
// indexOf - exact value match (no callback)
['a', 'b', 'c'].indexOf('b')           // 1

// findIndex - callback condition
[{id: 1}, {id: 2}].findIndex(x => x.id === 2)  // 1
```

Use `indexOf` for simple value lookups, `findIndex` for complex conditions or object property matching.

## Common Patterns

| Use Case | JavaScript Pattern |
|----------|-------------------|
| **Find by ID** | `.findIndex(x => x.id === targetId)` |
| **Find first match** | `.findIndex(x => x.status === 'pending')` |
| **Find by threshold** | `.findIndex(x => x.price > 100)` |
| **Find by string** | `.findIndex(x => x.name.includes('test'))` |
| **Find exact value** | `.indexOf(value)` or `.findIndex(x => x === value)` |

## Use Cases

| Scenario | Why findIndex |
|----------|---------------|
| **Update specific item** | Get index, then modify `array[index]` |
| **Remove item** | Get index, then `splice(index, 1)` |
| **Check position** | Verify item appears before/after another |
| **Conditional logic** | Take action based on whether item exists (index !== -1) |
| **Swap/reorder** | Need position for array manipulation |

## Gotchas

### 1. Returns -1, Not null

Unlike `find()` which returns `null`/`undefined` when not found, `findIndex()` returns `-1`:

```javascript
[1, 2, 3].findIndex(x => x > 100)  // -1, not null
```

Always check for `-1`:
```javascript
const idx = arr.findIndex(condition);
if (idx !== -1) {
  // found - do something with arr[idx]
}
```

### 2. 0 is a Valid Index!

Don't use `if (index)` to check if found - 0 is falsy but valid:

```javascript
// WRONG - fails when item is at index 0
const idx = arr.findIndex(x => x === arr[0]);
if (idx) { /* never runs when idx is 0 */ }

// CORRECT
if (idx !== -1) { /* works for all indices */ }
```

### 3. Access Variables via $var

```xs
// CORRECT
code = "return $var.items.findIndex(...);"

// WRONG
code = "return $items.findIndex(...);"
```

### 4. Returns First Match Only

`findIndex()` stops at the first match. To find all indices:

```javascript
// Find all indices where value > 10
const indices = [];
arr.forEach((val, idx) => {
  if (val > 10) indices.push(idx);
});
```

### 5. findLastIndex Browser Support

`findLastIndex()` is ES2023. It works in Xano's Lambda environment but may not work in older browsers for client-side code.

## Related Functions

- [array.find](../array-find/SKILL.md) - Find the element itself (not index)
- [array.filter](../array-filter/SKILL.md) - Find ALL matching elements
- [array.has](../array-has/SKILL.md) - Check if ANY element matches (boolean)
