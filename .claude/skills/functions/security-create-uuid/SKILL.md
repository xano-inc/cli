---
name: security-create-uuid
description: XanoScript security.create_uuid function - generates a universally unique identifier (UUID v4). Use for creating unique IDs, tokens, or identifiers.
---

# security.create_uuid

Generates a Universally Unique Identifier (UUID v4), a random 128-bit value formatted as a string.

## Syntax

```xs
security.create_uuid as $uuid
```

## Parameters

None - this function takes no parameters.

## Return Value

Returns a UUID string in the format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` stored in the variable specified by `as`.

## Examples

### Basic Usage

```xs
query "example" verb=GET {
  input {}

  stack {
    security.create_uuid as $uuid
  }

  response = {
    uuid: $uuid
  }
}
// Returns: { "uuid": "1680571d-5949-4050-a0c9-e78e9d9c7560" }
```

### Generate Multiple UUIDs

```xs
query "example" verb=GET {
  input {}

  stack {
    security.create_uuid as $uuid1
    security.create_uuid as $uuid2
    security.create_uuid as $uuid3
  }

  response = {
    uuid1: $uuid1,
    uuid2: $uuid2,
    uuid3: $uuid3
  }
}
// Returns three unique UUIDs
```

### Use as Record Identifier

```xs
query "create-item" verb=POST {
  input {
    text name { description = "Item name" }
  }

  stack {
    security.create_uuid as $id

    db.add "items" {
      data = {
        id: $id,
        name: $input.name
      }
    } as $item
  }

  response = $item
}
```

## Test API Group

**API Group:** xs-security (ID: 267)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:sa97Gb1H`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| create-uuid | 2088 | Basic UUID generation | ✅ Working |
| create-uuid-multiple | 2089 | Multiple unique UUIDs | ✅ Working |

## Related Functions

- `security.random_bytes` - Generate random bytes
- `security.random_number` - Generate random number
