# array.union

Combines two or more arrays and returns only unique values (no duplicates). This is the set union operation. **Use `api.lambda` with `Set` and spread operator** for reliable results.

## Recommended Syntax (api.lambda)

```xs
api.lambda {
  code = "return [...new Set([...$var.arr1, ...$var.arr2])];"
  timeout = 10
} as $union
```

## Test Endpoints

**API Group:** xs-array-union (ID: 261)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:orVhcQtB`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `union-basic` | 2044 | Union of two primitive arrays |
| `union-duplicates` | 2045 | Union removes duplicates |
| `union-objects` | 2046 | Union objects by property |
| `union-multiple` | 2047 | Union of 3+ arrays |
| `union-empty` | 2048 | Union with empty arrays |

## Patterns

### Pattern 1: Basic Union of Primitives

```xs
query "union-basic" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3, 4]
    }
    var $arr2 {
      value = [3, 4, 5, 6]
    }

    api.lambda {
      code = "return [...new Set([...$var.arr1, ...$var.arr2])];"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[1, 2, 3, 4, 5, 6]
```

### Pattern 2: Union Removes All Duplicates

```xs
query "union-duplicates" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 1, 2, 2, 3]
    }
    var $arr2 {
      value = [2, 3, 3, 4, 4]
    }

    api.lambda {
      code = "return [...new Set([...$var.arr1, ...$var.arr2])];"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[1, 2, 3, 4]
```

(Duplicates within each array AND across arrays are removed)

### Pattern 3: Union Objects by Property

```xs
query "union-objects" verb=POST {
  input {}

  stack {
    var $users1 {
      value = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
    }
    var $users2 {
      value = [{ id: 2, name: "Bob" }, { id: 3, name: "Charlie" }]
    }

    api.lambda {
      code = """
        const combined = [...$var.users1, ...$var.users2];
        const seen = new Set();
        return combined.filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
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
  {"id": 2, "name": "Bob"},
  {"id": 3, "name": "Charlie"}
]
```

### Pattern 4: Union of Multiple Arrays

```xs
query "union-multiple" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3]
    }
    var $arr2 {
      value = [3, 4, 5]
    }
    var $arr3 {
      value = [5, 6, 7]
    }

    api.lambda {
      code = "return [...new Set([...$var.arr1, ...$var.arr2, ...$var.arr3])];"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[1, 2, 3, 4, 5, 6, 7]
```

### Pattern 5: Union with Empty Arrays

```xs
query "union-empty" verb=POST {
  input {}

  stack {
    var $arr1 {
      value = [1, 2, 3]
    }
    var $empty {
      value = []
    }

    api.lambda {
      code = "return [...new Set([...$var.arr1, ...$var.empty])];"
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

## The Set Pattern for Union

```javascript
// For primitives (numbers, strings, booleans)
[...new Set([...arr1, ...arr2])]

// Step by step:
// 1. [...arr1, ...arr2]     - Combine arrays
// 2. new Set(...)           - Remove duplicates
// 3. [...]                  - Convert back to array
```

## Object Union Strategies

| Strategy | When to Use |
|----------|-------------|
| **By ID** | Objects have unique identifier |
| **By JSON string** | Need exact object match |
| **By multiple keys** | Composite unique key |

### Union by ID (Most Common)

```javascript
const combined = [...arr1, ...arr2];
const seen = new Set();
return combined.filter(item => {
  if (seen.has(item.id)) return false;
  seen.add(item.id);
  return true;
});
```

### Union by JSON (Exact Match)

```javascript
const combined = [...arr1, ...arr2];
const seen = new Set();
return combined.filter(item => {
  const key = JSON.stringify(item);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```

### Union by Multiple Keys

```javascript
const combined = [...arr1, ...arr2];
const seen = new Set();
return combined.filter(item => {
  const key = `${item.firstName}-${item.lastName}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```

## Common Union Patterns

| Use Case | Pattern |
|----------|---------|
| **Merge tag lists** | `[...new Set([...tags1, ...tags2])]` |
| **Combine user IDs** | `[...new Set([...ids1, ...ids2])]` |
| **Merge search results** | Union by ID to avoid duplicates |
| **Combine permissions** | `[...new Set([...role1Perms, ...role2Perms])]` |

## Use Cases

| Scenario | Why Union |
|----------|-----------|
| **Search results** | Combine results from multiple sources |
| **Permission merging** | Combine permissions from multiple roles |
| **Tag aggregation** | Merge tags from multiple entities |
| **Data deduplication** | Combine lists while removing duplicates |
| **Category merging** | Combine category lists |

## Gotchas

### 1. Objects Are Not Equal by Value

`Set` uses reference equality for objects:

```javascript
new Set([{a:1}, {a:1}]).size  // 2 - different references!
```

For objects, use the filter pattern with a key.

### 2. Order Is Preserved

Union maintains order: first occurrence wins:

```javascript
[...new Set([3, 1, 2, 1, 3])]  // [3, 1, 2]
```

### 3. NaN Handling

`Set` treats all `NaN` values as equal:

```javascript
[...new Set([NaN, NaN])]  // [NaN]
```

### 4. Type Coercion Does Not Happen

`Set` distinguishes between types:

```javascript
[...new Set([1, '1'])]  // [1, '1'] - both kept
```

### 5. Access Variables via $var

```xs
// CORRECT
code = "return [...new Set([...$var.arr1, ...$var.arr2])];"

// WRONG
code = "return [...new Set([...$arr1, ...$arr2])];"
```

## Related Functions

- [array.intersection](../array-intersection/SKILL.md) - Elements in BOTH arrays
- [array.difference](../array-difference/SKILL.md) - Elements in first but not second
- [array.merge](../array-merge/SKILL.md) - Combine without deduplication
