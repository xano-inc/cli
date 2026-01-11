# array.partition

Splits an array into two groups based on a condition: elements that pass the test and elements that fail.

## Native XanoScript Syntax (Recommended)

```xs
array.partition ($arrayVariable) if ($this > 5) as $partitioned
```

**Parameters:**
| Parameter | Purpose | Example |
|-----------|---------|---------|
| `$arrayVariable` | The array to partition (in parentheses) | `($nums)` |
| `if (condition)` | Condition using `$this` for current element | `if ($this > 5)` |
| `as $result` | Variable to store result object | `as $partitioned` |

**Returns:** An object with `"true"` and `"false"` keys:
```json
{
  "true": [6, 7, 8, 9, 10],
  "false": [1, 2, 3, 4, 5]
}
```

**Context Variables:**
- `$this` - The current element being evaluated
- `$index` - The numerical index of current element
- `$parent` - The entire array

### Native Syntax Examples

```xs
// Partition numbers above/below threshold
array.partition ($nums) if ($this > 5) as $partitioned

// Partition objects by property
array.partition ($users) if ($this.active == true) as $byActive

// Partition with complex condition
array.partition ($items) if ($this.price > 100 && $this.inStock == true) as $split
```

---

## Fallback: api.lambda Syntax

For custom key names or complex logic:

```xs
api.lambda {
  code = """
    const pass = $var.array_name.filter(x => condition);
    const fail = $var.array_name.filter(x => !condition);
    return { pass, fail };
  """
  timeout = 10
} as $partitioned
```

## Test Endpoints

**API Group:** xs-array-partition (ID: 259)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:2_4Dt1Se`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `partition-basic` | 2034 | Partition numbers into even/odd |
| `partition-objects` | 2035 | Partition objects by property |
| `partition-with-input` | 2036 | Partition using input threshold |
| `partition-empty` | 2037 | Handle empty partition results |
| `partition-all-pass` | 2038 | All elements pass condition |

## Patterns

### Pattern 1: Partition Numbers (Even/Odd)

```xs
query "partition-basic" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    }

    api.lambda {
      code = """
        const even = $var.nums.filter(x => x % 2 === 0);
        const odd = $var.nums.filter(x => x % 2 !== 0);
        return { even, odd };
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
{
  "even": [2, 4, 6, 8, 10],
  "odd": [1, 3, 5, 7, 9]
}
```

### Pattern 2: Partition Objects by Property

```xs
query "partition-objects" verb=POST {
  input {}

  stack {
    var $users {
      value = [
        { name: "Alice", active: true },
        { name: "Bob", active: false },
        { name: "Charlie", active: true },
        { name: "Diana", active: false }
      ]
    }

    api.lambda {
      code = """
        const active = $var.users.filter(u => u.active);
        const inactive = $var.users.filter(u => !u.active);
        return { active, inactive };
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
{
  "active": [
    {"name": "Alice", "active": true},
    {"name": "Charlie", "active": true}
  ],
  "inactive": [
    {"name": "Bob", "active": false},
    {"name": "Diana", "active": false}
  ]
}
```

### Pattern 3: Partition with Input Threshold

```xs
query "partition-with-input" verb=POST {
  input {
    int threshold
  }

  stack {
    var $scores {
      value = [45, 72, 88, 56, 91, 38, 67, 79]
    }

    api.lambda {
      code = """
        const pass = $var.scores.filter(s => s >= $input.threshold);
        const fail = $var.scores.filter(s => s < $input.threshold);
        return { pass, fail };
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response with `{"threshold": 70}`:**
```json
{
  "pass": [72, 88, 91, 79],
  "fail": [45, 56, 38, 67]
}
```

### Pattern 4: Empty Partition Results

```xs
query "partition-empty" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3, 4, 5]
    }

    api.lambda {
      code = """
        const above100 = $var.nums.filter(x => x > 100);
        const notAbove100 = $var.nums.filter(x => x <= 100);
        return { above100, notAbove100 };
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
{
  "above100": [],
  "notAbove100": [1, 2, 3, 4, 5]
}
```

### Pattern 5: All Elements Pass (Using reduce)

```xs
query "partition-all-pass" verb=POST {
  input {}

  stack {
    var $nums {
      value = [2, 4, 6, 8, 10]
    }

    api.lambda {
      code = """
        return $var.nums.reduce((acc, x) => {
          acc[x % 2 === 0 ? 0 : 1].push(x);
          return acc;
        }, [[], []]);
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
[[2, 4, 6, 8, 10], []]
```

(All elements are even, so pass array has all, fail array is empty)

## Implementation Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **Dual filter()** | Readable, clear intent | Iterates array twice |
| **reduce()** | Single pass, efficient | Less readable |
| **forEach + push** | Explicit control | Verbose |

### Efficient Single-Pass with reduce()

```javascript
const [pass, fail] = arr.reduce(
  (acc, item) => {
    acc[condition(item) ? 0 : 1].push(item);
    return acc;
  },
  [[], []]
);
```

## Common Partition Patterns

| Use Case | Condition |
|----------|-----------|
| **Pass/Fail scores** | `score >= passingGrade` |
| **Adult/Minor** | `age >= 18` |
| **Active/Inactive** | `item.active` |
| **Valid/Invalid** | `item.isValid` |
| **Positive/Negative** | `num > 0` |
| **In stock/Out of stock** | `product.stock > 0` |

## Use Cases

| Scenario | Why Partition |
|----------|---------------|
| **Grade reports** | Separate passing from failing students |
| **User management** | Split active vs inactive users |
| **Inventory** | Separate in-stock vs out-of-stock |
| **Validation** | Identify valid vs invalid entries |
| **Feature flags** | Split enabled vs disabled features |
| **Batch processing** | Handle success vs failure separately |

## Gotchas

### 1. No Native partition() Method

JavaScript doesn't have a built-in partition. You must implement it:

```javascript
// Using filter (readable but 2 passes)
const pass = arr.filter(fn);
const fail = arr.filter(x => !fn(x));

// Using reduce (1 pass but less readable)
const [pass, fail] = arr.reduce(...)
```

### 2. Return Format: Object vs Array

Choose based on your needs:

```javascript
// Object format - named keys (more readable)
return { pass, fail };
// Access: result.pass, result.fail

// Array format - positional (compatible with destructuring)
return [pass, fail];
// Access: result[0], result[1]
```

### 3. Condition Negation

Make sure to properly negate the condition for the fail group:

```javascript
// CORRECT
const pass = arr.filter(x => x > 10);
const fail = arr.filter(x => !(x > 10));  // or x <= 10

// WRONG - doesn't cover edge cases
const fail = arr.filter(x => x < 10);  // misses x === 10!
```

### 4. Empty Arrays are Valid Results

Both pass and fail can be empty arrays:

```javascript
// All pass: { pass: [1,2,3], fail: [] }
// All fail: { pass: [], fail: [1,2,3] }
// Empty input: { pass: [], fail: [] }
```

### 5. Access Variables via $var

```xs
// CORRECT
code = "return $var.items.filter(...);"

// WRONG
code = "return $items.filter(...);"
```

## Related Functions

- [array.filter](../array-filter/SKILL.md) - Get only matching elements
- [array.group_by](../array-group-by/SKILL.md) - Group by multiple categories
- [array.every](../array-every/SKILL.md) - Check if all match
- [array.has](../array-has/SKILL.md) - Check if any match
