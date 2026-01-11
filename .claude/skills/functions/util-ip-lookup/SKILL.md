---
name: util-ip-lookup
description: XanoScript util.ip_lookup function - geolocates IP addresses. Use for location-based features, analytics, or access control.
---

# util.ip_lookup

Retrieves geographic location information for an IP address.

## Syntax

```xs
util.ip_lookup {
  value = "123.234.99.22"
} as $location
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `value` | text | Yes | IP address to lookup |

## Return Value

Returns an object with location data:

```json
{
  "continent": { "code": "NA", "name": "North America" },
  "country": { "code": "US", "name": "United States" },
  "region": { "code": "CA", "name": "California" },
  "city": { "name": "San Francisco" },
  "postal": { "code": "94102" },
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "tz": "America/Los_Angeles",
    "radius": 5
  }
}
```

## Examples

### Basic IP Lookup

```xs
query "ip-lookup" verb=GET {
  input {
    text ip { description = "IP address to lookup" }
  }

  stack {
    util.ip_lookup {
      value = $input.ip
    } as $location
  }

  response = {
    ip: $input.ip,
    location: $location
  }
}
// Input: ip=8.8.8.8
// Returns: { "ip": "8.8.8.8", "location": { "country": { "name": "United States" }, ... } }
```

### Get Visitor Location

```xs
query "visitor-info" verb=GET {
  input {}

  stack {
    // Get client IP from request
    var $client_ip { value = $request.ip }

    util.ip_lookup {
      value = $client_ip
    } as $location
  }

  response = {
    your_ip: $client_ip,
    country: $location.country.name,
    city: $location.city.name,
    timezone: $location.location.tz
  }
}
```

### Country-Based Access Control

```xs
query "restricted-content" verb=GET {
  input {}

  stack {
    util.ip_lookup {
      value = $request.ip
    } as $location

    // Block certain countries
    var $blocked_countries { value = ["CN", "RU", "KP"] }
    var $is_blocked { value = `$location.country.code in $blocked_countries` }

    precondition (!$is_blocked) {
      error_type = "forbidden"
      error = "Content not available in your region"
    }
  }

  response = {
    message: "Welcome! Content available in your region.",
    country: $location.country.name
  }
}
```

### Location-Based Redirect

```xs
query "localized-redirect" verb=GET {
  input {}

  stack {
    util.ip_lookup {
      value = $request.ip
    } as $location

    // Determine locale URL
    var $url { value = "https://example.com/en" }

    conditional {
      if ($location.country.code == "DE") {
        var.update $url { value = "https://example.com/de" }
      }
      elseif ($location.country.code == "FR") {
        var.update $url { value = "https://example.com/fr" }
      }
      elseif ($location.country.code == "ES") {
        var.update $url { value = "https://example.com/es" }
      }
    }

    util.set_header {
      value = `"Location: " ~ $url`
    }
  }

  response = {
    redirect_to: $url
  }
}
```

## Response Fields

| Field | Description |
|-------|-------------|
| `continent.code` | 2-letter continent code (NA, EU, AS, etc.) |
| `continent.name` | Full continent name |
| `country.code` | ISO 3166-1 alpha-2 country code |
| `country.name` | Full country name |
| `region.code` | State/province code |
| `region.name` | State/province name |
| `city.name` | City name |
| `postal.code` | Postal/ZIP code |
| `location.latitude` | GPS latitude |
| `location.longitude` | GPS longitude |
| `location.tz` | Timezone identifier |
| `location.radius` | Accuracy radius in km |

## Important Notes

1. **Accuracy varies** - City-level data may not be available for all IPs
2. **Private IPs** - Returns null/empty for private IP ranges
3. **VPN/Proxy** - May show VPN server location, not user
4. **Rate limits** - May have lookup limits per minute

## Test API Group

**API Group:** xs-util (ID: 269)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:3KzrYiuB`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| ip-lookup | 2132 | Geolocate IP address | Working |

## Related Functions

- `util.geo_distance` - Calculate distance between coordinates
