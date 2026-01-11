# array.shift

The `array.shift` function removes the first element from an array and optionally returns the removed element.

## Syntax

```xs
array.shift $array_var
array.shift $array_var as $removed_element
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `$array_var` | Yes | The array variable to modify |
| `as $var` | No | Optional - captures the removed element |

## Return Value

When using `as $var`, returns the removed element. Returns `null` if the array is empty.

## Test Endpoints

**API Group:** xs-array-shift (ID: 250)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:oJla7xMG`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `shift-basic` | 1989 | Basic shift with captured value |
| `shift-queue` | 1990 | Queue processing pattern |
| `shift-empty` | 1991 | Shift from empty array |
| `shift-objects` | 1992 | Shift objects from array |
| `shift-discard` | 1993 | Shift without capturing value |

## Patterns

### Pattern 1: Basic Shift

```xs
query "shift-basic" verb=POST {
  input {}

  stack {
    var $fruits {
      value = ["apple", "banana", "cherry"]
    }

    array.shift $fruits as $first

    var $result {
      value = { array: $fruits, first: $first }
    }
  }

  response = $result
}
```

**Response:**
```json
{
  "array": ["banana", "cherry"],
  "first": "apple"
}
```

### Pattern 2: Queue Processing (FIFO)

```xs
query "shift-queue" verb=POST {
  input {}

  stack {
    var $queue {
      value = ["task1", "task2", "task3", "task4"]
    }

    array.shift $queue as $next_task

    var $result {
      value = { queue: $queue, processing: $next_task }
    }
  }

  response = $result
}
```

**Response:**
```json
{
  "queue": ["task2", "task3", "task4"],
  "processing": "task1"
}
```

### Pattern 3: Shift from Empty Array

```xs
query "shift-empty" verb=POST {
  input {}

  stack {
    var $empty {
      value = []
    }

    array.shift $empty as $item

    var $result {
      value = { array: $empty, item: $item }
    }
  }

  response = $result
}
```

**Response:**
```json
{
  "array": [],
  "item": null
}
```

### Pattern 4: Shift Objects

```xs
query "shift-objects" verb=POST {
  input {}

  stack {
    var $events {
      value = [{ type: "click", ts: 1 }, { type: "scroll", ts: 2 }, { type: "submit", ts: 3 }]
    }

    array.shift $events as $first_event

    var $result {
      value = { remaining: $events, processed: $first_event }
    }
  }

  response = $result
}
```

**Response:**
```json
{
  "remaining": [{"type": "scroll", "ts": 2}, {"type": "submit", "ts": 3}],
  "processed": {"type": "click", "ts": 1}
}
```

### Pattern 5: Shift Without Capture (Discard)

```xs
query "shift-discard" verb=POST {
  input {}

  stack {
    var $nums {
      value = [10, 20, 30, 40]
    }

    array.shift $nums
  }

  response = $nums
}
```

**Response:**
```json
[20, 30, 40]
```

## Use Cases

| Use Case | Why Shift |
|----------|-----------|
| **Queue processing** | FIFO (First In First Out) |
| **Event handling** | Process oldest event first |
| **Pagination** | Remove processed items from list |
| **Batch processing** | Take first item from batch |

## Comparison: Pop vs Shift

| Feature | `array.pop` | `array.shift` |
|---------|-------------|---------------|
| Removes from | End (last) | Beginning (first) |
| Data structure | Stack (LIFO) | Queue (FIFO) |
| Use case | Undo, recent items | Process in order |
| Performance | O(1) | O(n) - shifts all elements |

## Gotchas and Limitations

### 1. Shift from Empty Returns Null

```xs
var $empty { value = [] }
array.shift $empty as $item
// $item is null, no error
```

### 2. Modifies Array In Place

```xs
var $original { value = [1, 2, 3] }
array.shift $original as $first
// $original is now [2, 3]
```

### 3. Like Pop, Shift Supports `as $var`

Both `array.pop` and `array.shift` support capturing the removed element.

## Related Functions

- [array.pop](../array-pop/SKILL.md) - Remove from end of array
- [array.unshift](../array-unshift/SKILL.md) - Add to beginning of array
- [array.push](../array-push/SKILL.md) - Add to end of array
