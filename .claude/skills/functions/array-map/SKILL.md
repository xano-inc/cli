# array.map

Transforms each element in an array and returns a new array with the results.

## Native XanoScript Syntax (Recommended)

```xs
array.map ($arrayVariable) {
  by = $this * 2
} as $mapped
```

**Parameters:**
| Parameter | Purpose | Example |
|-----------|---------|---------|
| `$arrayVariable` | The array to transform (in parentheses) | `($nums)` |
| `by` | The transformation expression using `$this` | `by = $this * 2` |
| `as $result` | Variable to store mapped array (AFTER closing brace) | `as $mapped` |

**Context Variables:**
- `$this` - The current element being transformed
- `$index` - The numerical index of current element
- `$parent` - The entire array

### Native Syntax Examples

```xs
// Double each number
array.map ($nums) {
  by = $this * 2
} as $doubled

// Extract property from objects
array.map ($users) {
  by = $this.name
} as $names

// Transform to new object structure
array.map ($items) {
  by = { id: $this.id, label: $this.name }
} as $transformed
```

**IMPORTANT:** The `as $variable` comes AFTER the closing brace `}`, not before it!

---

## Fallback: api.lambda Syntax

For complex transformations, use JavaScript's `map()` method:

```xs
api.lambda {
  code = "return $var.array_name.map(x => transformation);"
  timeout = 10
} as $mapped
```

## Test Endpoints

**API Group:** xs-array-map (ID: 254)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:Hbd_rOPh`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `map-basic` | 2009 | Double each number |
| `map-extract-property` | 2010 | Extract property from objects |
| `map-transform-objects` | 2011 | Transform objects (add fields) |
| `map-to-string` | 2012 | Convert to different type |
| `map-with-index` | 2013 | Use index in transformation |

## Patterns

### Pattern 1: Transform Values

```xs
query "map-basic" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3, 4, 5]
    }

    api.lambda {
      code = "return $var.nums.map(x => x * 2);"
      timeout = 10
    } as $doubled
  }

  response = $doubled
}
```

**Response:**
```json
[2, 4, 6, 8, 10]
```

### Pattern 2: Extract Property

```xs
query "map-extract-property" verb=POST {
  input {}

  stack {
    var $users {
      value = [{ name: "Alice", email: "alice@test.com" }, { name: "Bob", email: "bob@test.com" }]
    }

    api.lambda {
      code = "return $var.users.map(u => u.email);"
      timeout = 10
    } as $emails
  }

  response = $emails
}
```

**Response:**
```json
["alice@test.com", "bob@test.com"]
```

### Pattern 3: Transform Objects (Add Fields)

```xs
query "map-transform-objects" verb=POST {
  input {}

  stack {
    var $products {
      value = [{ name: "Apple", price: 1.5 }, { name: "Banana", price: 0.5 }]
    }

    api.lambda {
      code = "return $var.products.map(p => ({ ...p, priceWithTax: p.price * 1.1 }));"
      timeout = 10
    } as $with_tax
  }

  response = $with_tax
}
```

**Response:**
```json
[
  {"name": "Apple", "price": 1.5, "priceWithTax": 1.65},
  {"name": "Banana", "price": 0.5, "priceWithTax": 0.55}
]
```

### Pattern 4: Convert to Different Type

```xs
query "map-to-string" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3]
    }

    api.lambda {
      code = "return $var.nums.map(n => 'Item ' + n);"
      timeout = 10
    } as $labels
  }

  response = $labels
}
```

**Response:**
```json
["Item 1", "Item 2", "Item 3"]
```

### Pattern 5: Use Index in Transformation

```xs
query "map-with-index" verb=POST {
  input {}

  stack {
    var $items {
      value = ["apple", "banana", "cherry"]
    }

    api.lambda {
      code = "return $var.items.map((item, i) => ({ index: i, value: item }));"
      timeout = 10
    } as $indexed
  }

  response = $indexed
}
```

**Response:**
```json
[
  {"index": 0, "value": "apple"},
  {"index": 1, "value": "banana"},
  {"index": 2, "value": "cherry"}
]
```

## Common Map Patterns

| Use Case | JavaScript Pattern |
|----------|-------------------|
| **Double values** | `.map(x => x * 2)` |
| **Extract property** | `.map(o => o.name)` |
| **Format strings** | `.map(x => \`Item ${x}\`)` |
| **Add field** | `.map(o => ({ ...o, newField: value }))` |
| **Rename field** | `.map(({oldName, ...rest}) => ({newName: oldName, ...rest}))` |
| **With index** | `.map((item, i) => ...)` |
| **Nested property** | `.map(o => o.nested?.value)` |

## Comparison: map vs filter vs find

| Method | Returns | Purpose |
|--------|---------|---------|
| `map()` | Array (same length) | Transform each element |
| `filter()` | Array (subset) | Keep matching elements |
| `find()` | Single element | Find first match |

## Chaining Operations

You can chain map, filter, and other array methods:

```javascript
// Filter then map
return $var.users
  .filter(u => u.active)
  .map(u => u.email);

// Map then filter
return $var.nums
  .map(x => x * 2)
  .filter(x => x > 5);
```

## Gotchas

### 1. Map Always Returns Same Length Array

```javascript
[1, 2, 3].map(x => x * 2)  // [2, 4, 6] - always 3 elements
```

To reduce elements, use `filter()` instead of or with `map()`.

### 2. Spread Operator for Object Transformation

```javascript
// Keep all existing fields, add new one
.map(o => ({ ...o, newField: 'value' }))

// Not this (loses other fields):
.map(o => ({ name: o.name, newField: 'value' }))
```

### 3. Access Variables via $var

```xs
// CORRECT
code = "return $var.users.map(...);"

// WRONG
code = "return $users.map(...);"
```

## Related Functions

- [array.filter](../array-filter/SKILL.md) - Filter to subset
- [array.find](../array-find/SKILL.md) - Find single element
- [array.merge](../array-merge/SKILL.md) - Combine arrays
