# for

The `for` loop executes a block of code a specified number of times. It provides a counter variable that tracks the current iteration.

## Syntax

```xs
for (count) {
  description = "Optional description"
  each as $index {
    // code to execute
    // $index goes from 0 to count-1
  }
}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `count` | Yes | Number of iterations (expression or literal) |
| `description` | No | Optional description for documentation |
| `each as $var` | Yes | Iterator variable name |

## Test Endpoints

**API Group:** xs-for (ID: 231)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:dxgwtkXW`

### 1. Basic For Loop

**Endpoint:** `GET /for/basic` (ID: 1897)

```xs
query "for/basic" verb=GET {
  description = "Basic for loop counting iterations"

  input {
    int count?=5 {
      description = "Number of iterations"
    }
  }

  stack {
    var $iterations { value = [] }

    for ($input.count) {
      each as $i {
        array.push $iterations {
          value = { index: $i, value: `$i + 1` }
        }
      }
    }
  }

  response = {
    count: $input.count,
    iterations: $iterations
  }
}
```

**Expected Response** (`?count=3`):
```json
{
  "count": 3,
  "iterations": [
    {"index": 0, "value": 1},
    {"index": 1, "value": 2},
    {"index": 2, "value": 3}
  ]
}
```

### 2. Sum 1 to N

**Endpoint:** `GET /for/sum` (ID: 1898)

```xs
query "for/sum" verb=GET {
  description = "For loop summing 1 to n"

  input {
    int n {
      description = "Sum numbers from 1 to n"
    }
  }

  stack {
    var $sum { value = 0 }

    for ($input.n) {
      each as $i {
        math.add $sum { value = `$i + 1` }
      }
    }
  }

  response = {
    n: $input.n,
    sum: $sum,
    formula: "1 + 2 + ... + " ~ $input.n
  }
}
```

**Test Cases:**
- `?n=5` → `{"n": 5, "sum": 15, "formula": "1 + 2 + ... + 5"}`
- `?n=10` → `{"n": 10, "sum": 55, "formula": "1 + 2 + ... + 10"}`

### 3. Building an Array

**Endpoint:** `GET /for/build-array` (ID: 1899)

```xs
query "for/build-array" verb=GET {
  description = "For loop building an array"

  input {
    int size {
      description = "Size of array to build"
    }
  }

  stack {
    var $items { value = [] }

    for ($input.size) {
      each as $i {
        array.push $items {
          value = {
            id: `$i + 1`,
            name: "Item " ~ `$i + 1`,
            position: $i
          }
        }
      }
    }
  }

  response = {
    size: $input.size,
    items: $items
  }
}
```

### 4. Nested For Loops

**Endpoint:** `GET /for/nested` (ID: 1900)

```xs
query "for/nested" verb=GET {
  description = "Nested for loops creating a grid"

  input {
    int rows {
      description = "Number of rows"
    }
    int cols {
      description = "Number of columns"
    }
  }

  stack {
    var $grid { value = [] }

    for ($input.rows) {
      each as $row {
        var $row_data { value = [] }

        for ($input.cols) {
          each as $col {
            array.push $row_data {
              value = { row: $row, col: $col, cell: "R" ~ $row ~ "C" ~ $col }
            }
          }
        }

        array.push $grid { value = $row_data }
      }
    }
  }

  response = {
    dimensions: { rows: $input.rows, cols: $input.cols },
    grid: $grid
  }
}
```

**Expected Response** (`?rows=2&cols=3`):
```json
{
  "dimensions": {"rows": 2, "cols": 3},
  "grid": [
    [{"row": 0, "col": 0, "cell": "R0C0"}, {"row": 0, "col": 1, "cell": "R0C1"}, {"row": 0, "col": 2, "cell": "R0C2"}],
    [{"row": 1, "col": 0, "cell": "R1C0"}, {"row": 1, "col": 1, "cell": "R1C1"}, {"row": 1, "col": 2, "cell": "R1C2"}]
  ]
}
```

### 5. For Loop with Conditional

**Endpoint:** `GET /for/with-conditional` (ID: 1901)

```xs
query "for/with-conditional" verb=GET {
  description = "For loop with conditional filtering"

  input {
    int limit {
      description = "Check numbers from 1 to limit"
    }
  }

  stack {
    var $evens { value = [] }
    var $odds { value = [] }

    for ($input.limit) {
      each as $i {
        var $num { value = `$i + 1` }

        conditional {
          if (`$num % 2 == 0`) {
            array.push $evens { value = $num }
          }
          else {
            array.push $odds { value = $num }
          }
        }
      }
    }
  }

  response = {
    limit: $input.limit,
    evens: $evens,
    odds: $odds
  }
}
```

**Expected Response** (`?limit=6`):
```json
{
  "limit": 6,
  "evens": [2, 4, 6],
  "odds": [1, 3, 5]
}
```

## Key Patterns

### Pattern 1: Zero-Based Index

```xs
// Index starts at 0
for (3) {
  each as $i {
    // $i = 0, 1, 2 (not 1, 2, 3)
  }
}
```

### Pattern 2: 1-Based Values

```xs
// To get 1-based values, add 1 to index
for (5) {
  each as $i {
    var $num { value = `$i + 1` }
    // $num = 1, 2, 3, 4, 5
  }
}
```

### Pattern 3: Dynamic Count

```xs
// Loop count can be a variable or expression
var $count { value = ($items|count) }

for ($count) {
  each as $i {
    // iterate based on array length
  }
}
```

### Pattern 4: Accumulator Pattern

```xs
var $total { value = 0 }

for (10) {
  each as $i {
    math.add $total { value = `$i + 1` }
  }
}
// $total = 55 (sum of 1 through 10)
```

### Pattern 5: Building Objects

```xs
var $result { value = {} }

for (3) {
  each as $i {
    var.update $result {
      value = $result|set:("key_" ~ $i):("value_" ~ $i)
    }
  }
}
// $result = {"key_0": "value_0", "key_1": "value_1", "key_2": "value_2"}
```

## for vs foreach

| Use `for` when... | Use `foreach` when... |
|-------------------|----------------------|
| You need a specific number of iterations | You're iterating over an array |
| You need the index for calculations | You need each array element |
| Building a sequence | Processing existing data |

```xs
// for: generate sequence
for (5) {
  each as $i { ... }
}

// foreach: process array
foreach $users as $user {
  ...
}
```

## Gotchas and Edge Cases

1. **Zero iterations**: `for (0)` doesn't execute the loop body at all.

2. **Negative count**: Using a negative number may cause unexpected behavior. Validate input.

3. **Index vs Value**: The index is 0-based. For 1-based values, always add 1.

4. **Variable scope**: Variables declared inside the loop are accessible outside (XanoScript doesn't have block scope).

5. **Modifying count**: The loop count is evaluated once at the start. Changing it mid-loop doesn't affect iterations.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `expected 'each'` | Missing `each as $var` | Add `each as $i { }` inside for |
| Infinite loop | Count is expression that keeps changing | Use fixed count variable |
| Off-by-one | Expecting 1-based index | Add 1: `$i + 1` |

## Related Functions

- [foreach](../foreach/SKILL.md) - Iterate over arrays
- [while](../while/SKILL.md) - Conditional loops
- [continue](../continue/SKILL.md) - Skip to next iteration
- [conditional](../conditional/SKILL.md) - If/else logic
- [array.push](../array-push/SKILL.md) - Add to arrays
