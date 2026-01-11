# array.intersection

Returns elements that exist in BOTH arrays (set intersection). **Use `api.lambda` with `filter()` and `Set`** for efficient results.

## Recommended Syntax (api.lambda)

```xs
api.lambda {
  code = """
    const setB = new Set($var.arr2);
    return $var.arr1.filter(x => setB.has(x));
  """
  timeout = 10
} as $common
```

## Test Endpoints

**API Group:** xs-array-intersection (ID: 263)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:jUxr0Bu3`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `intersection-basic` | 2054 | Common elements in both arrays |
| `intersection-objects` | 2055 | Intersection of objects by property |
| `intersection-multiple` | 2056 | Intersection of 3+ arrays |
| `intersection-empty` | 2057 | No common elements |
| `intersection-strings` | 2058 | Intersection of string arrays |

## Patterns

### Pattern 1: Basic Intersection

```xs
query "intersection-basic" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3, 4, 5]
    }
    var $arr2 {
      value = [3, 4, 5, 6, 7]
    }

    api.lambda {
      code = """
        const setB = new Set($var.arr2);
        return $var.arr1.filter(x => setB.has(x));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[3, 4, 5]
```

(3, 4, 5 exist in both arrays)

### Pattern 2: Object Intersection by Property

```xs
query "intersection-objects" verb=POST {
  input {}

  stack {
    var $users1 {
      value = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
        { id: 3, name: "Charlie" }
      ]
    }
    var $users2 {
      value = [
        { id: 2, name: "Bob" },
        { id: 3, name: "Charles" },
        { id: 4, name: "Diana" }
      ]
    }

    api.lambda {
      code = """
        const idsInB = new Set($var.users2.map(u => u.id));
        return $var.users1.filter(u => idsInB.has(u.id));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[
  {"id": 2, "name": "Bob"},
  {"id": 3, "name": "Charlie"}
]
```

(Returns objects from arr1 whose IDs exist in arr2)

### Pattern 3: Intersection of Multiple Arrays

```xs
query "intersection-multiple" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3, 4, 5]
    }
    var $arr2 {
      value = [2, 3, 4, 5, 6]
    }
    var $arr3 {
      value = [3, 4, 5, 6, 7]
    }

    api.lambda {
      code = """
        const setB = new Set($var.arr2);
        const setC = new Set($var.arr3);
        return $var.arr1.filter(x => setB.has(x) && setC.has(x));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[3, 4, 5]
```

(Only 3, 4, 5 exist in all three arrays)

### Pattern 4: Empty Intersection (No Common Elements)

```xs
query "intersection-empty" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3]
    }
    var $arr2 {
      value = [4, 5, 6]
    }

    api.lambda {
      code = """
        const setB = new Set($var.arr2);
        return $var.arr1.filter(x => setB.has(x));
      """
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

(No elements in common)

### Pattern 5: String Intersection

```xs
query "intersection-strings" verb=POST {
  input {}

  stack {
    var $tags1 {
      value = ["javascript", "typescript", "react", "node"]
    }
    var $tags2 {
      value = ["typescript", "python", "react", "django"]
    }

    api.lambda {
      code = """
        const setB = new Set($var.tags2);
        return $var.tags1.filter(x => setB.has(x));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
["typescript", "react"]
```

## The Set + Filter Pattern

```javascript
// Efficient O(n+m) intersection using Set
const setB = new Set(arr2);           // O(m) - create lookup
return arr1.filter(x => setB.has(x)); // O(n) - filter using O(1) lookup
```

This is more efficient than using `includes()`:

```javascript
// SLOW O(n*m) - avoid!
arr1.filter(x => arr2.includes(x))

// FAST O(n+m) - use Set
const setB = new Set(arr2);
arr1.filter(x => setB.has(x))
```

## Set Operations Summary

| Operation | Formula | Returns |
|-----------|---------|---------|
| **Union** | `A ∪ B` | All unique from both |
| **Intersection** | `A ∩ B` | Only common elements |
| **Difference** | `A - B` | In A but not B |
| **Symmetric Diff** | `(A - B) ∪ (B - A)` | In either, not both |

## Common Use Cases

| Scenario | Why Intersection |
|----------|------------------|
| **Common tags** | Tags shared between items |
| **Shared permissions** | Permissions user has AND needs |
| **Common friends** | Users both people follow |
| **Matching skills** | Required skills candidate has |
| **Available times** | Time slots both have free |
| **Feature overlap** | Features in both plans |

## Gotchas

### 1. Order Follows First Array

Result order matches arr1:

```javascript
const arr1 = [3, 1, 2];
const arr2 = [2, 3, 4];
// Result: [3, 2] - order from arr1
```

### 2. Objects Need Key-Based Comparison

`Set.has()` uses reference equality for objects:

```javascript
// WRONG - won't work for objects
const setB = new Set([{id: 1}, {id: 2}]);
setB.has({id: 1});  // false - different reference!

// CORRECT - compare by property
const idsInB = new Set(arr2.map(x => x.id));
arr1.filter(x => idsInB.has(x.id));
```

### 3. Duplicates in First Array

Duplicates in arr1 are preserved if they match:

```javascript
const arr1 = [1, 1, 2, 2, 3];
const arr2 = [2, 3, 4];
// Result: [2, 2, 3]  - both 2s are kept
```

To dedupe result:

```javascript
[...new Set(arr1.filter(x => setB.has(x)))]
```

### 4. Intersection is Symmetric (for primitives)

Unlike difference, order doesn't matter for what elements are included:

```javascript
// A ∩ B = B ∩ A (same elements, possibly different order)
[1,2,3].filter(x => [2,3,4].includes(x))  // [2, 3]
[2,3,4].filter(x => [1,2,3].includes(x))  // [2, 3]
```

### 5. Access Variables via $var

```xs
// CORRECT
code = "const setB = new Set($var.arr2);"

// WRONG
code = "const setB = new Set($arr2);"
```

### 6. Empty Array = Empty Result

```javascript
const setB = new Set([]);
[1, 2, 3].filter(x => setB.has(x));  // []
```

## Related Functions

- [array.union](../array-union/SKILL.md) - All unique elements from both
- [array.difference](../array-difference/SKILL.md) - Elements in first but not second
- [array.has](../array-has/SKILL.md) - Check if any element matches
