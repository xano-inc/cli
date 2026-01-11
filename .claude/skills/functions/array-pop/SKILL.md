# array.pop

The `array.pop` function removes the last element from an array and optionally returns the removed element.

## Syntax

```xs
array.pop $array_var
array.pop $array_var as $removed_element
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `$array_var` | Yes | The array variable to modify |
| `as $var` | No | Optional - captures the removed element |

## Return Value

When using `as $var`, returns the removed element. Returns `null` if the array is empty.

## Test Endpoints

**API Group:** xs-array-pop (ID: 249)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:_vLxlIHp`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `pop-basic` | 1984 | Basic pop with captured value |
| `pop-multiple` | 1985 | Multiple successive pops |
| `pop-objects` | 1986 | Pop objects from array |
| `pop-empty` | 1987 | Pop from empty array (returns null) |
| `pop-discard` | 1988 | Pop without capturing value |

## Patterns

### Pattern 1: Basic Pop

```xs
query "pop-basic" verb=POST {
  input {}

  stack {
    var $fruits {
      value = ["apple", "banana", "cherry"]
    }

    array.pop $fruits as $removed

    var $result {
      value = { array: $fruits, removed: $removed }
    }
  }

  response = $result
}
```

**Response:**
```json
{
  "array": ["apple", "banana"],
  "removed": "cherry"
}
```

### Pattern 2: Multiple Pops

```xs
query "pop-multiple" verb=POST {
  input {}

  stack {
    var $nums {
      value = [1, 2, 3, 4, 5]
    }

    array.pop $nums as $last
    array.pop $nums as $second_last

    var $result {
      value = { array: $nums, last: $last, second_last: $second_last }
    }
  }

  response = $result
}
```

**Response:**
```json
{
  "array": [1, 2, 3],
  "last": 5,
  "second_last": 4
}
```

### Pattern 3: Pop Objects

```xs
query "pop-objects" verb=POST {
  input {}

  stack {
    var $users {
      value = [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }]
    }

    array.pop $users as $removed_user

    var $result {
      value = { remaining: $users, removed: $removed_user }
    }
  }

  response = $result
}
```

**Response:**
```json
{
  "remaining": [{"name": "Alice"}, {"name": "Bob"}],
  "removed": {"name": "Charlie"}
}
```

### Pattern 4: Pop from Empty Array

```xs
query "pop-empty" verb=POST {
  input {}

  stack {
    var $empty {
      value = []
    }

    array.pop $empty as $removed

    var $result {
      value = { array: $empty, removed: $removed }
    }
  }

  response = $result
}
```

**Response:**
```json
{
  "array": [],
  "removed": null
}
```

### Pattern 5: Pop Without Capture (Discard)

```xs
query "pop-discard" verb=POST {
  input {}

  stack {
    var $items {
      value = [1, 2, 3, 4]
    }

    array.pop $items
  }

  response = $items
}
```

**Response:**
```json
[1, 2, 3]
```

## Use Cases

| Use Case | Why Pop |
|----------|---------|
| **Stack operations** | LIFO (Last In First Out) processing |
| **Undo functionality** | Remove most recent action |
| **Queue trimming** | Remove oldest processed items |
| **Processing lists** | Pop and process one at a time |

## Gotchas and Limitations

### 1. Pop from Empty Array Returns Null

```xs
var $empty { value = [] }
array.pop $empty as $item
// $item is null, no error thrown
```

### 2. Modifies Array In Place

```xs
var $original { value = [1, 2, 3] }
array.pop $original as $last
// $original is now [1, 2] - not a copy!
```

### 3. Unlike Push, Pop Supports `as $var`

```xs
// Push does NOT support as
array.push $arr { value = "x" } as $result  // ERROR!

// Pop DOES support as
array.pop $arr as $removed  // Works!
```

## Comparison: Push vs Pop

| Feature | `array.push` | `array.pop` |
|---------|--------------|-------------|
| Action | Add to end | Remove from end |
| Block syntax | `{ value = ... }` | None |
| Supports `as $var` | No | Yes |
| Return value | None | Removed element |
| Empty array behavior | N/A | Returns null |

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `unexpected 'set_var'` | Response directly uses object literal | Use intermediate `var $result {}` |

## Related Functions

- [array.push](../array-push/SKILL.md) - Add to end of array
- [array.shift](../array-shift/SKILL.md) - Remove from beginning of array
- [array.unshift](../array-unshift/SKILL.md) - Add to beginning of array
