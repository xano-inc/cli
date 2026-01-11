# array.difference

Returns elements that exist in the first array but not in the second (set difference). **Use `api.lambda` with `filter()` and `Set`** for efficient results.

## Recommended Syntax (api.lambda)

```xs
api.lambda {
  code = """
    const setB = new Set($var.arr2);
    return $var.arr1.filter(x => !setB.has(x));
  """
  timeout = 10
} as $diff
```

## Test Endpoints

**API Group:** xs-array-difference (ID: 262)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:PpVk0gm7`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `difference-basic` | 2049 | Elements in first not in second |
| `difference-objects` | 2050 | Difference of objects by property |
| `difference-symmetric` | 2051 | Symmetric difference (XOR) |
| `difference-empty` | 2052 | All elements match (empty result) |
| `difference-all` | 2053 | No elements match (all returned) |

## Patterns

### Pattern 1: Basic Difference

```xs
query "difference-basic" verb=POST {
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
        return $var.arr1.filter(x => !setB.has(x));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[1, 2]
```

(1 and 2 are in arr1 but not in arr2)

### Pattern 2: Object Difference by Property

```xs
query "difference-objects" verb=POST {
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
        { id: 4, name: "Diana" }
      ]
    }

    api.lambda {
      code = """
        const idsInB = new Set($var.users2.map(u => u.id));
        return $var.users1.filter(u => !idsInB.has(u.id));
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
  {"id": 1, "name": "Alice"},
  {"id": 3, "name": "Charlie"}
]
```

### Pattern 3: Symmetric Difference (XOR)

Elements in either array but NOT in both:

```xs
query "difference-symmetric" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3, 4]
    }
    var $arr2 {
      value = [3, 4, 5, 6]
    }

    api.lambda {
      code = """
        const setA = new Set($var.arr1);
        const setB = new Set($var.arr2);

        const onlyInA = $var.arr1.filter(x => !setB.has(x));
        const onlyInB = $var.arr2.filter(x => !setA.has(x));

        return [...onlyInA, ...onlyInB];
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[1, 2, 5, 6]
```

(1,2 only in arr1; 5,6 only in arr2)

### Pattern 4: Empty Result (All Match)

```xs
query "difference-empty" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3]
    }
    var $arr2 {
      value = [1, 2, 3, 4, 5]
    }

    api.lambda {
      code = """
        const setB = new Set($var.arr2);
        return $var.arr1.filter(x => !setB.has(x));
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

(All elements in arr1 exist in arr2)

### Pattern 5: All Elements Different

```xs
query "difference-all" verb=POST {
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
        return $var.arr1.filter(x => !setB.has(x));
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[1, 2, 3]
```

(No elements in arr1 exist in arr2)

## The Set + Filter Pattern

```javascript
// Efficient O(n) difference using Set
const setB = new Set(arr2);           // O(m) - create lookup
return arr1.filter(x => !setB.has(x)); // O(n) - filter using O(1) lookup
```

This is more efficient than using `includes()`:

```javascript
// SLOW O(n*m) - avoid!
arr1.filter(x => !arr2.includes(x))

// FAST O(n+m) - use Set
const setB = new Set(arr2);
arr1.filter(x => !setB.has(x))
```

## Difference Types

| Type | Formula | Description |
|------|---------|-------------|
| **Difference (A - B)** | `A.filter(x => !B.has(x))` | In A but not B |
| **Reverse Difference (B - A)** | `B.filter(x => !A.has(x))` | In B but not A |
| **Symmetric Difference** | `(A - B) ∪ (B - A)` | In either, not both |

## Common Use Cases

| Scenario | Why Difference |
|----------|----------------|
| **New items** | Find items in new list not in old |
| **Removed items** | Find items in old list not in new |
| **Unsubscribed users** | Users in original not in current |
| **Missing permissions** | Required perms not in user perms |
| **Incomplete tasks** | All tasks minus completed tasks |

## Gotchas

### 1. Order Matters!

Difference is NOT symmetric:

```javascript
// A - B
[1,2,3,4].filter(x => ![3,4,5,6].includes(x))  // [1, 2]

// B - A
[3,4,5,6].filter(x => ![1,2,3,4].includes(x))  // [5, 6]
```

### 2. Objects Need Key-Based Comparison

`Set.has()` uses reference equality for objects:

```javascript
// WRONG - won't work for objects
const setB = new Set([{id: 1}, {id: 2}]);
setB.has({id: 1});  // false - different reference!

// CORRECT - compare by property
const idsInB = new Set(arr2.map(x => x.id));
arr1.filter(x => !idsInB.has(x.id));
```

### 3. Duplicates in First Array

Duplicates in arr1 are preserved:

```javascript
const arr1 = [1, 1, 2, 2, 3];
const arr2 = [2, 3];
// Result: [1, 1]  - both 1s are kept
```

To dedupe result, wrap with Set:

```javascript
[...new Set(arr1.filter(x => !setB.has(x)))]
```

### 4. Access Variables via $var

```xs
// CORRECT
code = "const setB = new Set($var.arr2);"

// WRONG
code = "const setB = new Set($arr2);"
```

### 5. Empty Second Array = All First Array

```javascript
const setB = new Set([]);
[1, 2, 3].filter(x => !setB.has(x));  // [1, 2, 3]
```

## Related Functions

- [array.intersection](../array-intersection/SKILL.md) - Elements in BOTH arrays
- [array.union](../array-union/SKILL.md) - All unique elements from both
- [array.filter](../array-filter/SKILL.md) - Filter by any condition
