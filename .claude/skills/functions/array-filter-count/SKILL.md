# array.filter_count

Counts the number of elements in an array that match a condition. Returns an integer count. **Use `api.lambda` with `filter().length` or `reduce()`** for reliable results.

## Recommended Syntax (api.lambda)

```xs
api.lambda {
  code = "return $var.array_name.filter(x => condition).length;"
  timeout = 10
} as $count
```

Or more efficiently with `reduce()`:

```xs
api.lambda {
  code = "return $var.array_name.reduce((count, x) => condition ? count + 1 : count, 0);"
  timeout = 10
} as $count
```

## Test Endpoints

**API Group:** xs-array-filter-count (ID: 264)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:JF6PwngE`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `count-basic` | 2059 | Count numbers matching condition |
| `count-objects` | 2060 | Count objects by property |
| `count-with-input` | 2061 | Count using input threshold |
| `count-zero` | 2062 | Returns 0 when no matches |
| `count-multiple` | 2063 | Count with multiple conditions |

## Patterns

### Pattern 1: Count Numbers Matching Condition

```xs
query "count-basic" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 5, 10, 15, 20, 25, 30]
    }

    api.lambda {
      code = "return $var.nums.filter(x => x >= 15).length;"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
4
```

(15, 20, 25, 30 are >= 15)

### Pattern 2: Count Objects by Property

```xs
query "count-objects" verb=POST {
  input {}

  stack {
    var $users {
      value = [
        { name: "Alice", active: true },
        { name: "Bob", active: false },
        { name: "Charlie", active: true },
        { name: "Diana", active: true },
        { name: "Eve", active: false }
      ]
    }

    api.lambda {
      code = "return $var.users.filter(u => u.active).length;"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
3
```

(Alice, Charlie, Diana are active)

### Pattern 3: Count with Input Threshold

```xs
query "count-with-input" verb=POST {
  input {
    int min_score
  }

  stack {
    var $scores {
      value = [45, 72, 88, 56, 91, 38, 67, 79]
    }

    api.lambda {
      code = "return $var.scores.filter(s => s >= $input.min_score).length;"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response with `{"min_score": 70}`:**
```json
4
```

(72, 88, 91, 79 are >= 70)

### Pattern 4: Count Returns Zero

```xs
query "count-zero" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3, 4, 5]
    }

    api.lambda {
      code = "return $var.nums.filter(x => x > 100).length;"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
0
```

(No elements > 100)

### Pattern 5: Count with Multiple Conditions

```xs
query "count-multiple" verb=POST {
  input {}

  stack {
    var $products {
      value = [
        { name: "Widget", price: 25, inStock: true },
        { name: "Gadget", price: 150, inStock: true },
        { name: "Tool", price: 50, inStock: false },
        { name: "Device", price: 75, inStock: true },
        { name: "Item", price: 30, inStock: true }
      ]
    }

    api.lambda {
      code = "return $var.products.filter(p => p.price < 100 && p.inStock).length;"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
3
```

(Widget, Device, Item are both under $100 and in stock)

## Implementation Approaches

| Approach | Code | Efficiency |
|----------|------|------------|
| **filter().length** | `arr.filter(fn).length` | O(n) - creates temp array |
| **reduce()** | `arr.reduce((c,x) => fn(x) ? c+1 : c, 0)` | O(n) - no temp array |

For large arrays, `reduce()` is more memory efficient:

```javascript
// filter creates intermediate array
arr.filter(x => x > 10).length

// reduce counts directly
arr.reduce((count, x) => x > 10 ? count + 1 : count, 0)
```

## Common Count Patterns

| Use Case | Pattern |
|----------|---------|
| **Count above threshold** | `.filter(x => x > threshold).length` |
| **Count active items** | `.filter(x => x.active).length` |
| **Count by status** | `.filter(x => x.status === 'pending').length` |
| **Count truthy** | `.filter(Boolean).length` |
| **Count non-empty** | `.filter(x => x && x.length > 0).length` |
| **Count in range** | `.filter(x => x >= min && x <= max).length` |

## Use Cases

| Scenario | Why Count |
|----------|-----------|
| **Dashboard stats** | "5 pending orders" |
| **Pagination** | Total matching records |
| **Validation** | "3 errors found" |
| **Progress tracking** | "7 of 10 tasks complete" |
| **Threshold alerts** | "4 items low stock" |
| **Reporting** | Count by category |

## Count Multiple Categories

For counting multiple categories at once:

```javascript
const counts = arr.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] || 0) + 1;
  return acc;
}, {});
// { pending: 3, shipped: 5, delivered: 2 }
```

## Gotchas

### 1. filter().length vs reduce()

Both work, but `reduce()` is more efficient for large arrays:

```javascript
// Creates temporary array (less efficient)
arr.filter(x => x > 10).length

// Direct count (more efficient)
arr.reduce((c, x) => x > 10 ? c + 1 : c, 0)
```

### 2. Empty Array Returns 0

```javascript
[].filter(x => true).length  // 0
```

### 3. Count is Always Non-Negative

```javascript
// Minimum is 0, never negative
arr.filter(impossible_condition).length  // 0
```

### 4. Truthy vs Explicit Check

```javascript
// Count truthy values (includes 0, false, '', null, undefined as falsy)
arr.filter(Boolean).length

// Count specific value
arr.filter(x => x === true).length  // Only boolean true
```

### 5. Access Variables via $var

```xs
// CORRECT
code = "return $var.items.filter(...).length;"

// WRONG
code = "return $items.filter(...).length;"
```

### 6. Count vs Length

- `.length` - Total elements in array
- `filter().length` - Elements matching condition

```javascript
const arr = [1, 2, 3, 4, 5];
arr.length;                           // 5 (total)
arr.filter(x => x > 3).length;        // 2 (matching)
```

## Related Functions

- [array.filter](../array-filter/SKILL.md) - Get the matching elements (not just count)
- [array.every](../array-every/SKILL.md) - Check if ALL match (boolean)
- [array.has](../array-has/SKILL.md) - Check if ANY match (boolean)
- [array.group_by](../array-group-by/SKILL.md) - Group and count by category
