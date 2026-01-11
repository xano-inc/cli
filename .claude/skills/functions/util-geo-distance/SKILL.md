---
name: util-geo-distance
description: XanoScript util.geo_distance function - calculates distance between coordinates. Use for location-based search, delivery routing, or proximity features.
---

# util.geo_distance

Calculates the distance between two geographic points using their coordinates.

## Syntax

```xs
util.geo_distance {
  latitude_1 = 40.71
  longitude_1 = -74.01
  latitude_2 = 34.05
  longitude_2 = -118.24
} as $distance
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `latitude_1` | decimal | Yes | Latitude of first point |
| `longitude_1` | decimal | Yes | Longitude of first point |
| `latitude_2` | decimal | Yes | Latitude of second point |
| `longitude_2` | decimal | Yes | Longitude of second point |

## Return Value

Returns the distance in **meters** as a decimal number.

## Examples

### Basic Distance Calculation

```xs
query "geo-distance" verb=GET {
  input {
    decimal lat1 { description = "Latitude of first point" }
    decimal lon1 { description = "Longitude of first point" }
    decimal lat2 { description = "Latitude of second point" }
    decimal lon2 { description = "Longitude of second point" }
  }

  stack {
    util.geo_distance {
      latitude_1 = $input.lat1
      longitude_1 = $input.lon1
      latitude_2 = $input.lat2
      longitude_2 = $input.lon2
    } as $distance_meters

    // Convert to kilometers
    var $distance_km { value = `$distance_meters / 1000` }
  }

  response = {
    point1: { lat: $input.lat1, lon: $input.lon1 },
    point2: { lat: $input.lat2, lon: $input.lon2 },
    distance_meters: $distance_meters,
    distance_km: $distance_km
  }
}
// NYC (40.71, -74.01) to LA (34.05, -118.24)
// Returns: ~3935 km
```

### Find Nearby Locations

```xs
query "find-nearby" verb=GET {
  input {
    decimal lat { description = "User latitude" }
    decimal lon { description = "User longitude" }
    decimal radius_km?=10 { description = "Search radius in km" }
  }

  stack {
    // Get all locations
    db.query "locations" {} as $all_locations

    var $nearby { value = [] }

    foreach ($all_locations) {
      each as $location {
        util.geo_distance {
          latitude_1 = $input.lat
          longitude_1 = $input.lon
          latitude_2 = $location.latitude
          longitude_2 = $location.longitude
        } as $distance

        // Convert to km and check radius
        var $km { value = `$distance / 1000` }

        conditional {
          if ($km <= $input.radius_km) {
            var $with_distance {
              value = {
                id: $location.id,
                name: $location.name,
                distance_km: $km
              }
            }
            array.push $nearby { value = $with_distance }
          }
        }
      }
    }
  }

  response = {
    center: { lat: $input.lat, lon: $input.lon },
    radius_km: $input.radius_km,
    locations: $nearby
  }
}
```

### Delivery Distance Calculator

```xs
query "delivery-cost" verb=GET {
  input {
    decimal store_lat { description = "Store latitude" }
    decimal store_lon { description = "Store longitude" }
    decimal customer_lat { description = "Customer latitude" }
    decimal customer_lon { description = "Customer longitude" }
    decimal base_fee?=5 { description = "Base delivery fee" }
    decimal per_km?=1.5 { description = "Cost per km" }
  }

  stack {
    util.geo_distance {
      latitude_1 = $input.store_lat
      longitude_1 = $input.store_lon
      latitude_2 = $input.customer_lat
      longitude_2 = $input.customer_lon
    } as $meters

    var $km { value = `$meters / 1000` }
    var $delivery_fee { value = `$input.base_fee + ($km * $input.per_km)` }
  }

  response = {
    distance_km: $km,
    base_fee: $input.base_fee,
    distance_charge: `$km * $input.per_km`,
    total_delivery_fee: $delivery_fee
  }
}
```

### Distance with IP Lookup

```xs
query "distance-from-visitor" verb=GET {
  input {
    decimal dest_lat { description = "Destination latitude" }
    decimal dest_lon { description = "Destination longitude" }
  }

  stack {
    // Get visitor location
    util.ip_lookup {
      value = $request.ip
    } as $visitor_location

    util.geo_distance {
      latitude_1 = $visitor_location.location.latitude
      longitude_1 = $visitor_location.location.longitude
      latitude_2 = $input.dest_lat
      longitude_2 = $input.dest_lon
    } as $distance
  }

  response = {
    from: {
      city: $visitor_location.city.name,
      country: $visitor_location.country.name
    },
    to: { lat: $input.dest_lat, lon: $input.dest_lon },
    distance_km: `$distance / 1000`
  }
}
```

## Unit Conversion

The function returns **meters**. Common conversions:

| To | Formula |
|----|---------|
| Kilometers | `$meters / 1000` |
| Miles | `$meters / 1609.344` |
| Feet | `$meters * 3.28084` |

## Reference Distances

| Route | Approximate Distance |
|-------|---------------------|
| NYC to LA | ~3,935 km |
| London to Paris | ~344 km |
| Sydney to Melbourne | ~714 km |
| Tokyo to Osaka | ~402 km |

## Important Notes

1. **Returns meters** - Convert to km/miles as needed
2. **Great-circle distance** - Uses Haversine formula
3. **Earth assumption** - Assumes spherical Earth
4. **Coordinate format** - Use decimal degrees (not DMS)

## Test API Group

**API Group:** xs-util (ID: 269)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:3KzrYiuB`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| geo-distance | 2133 | Calculate coordinate distance | Working |

## Related Functions

- `util.ip_lookup` - Get coordinates from IP address
