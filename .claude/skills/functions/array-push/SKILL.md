# array.push

The `array.push` function adds one element to the end of an array, modifying the array in place.

## Syntax

```xs
array.push $array_var {
  value = <element>
}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `$array_var` | Yes | The array variable to modify (must be a variable, not literal) |
| `value` | Yes | The value to add to the end of the array |

## Return Value

None. `array.push` modifies the array in place and does NOT support `as $var`.

## Test Endpoints

**API Group:** xs-array-push (ID: 248)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:X5bwwMYB`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `push-basic` | 1978 | Basic push to array |
| `push-multiple` | 1979 | Multiple successive pushes |
| `push-object` | 1980 | Push complex objects |
| `push-from-input` | 1982 | Push value from input |
| `push-computed` | 1983 | Push computed values |

## Patterns

### Pattern 1: Basic Push

```xs
query "push-basic" verb=POST {
  input {}

  stack {
    var $fruits {
      value = ["apple", "banana"]
    }

    array.push $fruits {
      value = "cherry"
    }
  }

  response = $fruits
}
```

**Response:**
```json
["apple", "banana", "cherry"]
```

### Pattern 2: Multiple Pushes

```xs
query "push-multiple" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3]
    }

    array.push $nums { value = 4 }
    array.push $nums { value = 5 }
    array.push $nums { value = 6 }
  }

  response = $nums
}
```

**Response:**
```json
[1, 2, 3, 4, 5, 6]
```

### Pattern 3: Push Objects

```xs
query "push-object" verb=POST {
  input {}

  stack {
    var $users {
      value = []
    }

    array.push $users {
      value = { name: "Alice", age: 30 }
    }

    array.push $users {
      value = { name: "Bob", age: 25 }
    }
  }

  response = $users
}
```

**Response:**
```json
[
  {"name": "Alice", "age": 30},
  {"name": "Bob", "age": 25}
]
```

### Pattern 4: Push from Input

```xs
query "push-from-input" verb=POST {
  input {
    text item
  }

  stack {
    var $cart {
      value = ["existing_item"]
    }

    array.push $cart {
      value = $input.item
    }
  }

  response = $cart
}
```

**Response with `{"item": "new_product"}`:**
```json
["existing_item", "new_product"]
```

### Pattern 5: Push Computed Values

```xs
query "push-computed" verb=POST {
  input {
    int base
  }

  stack {
    var $multiples {
      value = []
    }

    var $val1 { value = $input.base * 1 }
    var $val2 { value = $input.base * 2 }
    var $val3 { value = $input.base * 3 }

    array.push $multiples { value = $val1 }
    array.push $multiples { value = $val2 }
    array.push $multiples { value = $val3 }
  }

  response = $multiples
}
```

**Response with `{"base": 5}`:**
```json
[5, 10, 15]
```

## Use Cases

| Use Case | Why Push |
|----------|----------|
| **Building lists** | Accumulate items iteratively |
| **Shopping cart** | Add products dynamically |
| **Collecting results** | Gather data from loops |
| **Creating records** | Build array of objects for bulk operations |

## Gotchas and Limitations

### 1. No Return Value - Cannot Use `as $var`

```xs
// WRONG - causes "Invalid arg: as" error
array.push $items {
  value = "new"
} as $result

// CORRECT - no as clause
array.push $items {
  value = "new"
}
```

### 2. Must Be a Variable, Not Literal

```xs
// WRONG - cannot push to literal
array.push ["a", "b"] {
  value = "c"
}

// CORRECT - use a variable
var $arr { value = ["a", "b"] }
array.push $arr {
  value = "c"
}
```

### 3. Modifies In Place

The original array is modified. There's no "immutable" version:

```xs
var $original { value = [1, 2] }
array.push $original { value = 3 }
// $original is now [1, 2, 3] - not a copy!
```

### 4. Block Syntax Required

```xs
// WRONG - missing block
array.push $arr "value"

// WRONG - missing value keyword
array.push $arr { "value" }

// CORRECT - proper block with value
array.push $arr { value = "value" }
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid arg: as` | Using `as $var` | Remove `as $var` - push doesn't return |
| `Invalid arg: value` | Value outside block | Use `{ value = ... }` syntax |
| Unexpected token | Missing block `{}` | Add block around value |

## Related Functions

- [array.unshift](../array-unshift/SKILL.md) - Add to beginning of array
- [array.pop](../array-pop/SKILL.md) - Remove from end of array
- [array.shift](../array-shift/SKILL.md) - Remove from beginning of array
- [array.merge](../array-merge/SKILL.md) - Combine two arrays
