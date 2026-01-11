# array.unshift

The `array.unshift` function adds one element to the beginning of an array, modifying the array in place.

## Syntax

```xs
array.unshift $array_var {
  value = <element>
}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `$array_var` | Yes | The array variable to modify |
| `value` | Yes | The value to add to the beginning of the array |

## Return Value

None. `array.unshift` modifies the array in place and does NOT support `as $var`.

## Test Endpoints

**API Group:** xs-array-unshift (ID: 251)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:2XUCOIgz`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `unshift-basic` | 1994 | Basic unshift to array |
| `unshift-multiple` | 1995 | Multiple successive unshifts |
| `unshift-object` | 1996 | Unshift complex objects |
| `unshift-from-input` | 1997 | Unshift value from input |
| `unshift-to-empty` | 1998 | Unshift to empty array |

## Patterns

### Pattern 1: Basic Unshift

```xs
query "unshift-basic" verb=POST {
  input {}

  stack {
    var $fruits {
      value = ["banana", "cherry"]
    }

    array.unshift $fruits {
      value = "apple"
    }
  }

  response = $fruits
}
```

**Response:**
```json
["apple", "banana", "cherry"]
```

### Pattern 2: Multiple Unshifts

Note: Each unshift adds to beginning, so last unshift ends up first.

```xs
query "unshift-multiple" verb=POST {
  input {}

  stack {
    var $nums {
      value = [4, 5, 6]
    }

    array.unshift $nums { value = 3 }
    array.unshift $nums { value = 2 }
    array.unshift $nums { value = 1 }
  }

  response = $nums
}
```

**Response:**
```json
[1, 2, 3, 4, 5, 6]
```

### Pattern 3: Unshift Objects

```xs
query "unshift-object" verb=POST {
  input {}

  stack {
    var $logs {
      value = [{ msg: "old log", ts: 1 }]
    }

    array.unshift $logs {
      value = { msg: "new log", ts: 2 }
    }
  }

  response = $logs
}
```

**Response:**
```json
[
  {"msg": "new log", "ts": 2},
  {"msg": "old log", "ts": 1}
]
```

### Pattern 4: Unshift from Input

```xs
query "unshift-from-input" verb=POST {
  input {
    text item
  }

  stack {
    var $list {
      value = ["existing"]
    }

    array.unshift $list {
      value = $input.item
    }
  }

  response = $list
}
```

**Response with `{"item": "priority"}`:**
```json
["priority", "existing"]
```

### Pattern 5: Unshift to Empty Array

```xs
query "unshift-to-empty" verb=POST {
  input {}

  stack {
    var $arr {
      value = []
    }

    array.unshift $arr { value = "first" }
    array.unshift $arr { value = "second" }
  }

  response = $arr
}
```

**Response:**
```json
["second", "first"]
```

## Use Cases

| Use Case | Why Unshift |
|----------|-------------|
| **Priority items** | Add urgent items to front of list |
| **Recent first** | New logs/events at top |
| **Undo stack** | Add to front, shift from front |
| **Breadcrumbs** | Add new location to beginning |

## Comparison: Push vs Unshift

| Feature | `array.push` | `array.unshift` |
|---------|--------------|-----------------|
| Adds to | End (last) | Beginning (first) |
| Syntax | Same block `{ value = }` | Same block `{ value = }` |
| Supports `as $var` | No | No |
| Performance | O(1) | O(n) - shifts all elements |

## Gotchas and Limitations

### 1. No Return Value - Cannot Use `as $var`

Like `array.push`, `array.unshift` does not support capturing a return value.

```xs
// WRONG - causes error
array.unshift $items { value = "x" } as $result

// CORRECT
array.unshift $items { value = "x" }
```

### 2. Order of Multiple Unshifts

When unshifting multiple items, the last unshift ends up first:

```xs
var $arr { value = [] }
array.unshift $arr { value = "a" }  // ["a"]
array.unshift $arr { value = "b" }  // ["b", "a"]
array.unshift $arr { value = "c" }  // ["c", "b", "a"]
```

### 3. Block Syntax Required

```xs
// WRONG - missing block
array.unshift $arr "value"

// CORRECT
array.unshift $arr { value = "value" }
```

## Related Functions

- [array.push](../array-push/SKILL.md) - Add to end of array
- [array.shift](../array-shift/SKILL.md) - Remove from beginning of array
- [array.pop](../array-pop/SKILL.md) - Remove from end of array
