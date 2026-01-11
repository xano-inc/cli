# while

The `while` loop continuously executes a block of code as long as a condition remains true. Useful for loops where the number of iterations isn't known in advance.

## Syntax

```xs
while (condition) {
  each {
    // code to execute while condition is true
  }
}
```

Or with backticks for expressions:

```xs
while (`$count < 10`) {
  each {
    // code to execute
  }
}
```

## Test Endpoints

**API Group:** xs-while (ID: 233)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:u1m0yzNs`

### 1. Countdown

**Endpoint:** `GET /while/countdown` (ID: 1907)

```xs
query "while/countdown" verb=GET {
  description = "While loop countdown"

  input {
    int start {
      description = "Starting number for countdown"
    }
  }

  stack {
    var $current { value = $input.start }
    var $steps { value = [] }

    while (`$current > 0`) {
      each {
        array.push $steps { value = $current }
        var.update $current { value = `$current - 1` }
      }
    }

    array.push $steps { value = "Liftoff!" }
  }

  response = {
    start: $input.start,
    countdown: $steps
  }
}
```

**Request:** `?start=5`

**Response:**
```json
{
  "start": 5,
  "countdown": [5, 4, 3, 2, 1, "Liftoff!"]
}
```

### 2. Accumulator

**Endpoint:** `GET /while/accumulator` (ID: 1908)

```xs
query "while/accumulator" verb=GET {
  description = "While loop accumulating until target"

  input {
    int target {
      description = "Target sum to reach"
    }
  }

  stack {
    var $sum { value = 0 }
    var $num { value = 1 }
    var $numbers { value = [] }

    while (`$sum < $target`) {
      each {
        array.push $numbers { value = $num }
        math.add $sum { value = $num }
        var.update $num { value = `$num + 1` }
      }
    }
  }

  response = {
    target: $input.target,
    numbers_added: $numbers,
    final_sum: $sum
  }
}
```

**Request:** `?target=15`

**Response:**
```json
{
  "target": 15,
  "numbers_added": [1, 2, 3, 4, 5],
  "final_sum": 15
}
```

### 3. Retry Pattern

**Endpoint:** `GET /while/retry` (ID: 1909)

```xs
query "while/retry" verb=GET {
  description = "While loop retry pattern"

  input {
    int max_attempts {
      description = "Maximum retry attempts"
    }
  }

  stack {
    var $attempt { value = 0 }
    var $success { value = false }
    var $log { value = [] }

    while (`$attempt < $max_attempts && $success == false`) {
      each {
        var.update $attempt { value = `$attempt + 1` }

        // Simulate success on attempt 3
        conditional {
          if ($attempt >= 3) {
            var.update $success { value = true }
            array.push $log {
              value = { attempt: $attempt, status: "success" }
            }
          }
          else {
            array.push $log {
              value = { attempt: $attempt, status: "failed" }
            }
          }
        }
      }
    }
  }

  response = {
    max_attempts: $input.max_attempts,
    total_attempts: $attempt,
    success: $success,
    log: $log
  }
}
```

### 4. Fibonacci Sequence

**Endpoint:** `GET /while/fibonacci` (ID: 1910)

```xs
query "while/fibonacci" verb=GET {
  description = "While loop generating Fibonacci sequence"

  input {
    int limit {
      description = "Generate Fibonacci numbers up to this limit"
    }
  }

  stack {
    var $a { value = 0 }
    var $b { value = 1 }
    var $sequence { value = [0, 1] }

    while (`$a + $b <= $limit`) {
      each {
        var $next { value = `$a + $b` }
        array.push $sequence { value = $next }
        var.update $a { value = $b }
        var.update $b { value = $next }
      }
    }
  }

  response = {
    limit: $input.limit,
    fibonacci: $sequence
  }
}
```

**Request:** `?limit=50`

**Response:**
```json
{
  "limit": 50,
  "fibonacci": [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
}
```

### 5. Repeated Division

**Endpoint:** `GET /while/divide` (ID: 1911)

```xs
query "while/divide" verb=GET {
  description = "While loop repeated division"

  input {
    int number {
      description = "Number to divide"
    }
    int divisor {
      description = "Divisor to use"
    }
  }

  stack {
    var $current { value = $input.number }
    var $steps { value = [] }
    var $count { value = 0 }

    while (`$current >= $divisor`) {
      each {
        array.push $steps {
          value = { before: $current, after: `$current / $divisor` }
        }
        var.update $current { value = `$current / $divisor` }
        math.add $count { value = 1 }
      }
    }
  }

  response = {
    original: $input.number,
    divisor: $input.divisor,
    divisions: $count,
    steps: $steps,
    remainder: $current
  }
}
```

**Request:** `?number=100&divisor=2`

**Response:**
```json
{
  "original": 100,
  "divisor": 2,
  "divisions": 6,
  "steps": [
    {"before": 100, "after": 50},
    {"before": 50, "after": 25},
    {"before": 25, "after": 12},
    {"before": 12, "after": 6},
    {"before": 6, "after": 3},
    {"before": 3, "after": 1}
  ],
  "remainder": 1
}
```

## Key Patterns

### Pattern 1: Counter-Based Loop

```xs
var $i { value = 0 }

while (`$i < 10`) {
  each {
    // do something
    var.update $i { value = `$i + 1` }
  }
}
```

### Pattern 2: Flag-Based Loop

```xs
var $done { value = false }

while ($done == false) {
  each {
    // do something
    conditional {
      if (some_condition) {
        var.update $done { value = true }
      }
    }
  }
}
```

### Pattern 3: Multiple Conditions

```xs
var $attempts { value = 0 }
var $success { value = false }

while (`$attempts < 5 && $success == false`) {
  each {
    // try operation
    math.add $attempts { value = 1 }
  }
}
```

### Pattern 4: Processing Until Empty

```xs
var $queue { value = ["a", "b", "c"] }

while (($queue|count) > 0) {
  each {
    var $item { value = $queue|first }
    // process item
    array.shift $queue {}
  }
}
```

### Pattern 5: Convergence Loop

```xs
var $value { value = 100 }
var $tolerance { value = 0.01 }

while (`$value > $tolerance`) {
  each {
    var.update $value { value = `$value / 2` }
  }
}
```

## while vs for vs foreach

| Use `while` when... | Use `for` when... | Use `foreach` when... |
|---------------------|-------------------|----------------------|
| Iterations unknown | Count is fixed | Iterating array |
| Condition-based | Need sequence | Processing items |
| Retry/polling | Building arrays | Each element |

## Gotchas and Edge Cases

1. **Infinite loops**: Always ensure the condition will eventually become false. Include an update statement or break condition.

2. **No break statement**: XanoScript doesn't have `break`. Use a flag variable with the condition.

3. **Initial false condition**: If condition is false initially, the loop body never executes.

4. **Backticks for expressions**: Use backticks when combining operators: `` while (`$x > 0 && $y < 10`) ``

5. **Variable scope**: Variables modified inside the loop persist after the loop ends.

6. **Safety limit**: Consider adding a max iterations check to prevent runaway loops:
   ```xs
   var $safety { value = 0 }
   while (`$condition && $safety < 1000`) {
     each {
       math.add $safety { value = 1 }
       // ...
     }
   }
   ```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `expected 'each'` | Missing `each { }` | Add `each { }` inside while |
| Infinite loop | Condition never false | Ensure loop variable updates |
| Never executes | Condition false initially | Check initial state |

## Related Functions

- [for](../for/SKILL.md) - Counted loops
- [foreach](../foreach/SKILL.md) - Array iteration
- [continue](../continue/SKILL.md) - Skip to next iteration
- [conditional](../conditional/SKILL.md) - If/else logic
