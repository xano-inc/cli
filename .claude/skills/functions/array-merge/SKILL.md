# array.merge

Combines two or more arrays into a single array. **Use `api.lambda` with JavaScript spread syntax or `concat()`** for reliable results.

## Recommended Syntax (api.lambda)

```xs
// Using spread syntax
api.lambda {
  code = "return [...$var.arr1, ...$var.arr2];"
  timeout = 10
} as $merged

// Using concat method
api.lambda {
  code = "return $var.arr1.concat($var.arr2);"
  timeout = 10
} as $merged
```

## Test Endpoints

**API Group:** xs-array-merge (ID: 255)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:-OrMg1XA`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `merge-basic` | 2014 | Merge two number arrays |
| `merge-objects` | 2015 | Merge arrays of objects |
| `merge-multiple` | 2016 | Merge three arrays |
| `merge-with-empty` | 2017 | Merge with empty array |
| `merge-concat` | 2018 | Using concat method |

## Patterns

### Pattern 1: Basic Merge

```xs
query "merge-basic" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3]
    }

    var $arr2 {
      value = [4, 5, 6]
    }

    api.lambda {
      code = "return [...$var.arr1, ...$var.arr2];"
      timeout = 10
    } as $merged
  }

  response = $merged
}
```

**Response:**
```json
[1, 2, 3, 4, 5, 6]
```

### Pattern 2: Merge Arrays of Objects

```xs
query "merge-objects" verb=POST {
  input {}

  stack {
    var $users1 {
      value = [{ name: "Alice" }, { name: "Bob" }]
    }

    var $users2 {
      value = [{ name: "Charlie" }, { name: "Diana" }]
    }

    api.lambda {
      code = "return [...$var.users1, ...$var.users2];"
      timeout = 10
    } as $all_users
  }

  response = $all_users
}
```

**Response:**
```json
[
  {"name": "Alice"},
  {"name": "Bob"},
  {"name": "Charlie"},
  {"name": "Diana"}
]
```

### Pattern 3: Merge Multiple Arrays

```xs
query "merge-multiple" verb=POST {
  input {}

  stack {
    var $a {
      value = [1, 2]
    }

    var $b {
      value = [3, 4]
    }

    var $c {
      value = [5, 6]
    }

    api.lambda {
      code = "return [...$var.a, ...$var.b, ...$var.c];"
      timeout = 10
    } as $merged
  }

  response = $merged
}
```

**Response:**
```json
[1, 2, 3, 4, 5, 6]
```

### Pattern 4: Merge with Empty Array

```xs
query "merge-with-empty" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3]
    }

    var $empty {
      value = []
    }

    api.lambda {
      code = "return [...$var.arr1, ...$var.empty];"
      timeout = 10
    } as $merged
  }

  response = $merged
}
```

**Response:**
```json
[1, 2, 3]
```

### Pattern 5: Using concat Method

```xs
query "merge-concat" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = ["a", "b"]
    }

    var $arr2 {
      value = ["c", "d"]
    }

    api.lambda {
      code = "return $var.arr1.concat($var.arr2);"
      timeout = 10
    } as $merged
  }

  response = $merged
}
```

**Response:**
```json
["a", "b", "c", "d"]
```

## Comparison: Spread vs Concat

| Method | Syntax | Notes |
|--------|--------|-------|
| Spread `...` | `[...arr1, ...arr2]` | Modern, readable, multiple arrays |
| `concat()` | `arr1.concat(arr2)` | Classic, chains well |

Both produce the same result. Spread is preferred for merging multiple arrays.

## Common Merge Patterns

```javascript
// Two arrays
[...arr1, ...arr2]

// Multiple arrays
[...arr1, ...arr2, ...arr3]

// Add single element
[...arr1, newElement]

// Prepend element
[newElement, ...arr1]

// Merge with transformation
[...arr1, ...arr2.map(x => x * 2)]
```

## Gotchas

### 1. Merge Does NOT Remove Duplicates

```javascript
[1, 2, 3, 2, 3, 4]  // Duplicates remain
```

To remove duplicates, use `Set`:
```javascript
[...new Set([...arr1, ...arr2])]
```

### 2. Original Arrays Are Not Modified

Merge creates a new array; originals stay unchanged.

### 3. Access Variables via $var

```xs
// CORRECT
code = "return [...$var.arr1, ...$var.arr2];"

// WRONG
code = "return [...$arr1, ...$arr2];"
```

## Related Functions

- [array.push](../array-push/SKILL.md) - Add single element to end
- [array.unshift](../array-unshift/SKILL.md) - Add single element to beginning
- [array.union](../array-union/SKILL.md) - Merge with duplicates removed
