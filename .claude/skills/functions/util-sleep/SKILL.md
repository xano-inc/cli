---
name: util-sleep
description: XanoScript util.sleep function - pauses script execution. Use for rate limiting, polling delays, or timed operations.
---

# util.sleep

Pauses script execution for a specified number of seconds.

## Syntax

```xs
util.sleep {
  value = 5
}
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | int/decimal | Yes | Seconds to sleep |

## Return Value

None - this is a void function.

## Examples

### Basic Sleep

```xs
query "sleep" verb=GET {
  input {
    int seconds?=1 { description = "Seconds to sleep" }
  }

  stack {
    util.sleep {
      value = $input.seconds
    }
  }

  response = {
    slept_for: $input.seconds
  }
}
```

### Rate Limiting Between Requests

```xs
query "batch-process" verb=POST {
  input {
    json items { description = "Items to process" }
  }

  stack {
    var $results { value = [] }

    foreach ($input.items) {
      each as $item {
        // Process item
        var $processed { value = `$item ~ "-processed"` }
        array.push $results { value = $processed }

        // Rate limit: wait 1 second between items
        util.sleep {
          value = 1
        }
      }
    }
  }

  response = {
    results: $results
  }
}
```

### Polling with Delay

```xs
query "poll-status" verb=GET {
  input {
    text job_id { description = "Job ID to check" }
    int max_attempts?=5 { description = "Max poll attempts" }
  }

  stack {
    var $attempts { value = 0 }
    var $status { value = "pending" }

    while ($status == "pending" && $attempts < $input.max_attempts) {
      // Check job status
      db.get "jobs" {
        field_name = "id"
        field_value = $input.job_id
      } as $job

      var.update $status { value = $job.status }
      math.add $attempts { value = 1 }

      // Wait before next check
      conditional {
        if ($status == "pending") {
          util.sleep { value = 2 }
        }
      }
    }
  }

  response = {
    job_id: $input.job_id,
    final_status: $status,
    attempts: $attempts
  }
}
```

### Simulated Delay for Testing

```xs
query "slow-endpoint" verb=GET {
  description = "Simulates a slow response for testing"

  input {
    decimal delay?=0.5 { description = "Delay in seconds" }
  }

  stack {
    util.sleep {
      value = $input.delay
    }
  }

  response = {
    message: "Response after delay",
    delay_seconds: $input.delay
  }
}
```

## Use Cases

| Use Case | Typical Delay |
|----------|---------------|
| Rate limiting API calls | 0.5-2 seconds |
| Polling/retry loops | 1-5 seconds |
| Simulated latency | Variable |
| Batch processing throttle | 0.1-1 second |

## Important Notes

1. **Blocks execution** - Script pauses entirely during sleep
2. **Timeout consideration** - Don't exceed API timeout limits
3. **Decimal support** - Can use fractional seconds (0.5)
4. **No return value** - Void function
5. **Resource usage** - Holds connection during sleep

## Caution

Long sleep durations may:
- Cause request timeouts
- Hold server resources
- Affect user experience

Keep sleep values reasonable for production use.

## Test API Group

**API Group:** xs-util (ID: 269)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:3KzrYiuB`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| sleep | 2131 | Test util.sleep | Working |

## Related Functions

- `while` - Loop with sleep for polling
- `foreach` - Process items with rate limiting
