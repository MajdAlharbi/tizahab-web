# UI Contract: Events-Page Interactive Map

**Feature**: 003-blur-map-future
**Scope**: `/events/page/` map section only. Standalone `/map/` page has no interactive contract (see bottom of file).

## Container

- **DOM id**: `eventsMap` (unchanged — already wired in `static/js/events.js:351`)
- **Parent section**: "Map" card in `templates/events_list.html`
- **Required height**: 380 px (current layout value)
- **Overlay rule**: no element with `backdrop-blur` or `bg-white/50` may cover `#eventsMap`. The existing Coming Soon overlay (`templates/events_list.html:107-124`) MUST be deleted.

## Initial render

1. Script reads the currently-visible event list from the existing client-side cache used by the list rendering (same source the event cards render from).
2. Client filters to `hasValidCoords(event)`; events without lat/lng are silently skipped.
3. First `min(50, filtered.length)` events are pinned; viewport fits those bounds.
4. If `filtered.length > 50`, render the Load-more control described below.
5. If `window.google?.maps` is unavailable, delegate to `TZMap.renderMapFallback("eventsMap")` and hide the Load-more control.

## Pin info-window

Identical layout to the `/daily-plan/` map info-window. Minimum content:

- **Title** (event.title)
- **Category** badge (event.category, bilingual label when available)
- Optional link to event detail page (`/events/<id>/`) if such a link exists on the list cards

## Load-more control

**DOM**: placed directly below the map container, outside `#eventsMap`. Suggested id: `eventsMapLoadMore`.

**Label**:

| Language | Template | Example |
|---|---|---|
| EN | `Load more ({N} remaining)` | `Load more (412 remaining)` |
| AR | `تحميل المزيد ({N} متبقية)` | `تحميل المزيد (412 متبقية)` |

Uses the project's existing `nav-label-en` / `nav-label-ar` visibility pattern.

**Interaction**:

- **Visible when** `remaining > 0`.
- **Hidden when** `remaining === 0` (all filtered-with-coords events already pinned).
- **On click**: append next `min(50, remaining)` pins; DO NOT re-fit viewport; update label's `N`; disable button briefly while markers are added to avoid double-clicks.
- **Keyboard**: behaves as a standard `<button>` (Tab-focusable, Enter/Space activates).

## Filter / search coupling

Whenever the events list updates (category button, search input, sort change, pagination):

1. Clear all existing markers.
2. Recompute the filtered list.
3. Render fresh first batch (first 50).
4. Reset the Load-more counter.
5. Re-fit viewport to the new batch.

## Accessibility

- Map container is non-critical for keyboard users; list remains the primary interaction. Map info-windows mirror `/daily-plan/` behavior.
- Load-more button has visible focus ring (Tailwind default) and bilingual accessible text.
- No color-only state changes — the counter is the primary signal.

## Performance budget

| Metric | Target | Source |
|---|---|---|
| Map interactive after page load | ≤ 3 s (95th percentile, broadband) | SC-002 |
| Append latency after "Load more" click | ≤ 500 ms for a 50-pin batch | derived from SC-002 |
| Pin count on initial render | ≤ 50 | FR-007a |
| Memory growth per batch | ≤ ~2 MB heap (informal) | observation guard |

## Failure modes

| Scenario | Behavior |
|---|---|
| `google.maps` not loaded | `TZMap.renderMapFallback("eventsMap")`; hide Load-more button; no console error |
| Filtered list is empty | Map renders, viewport stays on Riyadh center (reuse `TZMap` default); Load-more hidden |
| All events missing coords | Same as empty filtered list |
| Click pin for deleted event | Info-window shows available cached fields; no server round-trip in this feature |

## Standalone `/map/` (Coming Soon) — non-interactive contract

For completeness, the `/map/` page has no interactive map contract:

- No `#mapPageMap` / `#eventsMap` / `#dailyPlanMap` element is rendered.
- No `static/js/map.js`, `events.js`, or `daily_plan_integration.js` is included.
- The overlay is a purely static Tailwind block using `backdrop-blur-sm bg-white/50` with a bilingual headline, description, and a CTA anchor `<a href="/daily-plan/">`.
- The sidebar nav item for Map stays visible and carries a small `Soon / قريباً` badge span.
