# foreach

The `foreach` loop iterates over each element in an array, providing access to each item for processing.

## Syntax

```xs
foreach ($array) {
  each as $item {
    // code to execute for each item
  }
}
```

Or with inline array:

```xs
foreach ([1, 2, 3, 4]) {
  each as $item {
    // code to execute for each item
  }
}
```

## Test Endpoints

**API Group:** xs-foreach (ID: 232)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:bXsAD789`

### 1. Basic Foreach

**Endpoint:** `POST /foreach/basic` (ID: 1902)

```xs
query "foreach/basic" verb=POST {
  description = "Basic foreach iterating over array"

  input {
    json items {
      description = "Array of items to iterate"
    }
  }

  stack {
    var $sum { value = 0 }
    var $count { value = 0 }

    foreach ($input.items) {
      each as $item {
        math.add $sum { value = $item }
        math.add $count { value = 1 }
      }
    }
  }

  response = {
    items: $input.items,
    sum: $sum,
    count: $count
  }
}
```

**Request:**
```json
{ "items": [10, 20, 30] }
```

**Response:**
```json
{
  "items": [10, 20, 30],
  "sum": 60,
  "count": 3
}
```

### 2. Foreach with Index Tracking

**Endpoint:** `POST /foreach/with-index` (ID: 1903)

```xs
query "foreach/with-index" verb=POST {
  description = "Foreach with index tracking"

  input {
    json items {
      description = "Array to iterate with index"
    }
  }

  stack {
    var $result { value = [] }
    var $index { value = 0 }

    foreach ($input.items) {
      each as $item {
        array.push $result {
          value = {
            index: $index,
            value: $item,
            is_first: $index == 0,
            is_last: $index == (($input.items|count) - 1)
          }
        }
        math.add $index { value = 1 }
      }
    }
  }

  response = $result
}
```

**Request:**
```json
{ "items": ["a", "b", "c"] }
```

**Response:**
```json
[
  {"index": 0, "value": "a", "is_first": true, "is_last": false},
  {"index": 1, "value": "b", "is_first": false, "is_last": false},
  {"index": 2, "value": "c", "is_first": false, "is_last": true}
]
```

### 3. Foreach Transform

**Endpoint:** `POST /foreach/transform` (ID: 1904)

```xs
query "foreach/transform" verb=POST {
  description = "Foreach building transformed array"

  input {
    json items {
      description = "Array of numbers to transform"
    }
  }

  stack {
    var $doubled { value = [] }
    var $squared { value = [] }

    foreach ($input.items) {
      each as $num {
        array.push $doubled { value = `$num * 2` }
        array.push $squared { value = `$num * $num` }
      }
    }
  }

  response = {
    original: $input.items,
    doubled: $doubled,
    squared: $squared
  }
}
```

**Request:**
```json
{ "items": [1, 2, 3, 4] }
```

**Response:**
```json
{
  "original": [1, 2, 3, 4],
  "doubled": [2, 4, 6, 8],
  "squared": [1, 4, 9, 16]
}
```

### 4. Foreach with Objects

**Endpoint:** `POST /foreach/objects` (ID: 1905)

```xs
query "foreach/objects" verb=POST {
  description = "Foreach iterating over array of objects"

  input {
    json users {
      description = "Array of user objects"
    }
  }

  stack {
    var $names { value = [] }
    var $total_age { value = 0 }
    var $adults { value = [] }

    foreach ($input.users) {
      each as $user {
        array.push $names { value = $user.name }
        math.add $total_age { value = $user.age }

        conditional {
          if ($user.age >= 18) {
            array.push $adults { value = $user }
          }
        }
      }
    }

    var $avg_age {
      value = $total_age / ($input.users|count)
    }
  }

  response = {
    names: $names,
    total_age: $total_age,
    average_age: $avg_age,
    adults: $adults
  }
}
```

**Request:**
```json
{
  "users": [
    {"name": "Alice", "age": 25},
    {"name": "Bob", "age": 17},
    {"name": "Charlie", "age": 30}
  ]
}
```

**Response:**
```json
{
  "names": ["Alice", "Bob", "Charlie"],
  "total_age": 72,
  "average_age": 24,
  "adults": [
    {"name": "Alice", "age": 25},
    {"name": "Charlie", "age": 30}
  ]
}
```

### 5. Nested Foreach

**Endpoint:** `POST /foreach/nested` (ID: 1906)

```xs
query "foreach/nested" verb=POST {
  description = "Nested foreach for 2D arrays"

  input {
    json matrix {
      description = "2D array (array of arrays)"
    }
  }

  stack {
    var $flattened { value = [] }
    var $row_sums { value = [] }

    foreach ($input.matrix) {
      each as $row {
        var $row_sum { value = 0 }

        foreach ($row) {
          each as $cell {
            array.push $flattened { value = $cell }
            math.add $row_sum { value = $cell }
          }
        }

        array.push $row_sums { value = $row_sum }
      }
    }

    var $total { value = 0 }
    foreach ($flattened) {
      each as $val {
        math.add $total { value = $val }
      }
    }
  }

  response = {
    matrix: $input.matrix,
    flattened: $flattened,
    row_sums: $row_sums,
    total: $total
  }
}
```

**Request:**
```json
{
  "matrix": [[1, 2], [3, 4], [5, 6]]
}
```

**Response:**
```json
{
  "matrix": [[1, 2], [3, 4], [5, 6]],
  "flattened": [1, 2, 3, 4, 5, 6],
  "row_sums": [3, 7, 11],
  "total": 21
}
```

## Key Patterns

### Pattern 1: Accumulating Values

```xs
var $sum { value = 0 }

foreach ($numbers) {
  each as $num {
    math.add $sum { value = $num }
  }
}
```

### Pattern 2: Building New Array

```xs
var $result { value = [] }

foreach ($items) {
  each as $item {
    array.push $result {
      value = $item.name|to_upper
    }
  }
}
```

### Pattern 3: Filtering

```xs
var $filtered { value = [] }

foreach ($items) {
  each as $item {
    conditional {
      if ($item.active == true) {
        array.push $filtered { value = $item }
      }
    }
  }
}
```

### Pattern 4: Finding Item

```xs
var $found { value = null }

foreach ($items) {
  each as $item {
    conditional {
      if ($item.id == $target_id && $found == null) {
        var.update $found { value = $item }
      }
    }
  }
}
```

### Pattern 5: Accessing Object Properties

```xs
foreach ($users) {
  each as $user {
    // Access properties with dot notation
    var $full_name {
      value = $user.first_name ~ " " ~ $user.last_name
    }
  }
}
```

### Pattern 6: Manual Index Tracking

```xs
var $index { value = 0 }

foreach ($items) {
  each as $item {
    // Use $index for position
    var $position { value = $index }
    math.add $index { value = 1 }
  }
}
```

## foreach vs for

| Use `foreach` when... | Use `for` when... |
|----------------------|-------------------|
| Iterating over an existing array | You need a specific number of iterations |
| Processing each element | Generating a sequence |
| You need the element value | You need the index for calculations |

```xs
// foreach: process existing array
foreach ($users) {
  each as $user {
    // work with $user
  }
}

// for: generate sequence
for (10) {
  each as $i {
    // work with index $i (0-9)
  }
}
```

## Gotchas and Edge Cases

1. **Empty arrays**: `foreach` on empty array `[]` doesn't execute the loop body at all.

2. **No built-in index**: Unlike some languages, `foreach` doesn't provide an index. Track it manually if needed.

3. **Modifying source array**: Avoid modifying the array you're iterating over. Build a new array instead.

4. **Object iteration**: To iterate over object keys, use `object.keys` or `object.entries` first.

5. **Null check**: Ensure array isn't null before foreach to avoid errors:
   ```xs
   conditional {
     if ($items != null) {
       foreach ($items) { ... }
     }
   }
   ```

6. **Break not supported**: XanoScript doesn't have `break`. Use a flag variable with conditional to skip remaining iterations.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `expected 'each'` | Missing `each as $var` | Add `each as $item { }` inside foreach |
| `cannot iterate` | Variable is not an array | Ensure variable is array type |
| Undefined property | Object property doesn't exist | Check property exists or use null check |

## Related Functions

- [for](../for/SKILL.md) - Counted loops
- [while](../while/SKILL.md) - Conditional loops
- [continue](../continue/SKILL.md) - Skip to next iteration
- [array.filter](../array-filter/SKILL.md) - Filter arrays (alternative to foreach filter pattern)
- [array.map](../array-map/SKILL.md) - Transform arrays (alternative to foreach transform pattern)
