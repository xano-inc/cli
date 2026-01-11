# array.every

Checks if ALL elements in an array match a condition. Returns `true` only if every element passes the test, `false` if any element fails. **Use `api.lambda` with JavaScript's `every()` method** for reliable results.

## Recommended Syntax (api.lambda)

```xs
api.lambda {
  code = "return $var.array_name.every(x => condition);"
  timeout = 10
} as $all_match
```

## Test Endpoints

**API Group:** xs-array-every (ID: 257)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:J-0KouKq`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `every-basic` | 2024 | Check if all numbers are even |
| `every-objects` | 2025 | Check if all objects match property |
| `every-fails` | 2026 | Returns false when one fails |
| `every-with-input` | 2027 | Check with input parameter |
| `every-empty` | 2028 | Check on empty array (returns true!) |

## Patterns

### Pattern 1: All Match Value Condition

```xs
query "every-basic" verb=POST {
  input {}

  stack {
    var $nums {
      value = [2, 4, 6, 8, 10]
    }

    api.lambda {
      code = "return $var.nums.every(x => x % 2 === 0);"
      timeout = 10
    } as $all_even
  }

  response = $all_even
}
```

**Response:**
```json
true
```

### Pattern 2: All Objects Match Property

```xs
query "every-objects" verb=POST {
  input {}

  stack {
    var $users {
      value = [{ name: "Alice", verified: true }, { name: "Bob", verified: true }, { name: "Charlie", verified: true }]
    }

    api.lambda {
      code = "return $var.users.every(u => u.verified === true);"
      timeout = 10
    } as $all_verified
  }

  response = $all_verified
}
```

**Response:**
```json
true
```

### Pattern 3: One Fails = false

```xs
query "every-fails" verb=POST {
  input {}

  stack {
    var $nums {
      value = [2, 4, 5, 8, 10]
    }

    api.lambda {
      code = "return $var.nums.every(x => x % 2 === 0);"
      timeout = 10
    } as $all_even
  }

  response = $all_even
}
```

**Response:**
```json
false
```

(5 is odd, so not all are even)

### Pattern 4: Check with Input Parameter

```xs
query "every-with-input" verb=POST {
  input {
    int min_age
  }

  stack {
    var $users {
      value = [{ name: "Alice", age: 25 }, { name: "Bob", age: 30 }, { name: "Charlie", age: 22 }]
    }

    api.lambda {
      code = "return $var.users.every(u => u.age >= $input.min_age);"
      timeout = 10
    } as $all_above_min
  }

  response = $all_above_min
}
```

**Response with `{"min_age": 21}`:**
```json
true
```

**Response with `{"min_age": 25}`:**
```json
false
```

(Charlie is 22, below 25)

### Pattern 5: Empty Array (Returns true!)

```xs
query "every-empty" verb=POST {
  input {}

  stack {
    var $empty {
      value = []
    }

    api.lambda {
      code = "return $var.empty.every(x => x > 0);"
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
true
```

**Important:** Empty arrays return `true` for `every()` - this is called "vacuous truth" in logic.

## Common "Every" Patterns

| Use Case | JavaScript Pattern |
|----------|-------------------|
| **All positive** | `.every(x => x > 0)` |
| **All active** | `.every(o => o.active)` |
| **All valid** | `.every(o => o.isValid)` |
| **All above threshold** | `.every(x => x >= min)` |
| **All non-empty** | `.every(s => s && s.length > 0)` |
| **All have property** | `.every(o => o.requiredField !== undefined)` |
| **All match type** | `.every(x => typeof x === 'number')` |

## Comparison: every vs some

| Method | Returns true when... | Empty array |
|--------|---------------------|-------------|
| `every()` | **ALL** elements match | `true` |
| `some()` | **ANY** element matches | `false` |

```javascript
// every - ALL must pass
[2, 4, 6].every(x => x % 2 === 0)  // true
[2, 4, 5].every(x => x % 2 === 0)  // false (5 fails)

// some - ANY can pass
[1, 3, 6].some(x => x % 2 === 0)   // true (6 passes)
[1, 3, 5].some(x => x % 2 === 0)   // false (none pass)
```

## Use Cases

| Scenario | Use `every()` When... |
|----------|----------------------|
| **Form validation** | All fields must be valid before submit |
| **Permissions** | User must have ALL required roles |
| **Data quality** | All records must pass validation |
| **Batch processing** | All items must succeed for batch to succeed |
| **Prerequisites** | All conditions must be met |

## Gotchas

### 1. Empty Array Returns true!

```javascript
[].every(x => false)  // true - no elements to fail!
```

This is "vacuous truth" - if there are no elements, there are no failures. Add a length check if needed:

```javascript
arr.length > 0 && arr.every(condition)
```

### 2. Short-Circuit Evaluation

`every()` stops checking as soon as one element fails:

```javascript
[1, 2, "bad", 4, 5].every(x => {
  console.log(x);  // Only logs 1, 2, "bad"
  return typeof x === 'number';
});
```

### 3. Returns Boolean, Not Elements

```javascript
[1, 2, 3].every(x => x > 0)  // Returns true, not [1, 2, 3]
```

To get the passing elements, use `filter()` instead.

### 4. Access Variables via $var

```xs
// CORRECT
code = "return $var.items.every(...);"

// WRONG
code = "return $items.every(...);"
```

## Related Functions

- [array.has](../array-has/SKILL.md) - Check if ANY element matches (same as `some()`)
- [array.filter](../array-filter/SKILL.md) - Get all matching elements
- [array.find](../array-find/SKILL.md) - Find first matching element
