# continue

The `continue` statement skips the current iteration of a loop and moves to the next one. It's used to bypass processing specific items based on a condition.

## Syntax

```xs
foreach ($items) {
  each as $item {
    if (condition) {
      continue
    }
    // code here only runs if condition is false
  }
}
```

## Test Endpoints

**API Group:** xs-continue (ID: 235)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:o68-wwKF`

### 1. Skip Odd Numbers

**Endpoint:** `POST /continue/skip-odds` (ID: 1917)

```xs
query "continue/skip-odds" verb=POST {
  description = "Continue to skip odd numbers"

  input {
    json numbers {
      description = "Array of numbers"
    }
  }

  stack {
    var $evens { value = [] }

    foreach ($input.numbers) {
      each as $num {
        if (`$num % 2 != 0`) {
          continue
        }
        array.push $evens { value = $num }
      }
    }
  }

  response = {
    input: $input.numbers,
    evens_only: $evens
  }
}
```

**Request:**
```json
{ "numbers": [1, 2, 3, 4, 5, 6, 7, 8] }
```

**Response:**
```json
{
  "input": [1, 2, 3, 4, 5, 6, 7, 8],
  "evens_only": [2, 4, 6, 8]
}
```

### 2. Skip Null Values

**Endpoint:** `POST /continue/skip-nulls` (ID: 1918)

```xs
query "continue/skip-nulls" verb=POST {
  description = "Continue to skip null values"

  input {
    json items {
      description = "Array that may contain nulls"
    }
  }

  stack {
    var $valid { value = [] }
    var $skipped { value = 0 }

    foreach ($input.items) {
      each as $item {
        if ($item == null) {
          math.add $skipped { value = 1 }
          continue
        }
        array.push $valid { value = $item }
      }
    }
  }

  response = {
    input: $input.items,
    valid_items: $valid,
    nulls_skipped: $skipped
  }
}
```

**Request:**
```json
{ "items": ["a", null, "b", null, "c"] }
```

**Response:**
```json
{
  "input": ["a", null, "b", null, "c"],
  "valid_items": ["a", "b", "c"],
  "nulls_skipped": 2
}
```

### 3. Filter Users by Age

**Endpoint:** `POST /continue/filter-users` (ID: 1919)

```xs
query "continue/filter-users" verb=POST {
  description = "Continue to skip users below min age"

  input {
    json users {
      description = "Array of user objects"
    }
    int min_age {
      description = "Minimum age to include"
    }
  }

  stack {
    var $adults { value = [] }
    var $skipped_names { value = [] }

    foreach ($input.users) {
      each as $user {
        if ($user.age < $input.min_age) {
          array.push $skipped_names { value = $user.name }
          continue
        }
        array.push $adults { value = $user }
      }
    }
  }

  response = {
    min_age: $input.min_age,
    included: $adults,
    skipped: $skipped_names
  }
}
```

**Request:**
```json
{
  "users": [
    {"name": "Alice", "age": 25},
    {"name": "Bob", "age": 16},
    {"name": "Charlie", "age": 30},
    {"name": "Diana", "age": 17}
  ],
  "min_age": 18
}
```

**Response:**
```json
{
  "min_age": 18,
  "included": [
    {"name": "Alice", "age": 25},
    {"name": "Charlie", "age": 30}
  ],
  "skipped": ["Bob", "Diana"]
}
```

### 4. Continue in For Loop

**Endpoint:** `GET /continue/for-loop` (ID: 1920)

```xs
query "continue/for-loop" verb=GET {
  description = "Continue in for loop skipping multiples of 3"

  input {
    int count {
      description = "Count up to this number"
    }
  }

  stack {
    var $included { value = [] }
    var $excluded { value = [] }

    for ($input.count) {
      each as $i {
        var $num { value = `$i + 1` }

        if (`$num % 3 == 0`) {
          array.push $excluded { value = $num }
          continue
        }

        array.push $included { value = $num }
      }
    }
  }

  response = {
    count: $input.count,
    not_divisible_by_3: $included,
    divisible_by_3: $excluded
  }
}
```

**Request:** `?count=10`

**Response:**
```json
{
  "count": 10,
  "not_divisible_by_3": [1, 2, 4, 5, 7, 8, 10],
  "divisible_by_3": [3, 6, 9]
}
```

### 5. Complex Multi-Condition Continue

**Endpoint:** `POST /continue/complex` (ID: 1921)

```xs
query "continue/complex" verb=POST {
  description = "Continue with multiple conditions"

  input {
    json items {
      description = "Array of product objects"
    }
  }

  stack {
    var $valid_products { value = [] }
    var $reasons { value = [] }

    foreach ($input.items) {
      each as $product {
        // Skip if no name
        if ($product.name == null || $product.name == "") {
          array.push $reasons { value = "Skipped: missing name" }
          continue
        }

        // Skip if price is zero or negative
        if ($product.price <= 0) {
          array.push $reasons {
            value = "Skipped " ~ $product.name ~ ": invalid price"
          }
          continue
        }

        // Skip if out of stock
        if ($product.stock == 0) {
          array.push $reasons {
            value = "Skipped " ~ $product.name ~ ": out of stock"
          }
          continue
        }

        // Passed all checks
        array.push $valid_products { value = $product }
      }
    }
  }

  response = {
    valid_products: $valid_products,
    skip_reasons: $reasons
  }
}
```

**Request:**
```json
{
  "items": [
    {"name": "Widget", "price": 10, "stock": 5},
    {"name": "", "price": 20, "stock": 3},
    {"name": "Gadget", "price": -5, "stock": 10},
    {"name": "Tool", "price": 15, "stock": 0},
    {"name": "Device", "price": 25, "stock": 8}
  ]
}
```

**Response:**
```json
{
  "valid_products": [
    {"name": "Widget", "price": 10, "stock": 5},
    {"name": "Device", "price": 25, "stock": 8}
  ],
  "skip_reasons": [
    "Skipped: missing name",
    "Skipped Gadget: invalid price",
    "Skipped Tool: out of stock"
  ]
}
```

## Key Patterns

### Pattern 1: Early Skip with Condition

```xs
foreach ($items) {
  each as $item {
    if (should_skip_condition) {
      continue
    }
    // Process valid items
  }
}
```

### Pattern 2: Multiple Continue Guards

```xs
foreach ($items) {
  each as $item {
    if ($item == null) { continue }
    if ($item.status != "active") { continue }
    if ($item.value < 0) { continue }

    // Only process items that pass all checks
  }
}
```

### Pattern 3: Continue with Logging

```xs
foreach ($items) {
  each as $item {
    if (should_skip) {
      array.push $skipped_log { value = $item }
      continue
    }
    array.push $processed { value = $item }
  }
}
```

### Pattern 4: Continue in For Loop

```xs
for (100) {
  each as $i {
    if (should_skip_index) {
      continue
    }
    // Process index
  }
}
```

## continue vs conditional

| Use `continue` when... | Use `conditional` when... |
|------------------------|--------------------------|
| Skip entire iteration | Execute different code paths |
| Guard clause pattern | Need else/elseif branches |
| Cleaner early exit | Complex branching logic |

```xs
// continue: skip and move on
foreach ($items) {
  each as $item {
    if ($item.invalid) { continue }
    // process valid only
  }
}

// conditional: different branches
foreach ($items) {
  each as $item {
    conditional {
      if ($item.type == "A") { /* handle A */ }
      elseif ($item.type == "B") { /* handle B */ }
    }
  }
}
```

## Gotchas and Edge Cases

1. **Only in loops**: `continue` only works inside `foreach`, `for`, or `while` loops.

2. **Skips rest of iteration**: All code after `continue` in that iteration is skipped.

3. **No nested continue**: `continue` affects the innermost loop only.

4. **Use with if**: `continue` is typically used with an `if` condition check.

5. **Not a function**: `continue` is a statement, not a function. No parentheses needed.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `continue outside loop` | Using continue outside foreach/for/while | Move inside a loop |
| Skipping wrong loop | Nested loops confusion | `continue` only affects innermost loop |

## Related Functions

- [foreach](../foreach/SKILL.md) - Array iteration
- [for](../for/SKILL.md) - Counted loops
- [while](../while/SKILL.md) - Conditional loops
- [conditional](../conditional/SKILL.md) - If/else branching
