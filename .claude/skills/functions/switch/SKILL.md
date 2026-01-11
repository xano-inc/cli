# switch

The `switch` statement provides multi-branch control flow based on matching a variable against specific case values. It's cleaner than multiple `elseif` statements when comparing against discrete values.

## Syntax

```xs
switch ($variable) {
  case ("value1") {
    // code for value1
  } break

  case ("value2") {
    // code for value2
  } break

  default {
    // code if no cases match
  }
}
```

## Test Endpoints

**API Group:** xs-switch (ID: 234)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:NHip6hUZ`

### 1. Basic Status Switch

**Endpoint:** `GET /switch/status` (ID: 1912)

```xs
query "switch/status" verb=GET {
  description = "Basic switch on status values"

  input {
    text status {
      description = "Status: active, inactive, pending, banned"
    }
  }

  stack {
    var $message { value = "" }
    var $can_access { value = false }

    switch ($input.status) {
      case ("active") {
        var.update $message { value = "User is active" }
        var.update $can_access { value = true }
      } break

      case ("pending") {
        var.update $message { value = "User is pending approval" }
        var.update $can_access { value = false }
      } break

      case ("inactive") {
        var.update $message { value = "User is inactive" }
        var.update $can_access { value = false }
      } break

      case ("banned") {
        var.update $message { value = "User is banned" }
        var.update $can_access { value = false }
      } break

      default {
        var.update $message { value = "Unknown status" }
        var.update $can_access { value = false }
      }
    }
  }

  response = {
    status: $input.status,
    message: $message,
    can_access: $can_access
  }
}
```

**Test Cases:**
- `?status=active` → `{"status": "active", "message": "User is active", "can_access": true}`
- `?status=banned` → `{"status": "banned", "message": "User is banned", "can_access": false}`

### 2. Letter Grades

**Endpoint:** `GET /switch/grade` (ID: 1913)

```xs
query "switch/grade" verb=GET {
  description = "Switch on letter grades"

  input {
    text grade {
      description = "Letter grade: A, B, C, D, F"
    }
  }

  stack {
    var $description { value = "" }
    var $points { value = 0 }

    switch ($input.grade) {
      case ("A") {
        var.update $description { value = "Excellent" }
        var.update $points { value = 4 }
      } break

      case ("B") {
        var.update $description { value = "Good" }
        var.update $points { value = 3 }
      } break

      case ("C") {
        var.update $description { value = "Satisfactory" }
        var.update $points { value = 2 }
      } break

      case ("D") {
        var.update $description { value = "Passing" }
        var.update $points { value = 1 }
      } break

      case ("F") {
        var.update $description { value = "Failing" }
        var.update $points { value = 0 }
      } break

      default {
        var.update $description { value = "Invalid grade" }
        var.update $points { value = 0 }
      }
    }
  }

  response = {
    grade: $input.grade,
    description: $description,
    gpa_points: $points
  }
}
```

### 3. HTTP Status Codes

**Endpoint:** `GET /switch/http-code` (ID: 1914)

```xs
query "switch/http-code" verb=GET {
  description = "Switch on HTTP status codes"

  input {
    int code {
      description = "HTTP status code"
    }
  }

  stack {
    var $category { value = "" }
    var $meaning { value = "" }

    switch ($input.code) {
      case (200) {
        var.update $category { value = "Success" }
        var.update $meaning { value = "OK" }
      } break

      case (201) {
        var.update $category { value = "Success" }
        var.update $meaning { value = "Created" }
      } break

      case (400) {
        var.update $category { value = "Client Error" }
        var.update $meaning { value = "Bad Request" }
      } break

      case (401) {
        var.update $category { value = "Client Error" }
        var.update $meaning { value = "Unauthorized" }
      } break

      case (404) {
        var.update $category { value = "Client Error" }
        var.update $meaning { value = "Not Found" }
      } break

      case (500) {
        var.update $category { value = "Server Error" }
        var.update $meaning { value = "Internal Server Error" }
      } break

      default {
        var.update $category { value = "Unknown" }
        var.update $meaning { value = "Unrecognized status code" }
      }
    }
  }

  response = {
    code: $input.code,
    category: $category,
    meaning: $meaning
  }
}
```

### 4. Day of Week

**Endpoint:** `GET /switch/day` (ID: 1915)

```xs
query "switch/day" verb=GET {
  description = "Switch on day of week number"

  input {
    int day_number {
      description = "Day number (1=Monday, 7=Sunday)"
    }
  }

  stack {
    var $day_name { value = "" }
    var $is_weekend { value = false }

    switch ($input.day_number) {
      case (1) {
        var.update $day_name { value = "Monday" }
      } break

      case (2) {
        var.update $day_name { value = "Tuesday" }
      } break

      case (3) {
        var.update $day_name { value = "Wednesday" }
      } break

      case (4) {
        var.update $day_name { value = "Thursday" }
      } break

      case (5) {
        var.update $day_name { value = "Friday" }
      } break

      case (6) {
        var.update $day_name { value = "Saturday" }
        var.update $is_weekend { value = true }
      } break

      case (7) {
        var.update $day_name { value = "Sunday" }
        var.update $is_weekend { value = true }
      } break

      default {
        var.update $day_name { value = "Invalid day" }
      }
    }
  }

  response = {
    day_number: $input.day_number,
    day_name: $day_name,
    is_weekend: $is_weekend
  }
}
```

### 5. Category Grouping

**Endpoint:** `GET /switch/category` (ID: 1916)

```xs
query "switch/category" verb=GET {
  description = "Switch grouping related values"

  input {
    text type {
      description = "File type: jpg, png, gif, mp4, avi, doc, pdf"
    }
  }

  stack {
    var $category { value = "" }
    var $icon { value = "" }

    switch ($input.type) {
      case ("jpg") {
        var.update $category { value = "image" }
        var.update $icon { value = "image-icon" }
      } break

      case ("png") {
        var.update $category { value = "image" }
        var.update $icon { value = "image-icon" }
      } break

      case ("gif") {
        var.update $category { value = "image" }
        var.update $icon { value = "image-icon" }
      } break

      case ("mp4") {
        var.update $category { value = "video" }
        var.update $icon { value = "video-icon" }
      } break

      case ("avi") {
        var.update $category { value = "video" }
        var.update $icon { value = "video-icon" }
      } break

      case ("doc") {
        var.update $category { value = "document" }
        var.update $icon { value = "doc-icon" }
      } break

      case ("pdf") {
        var.update $category { value = "document" }
        var.update $icon { value = "pdf-icon" }
      } break

      default {
        var.update $category { value = "unknown" }
        var.update $icon { value = "file-icon" }
      }
    }
  }

  response = {
    type: $input.type,
    category: $category,
    icon: $icon
  }
}
```

## Key Patterns

### Pattern 1: Basic Switch with Break

```xs
switch ($value) {
  case ("option1") {
    // handle option1
  } break

  case ("option2") {
    // handle option2
  } break

  default {
    // handle all other cases
  }
}
```

### Pattern 2: Early Return in Switch

```xs
switch ($action) {
  case ("create") {
    return {
      value = "Creating record..."
    }
  } break

  case ("delete") {
    return {
      value = "Deleting record..."
    }
  } break

  default {
    return {
      value = "Unknown action"
    }
  }
}
```

### Pattern 3: Switch with Integer Values

```xs
switch ($input.priority) {
  case (1) {
    var.update $label { value = "High" }
  } break

  case (2) {
    var.update $label { value = "Medium" }
  } break

  case (3) {
    var.update $label { value = "Low" }
  } break
}
```

### Pattern 4: Switch Setting Multiple Variables

```xs
switch ($user_role) {
  case ("admin") {
    var.update $can_read { value = true }
    var.update $can_write { value = true }
    var.update $can_delete { value = true }
  } break

  case ("editor") {
    var.update $can_read { value = true }
    var.update $can_write { value = true }
    var.update $can_delete { value = false }
  } break

  case ("viewer") {
    var.update $can_read { value = true }
    var.update $can_write { value = false }
    var.update $can_delete { value = false }
  } break
}
```

## switch vs conditional

| Use `switch` when... | Use `conditional` when... |
|---------------------|---------------------------|
| Comparing against specific values | Complex conditions |
| Many discrete options | Range comparisons (`>`, `<`) |
| Cleaner code with many cases | Boolean logic combinations |

```xs
// switch: discrete values
switch ($status) {
  case ("active") { ... } break
  case ("inactive") { ... } break
}

// conditional: range/complex
conditional {
  if ($score >= 90) { ... }
  elseif ($score >= 80) { ... }
}
```

## Gotchas and Edge Cases

1. **Break is required**: Always include `break` after each case to prevent fall-through.

2. **Case values must be literals**: You cannot use variables in `case()`. Use `conditional` for variable comparisons.

3. **Default is optional**: If no cases match and no `default` exists, nothing happens.

4. **Type matching**: String `"1"` won't match integer `1`. Ensure types match.

5. **Case order**: Cases are evaluated in order. First match wins.

6. **No fallthrough**: Unlike some languages, XanoScript requires explicit `break`. Cases don't fall through.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Multiple cases execute | Missing `break` | Add `break` after each case |
| No match found | Value not in cases | Add `default` block |
| Type mismatch | String vs integer | Ensure consistent types |

## Related Functions

- [conditional](../conditional/SKILL.md) - If/else logic (better for ranges)
- [return](../return/SKILL.md) - Early exit from switch
- [var.update](../var-update/SKILL.md) - Update variables in cases
