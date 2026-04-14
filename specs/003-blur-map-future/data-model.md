# Phase 1 Data Model: Blur Map & Activate Events Map

**Feature**: 003-blur-map-future
**Date**: 2026-04-13

No persistent schema changes. This feature is UI-only + one test fixture. The entities below describe **client-side state** and **existing server-side data being consumed**.

## Server-side entities (unchanged, reference only)

### Event (existing `events.Event`)

Fields consumed by the events-page map:

| Field | Type | Required for pin? | Notes |
|---|---|---|---|
| `id` | int | yes | Pin identity / click → detail link |
| `title` | string | yes | Info-window heading |
| `category` | string (enum) | yes | Info-window subtitle; drives category filter |
| `latitude` | float | **yes** | Pin is skipped if null |
| `longitude` | float | **yes** | Pin is skipped if null |
| `price` | float \| null | no | Optional info-window line |

No new field, no migration.

### UserPreferences.VALID_INTERESTS (existing whitelist)

Canonical list in `accounts/serializers.py:19-23`:
`restaurant, cafe, fast_food, dessert, bakery, juice, food_truck, shopping, culture, outdoor, other`.

The failing test fixture (`accounts/tests.py` → `test_set_valid_preferences`) must use values drawn exclusively from this list.

## Client-side state (new, scoped to the events page)

### EventsMapState

Held in a module-scoped closure inside `static/js/events.js` (no globals beyond existing `window.__TZ_EVENTS_MAP` style used today).

| Field | Type | Init | Meaning |
|---|---|---|---|
| `filteredEvents` | `Event[]` | `[]` | Events matching current filter+search that also have valid coords |
| `renderedCount` | `int` | `min(50, filteredEvents.length)` | How many pins are currently on the map |
| `markers` | `google.maps.Marker[]` | `[]` | Live marker references so we can clear them on filter change |
| `batchSize` | `int` (const) | `50` | Chunk size per Load-more click |
| `bounds` | `google.maps.LatLngBounds` | fresh | Re-fit only on filter reset, not on append |

### Derived values

- **remaining** = `filteredEvents.length - renderedCount`. Shown as `N` in the Load-more button label; button is hidden when `remaining === 0`.
- **showLoadMore** = `remaining > 0`.

### State transitions

```
Initial mount:
  filteredEvents ← currentVisibleList.filter(hasCoords)
  renderedCount  ← min(50, filteredEvents.length)
  markers        ← render pins for filteredEvents.slice(0, renderedCount)
  bounds.fit(markers)

On "Load more" click:
  renderedCount ← min(renderedCount + batchSize, filteredEvents.length)
  markers       ← markers.concat(render pins for new slice)
  (bounds NOT re-fit — viewport stable)

On filter / search / sort change:
  clear(markers)
  filteredEvents ← newVisibleList.filter(hasCoords)
  renderedCount  ← min(50, filteredEvents.length)
  markers        ← render pins for fresh slice
  bounds.fit(markers)  // re-fit on every filter change

On google.maps unavailable:
  delegate to TZMap.renderMapFallback(containerId)
  suppress Load-more button
```

### Validation / invariants

- `renderedCount ≤ filteredEvents.length` at all times.
- `markers.length === renderedCount` after every mutation.
- Every marker position has finite `lat` ∈ [-90, 90] and `lng` ∈ [-180, 180]; invalid coords are filtered out upstream, never rendered.
- No marker is created twice for the same `event.id` within a single filter epoch.

## `/map/` (Coming Soon) — no state

The standalone map page holds no client state. It is a static template render; no data flows in, no scripts mutate it.
