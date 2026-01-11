# array.group_by

Groups array elements by a key, creating an object where keys are the group names and values are arrays of matching elements.

## Native XanoScript Syntax (Recommended)

```xs
array.group_by ($arrayVariable) {
  by = $this.category
} as $grouped
```

**Parameters:**
| Parameter | Purpose | Example |
|-----------|---------|---------|
| `$arrayVariable` | The array to group (in parentheses) | `($items)` |
| `by` | Expression to determine group key using `$this` | `by = $this.category` |
| `as $result` | Variable to store result object (AFTER closing brace) | `as $grouped` |

**Returns:** An object with group keys and arrays of matching items:
```json
{
  "fruit": [{"name": "Apple"}, {"name": "Banana"}],
  "vegetable": [{"name": "Carrot"}, {"name": "Broccoli"}]
}
```

**Context Variables:**
- `$this` - The current element being evaluated
- `$index` - The numerical index of current element
- `$parent` - The entire array

### Native Syntax Examples

```xs
// Group by property
array.group_by ($products) {
  by = $this.category
} as $byCategory

// Group by nested property
array.group_by ($users) {
  by = $this.address.city
} as $byCity

// Group by boolean (true/false keys)
array.group_by ($tasks) {
  by = $this.completed
} as $byStatus
```

**IMPORTANT:** The `as $variable` comes AFTER the closing brace `}`, not before it!

---

## Fallback: api.lambda Syntax

For computed keys or complex grouping logic:

```xs
api.lambda {
  code = """
    return $var.array_name.reduce((acc, item) => {
      const key = item.property;  // or computed key
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
  """
  timeout = 10
} as $grouped
```

## Test Endpoints

**API Group:** xs-array-group-by (ID: 260)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:p8_nZR5B`

| Endpoint | ID | Purpose |
|----------|-----|---------|
| `group-by-property` | 2039 | Group objects by property value |
| `group-by-computed` | 2040 | Group by computed key (first letter) |
| `group-by-range` | 2041 | Group numbers into ranges |
| `group-by-boolean` | 2042 | Group by boolean property |
| `group-by-with-count` | 2043 | Group and include count per group |

## Patterns

### Pattern 1: Group by Property Value

```xs
query "group-by-property" verb=POST {
  input {}

  stack {
    var $products {
      value = [
        { name: "Apple", category: "fruit" },
        { name: "Carrot", category: "vegetable" },
        { name: "Banana", category: "fruit" },
        { name: "Broccoli", category: "vegetable" },
        { name: "Cherry", category: "fruit" }
      ]
    }

    api.lambda {
      code = """
        return $var.products.reduce((acc, item) => {
          const key = item.category;
          acc[key] = acc[key] || [];
          acc[key].push(item);
          return acc;
        }, {});
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
{
  "fruit": [
    {"name": "Apple", "category": "fruit"},
    {"name": "Banana", "category": "fruit"},
    {"name": "Cherry", "category": "fruit"}
  ],
  "vegetable": [
    {"name": "Carrot", "category": "vegetable"},
    {"name": "Broccoli", "category": "vegetable"}
  ]
}
```

### Pattern 2: Group by Computed Key (First Letter)

```xs
query "group-by-computed" verb=POST {
  input {}

  stack {
    var $names {
      value = ["Alice", "Bob", "Anna", "Charlie", "Amy", "Brian"]
    }

    api.lambda {
      code = """
        return $var.names.reduce((acc, name) => {
          const key = name[0].toUpperCase();
          acc[key] = acc[key] || [];
          acc[key].push(name);
          return acc;
        }, {});
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
{
  "A": ["Alice", "Anna", "Amy"],
  "B": ["Bob", "Brian"],
  "C": ["Charlie"]
}
```

### Pattern 3: Group Numbers into Ranges

```xs
query "group-by-range" verb=POST {
  input {}

  stack {
    var $scores {
      value = [95, 82, 67, 45, 88, 73, 91, 56, 78, 84]
    }

    api.lambda {
      code = """
        return $var.scores.reduce((acc, score) => {
          let grade;
          if (score >= 90) grade = 'A';
          else if (score >= 80) grade = 'B';
          else if (score >= 70) grade = 'C';
          else if (score >= 60) grade = 'D';
          else grade = 'F';

          acc[grade] = acc[grade] || [];
          acc[grade].push(score);
          return acc;
        }, {});
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
{
  "A": [95, 91],
  "B": [82, 88, 84],
  "C": [73, 78],
  "D": [67],
  "F": [45, 56]
}
```

### Pattern 4: Group by Boolean Property

```xs
query "group-by-boolean" verb=POST {
  input {}

  stack {
    var $tasks {
      value = [
        { title: "Task 1", completed: true },
        { title: "Task 2", completed: false },
        { title: "Task 3", completed: true },
        { title: "Task 4", completed: false },
        { title: "Task 5", completed: false }
      ]
    }

    api.lambda {
      code = """
        return $var.tasks.reduce((acc, task) => {
          const key = task.completed ? 'completed' : 'pending';
          acc[key] = acc[key] || [];
          acc[key].push(task);
          return acc;
        }, {});
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
{
  "completed": [
    {"title": "Task 1", "completed": true},
    {"title": "Task 3", "completed": true}
  ],
  "pending": [
    {"title": "Task 2", "completed": false},
    {"title": "Task 4", "completed": false},
    {"title": "Task 5", "completed": false}
  ]
}
```

### Pattern 5: Group with Count Summary

```xs
query "group-by-with-count" verb=POST {
  input {}

  stack {
    var $orders {
      value = [
        { id: 1, status: "shipped" },
        { id: 2, status: "pending" },
        { id: 3, status: "shipped" },
        { id: 4, status: "delivered" },
        { id: 5, status: "pending" },
        { id: 6, status: "delivered" }
      ]
    }

    api.lambda {
      code = """
        const grouped = $var.orders.reduce((acc, order) => {
          const key = order.status;
          acc[key] = acc[key] || [];
          acc[key].push(order);
          return acc;
        }, {});

        // Add counts
        const result = {};
        for (const [key, items] of Object.entries(grouped)) {
          result[key] = {
            count: items.length,
            items: items
          };
        }
        return result;
      """
      timeout = 10
    } as $result
  }

  response = $result
}
```

**Response:**
```json
{
  "shipped": {
    "count": 2,
    "items": [{"id": 1, "status": "shipped"}, {"id": 3, "status": "shipped"}]
  },
  "pending": {
    "count": 2,
    "items": [{"id": 2, "status": "pending"}, {"id": 5, "status": "pending"}]
  },
  "delivered": {
    "count": 2,
    "items": [{"id": 4, "status": "delivered"}, {"id": 6, "status": "delivered"}]
  }
}
```

## The reduce() Pattern for Grouping

```javascript
array.reduce((accumulator, currentItem) => {
  const key = /* determine group key */;
  accumulator[key] = accumulator[key] || [];  // Initialize if needed
  accumulator[key].push(currentItem);          // Add to group
  return accumulator;
}, {});  // Start with empty object
```

## Common Group By Patterns

| Use Case | Key Expression |
|----------|----------------|
| **By property** | `item.category` |
| **By first letter** | `item.name[0].toUpperCase()` |
| **By date** | `item.date.slice(0, 10)` (YYYY-MM-DD) |
| **By month** | `item.date.slice(0, 7)` (YYYY-MM) |
| **By range** | `Math.floor(item.value / 10) * 10` |
| **By boolean** | `item.active ? 'active' : 'inactive'` |
| **By nested** | `item.user.role` |

## Use Cases

| Scenario | Why Group By |
|----------|--------------|
| **Dashboard stats** | Group orders by status for counts |
| **Reports** | Group sales by region, month, category |
| **UI organization** | Group contacts by first letter |
| **Data analysis** | Group metrics by time period |
| **Filtering views** | Pre-group for faster filtering |

## Gotchas

### 1. Initialize Groups with `|| []`

Always initialize before pushing:

```javascript
// CORRECT
acc[key] = acc[key] || [];
acc[key].push(item);

// WRONG - will throw error
acc[key].push(item);  // acc[key] is undefined!
```

### 2. Handle undefined/null Keys

```javascript
const key = item.category || 'uncategorized';
```

### 3. Keys are Always Strings

Object keys in JavaScript are strings:

```javascript
// These create the same key
acc[1] = ['a'];
acc['1'] = ['b'];
// Result: { '1': ['b'] }
```

Use `Map` if you need non-string keys (but it won't serialize to JSON nicely).

### 4. Order Not Guaranteed

Object property order follows insertion order in modern JS, but don't rely on it for sorting. Sort after grouping if needed.

### 5. Access Variables via $var

```xs
// CORRECT
code = "return $var.items.reduce(...);"

// WRONG
code = "return $items.reduce(...);"
```

### 6. Object.groupBy() (ES2024)

Modern JS has `Object.groupBy()` but it may not be available everywhere:

```javascript
// ES2024 - may not work in all environments
Object.groupBy(array, item => item.category)

// Use reduce() for guaranteed compatibility
array.reduce((acc, item) => {...}, {})
```

## Related Functions

- [array.partition](../array-partition/SKILL.md) - Split into exactly 2 groups (pass/fail)
- [array.filter](../array-filter/SKILL.md) - Get single group of matches
- [array.map](../array-map/SKILL.md) - Transform without grouping
