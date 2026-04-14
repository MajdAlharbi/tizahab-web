# Phase 0 Research: Blur Map & Activate Events Map

**Feature**: 003-blur-map-future
**Date**: 2026-04-13

No "NEEDS CLARIFICATION" markers remained after `/speckit.clarify`; this document records the small amount of investigative work needed to confirm that the planned approach is a true reuse rather than a rewrite.

## R-001 — Existing map helper coverage

**Question**: Is there already a shared map initializer that `/events/page/` and `/daily-plan/` both use, or do they each re-implement Google Maps?

**Decision**: Reuse `window.TZMap.initMap` from `static/js/map.js`. It is already called from both `static/js/daily_plan_integration.js:948` (`dailyPlanMap`) and `static/js/events.js:351` (`eventsMap`). The helper also enumerates a `mapPageMap` container id (`static/js/map.js:63`), which shows the standalone `/map/` page was originally intended to use it.

**Rationale**: Introducing a second code path would violate the "reuse before reinvention" soft principle in the plan and duplicate the fallback logic in `TZMap.renderMapFallback`, which already handles the missing-API-key case (FR-009).

**Alternatives considered**:
- Inline a small Leaflet map on the events page: rejected — adds a dependency, diverges from the `/daily-plan/` look & feel the user explicitly asked for, and cannot reuse existing info-window styling.
- Rewrite both maps under a new helper: rejected — out of scope; daily-plan map is working and untouched by this feature.

## R-002 — Why the events-page map currently "doesn't work"

**Question**: The user reported that the events-page map is not working. What is the actual state?

**Decision**: Wiring exists (`initEventsMap()` is defined in `static/js/events.js:349` and the script is loaded by `events_list.html`), but the map element is **covered** by the "Coming Soon" overlay div at `templates/events_list.html:107` (`absolute inset-0 backdrop-blur-sm bg-white/50 … z-10`). The overlay's `z-10` sits above the map canvas, and the `backdrop-blur-sm` masks whatever rendered beneath. Removing the overlay block unblocks the map without touching JavaScript.

**Rationale**: Confirms this is a template-only fix for the "real map on events page" part — no rendering bug to chase in JS.

**Alternatives considered**: None (direct observation from source).

## R-003 — Standalone `/map/` should not load Google Maps

**Question**: The current `templates/map.html` renders a fake gradient+SVG placeholder with no `mapPageMap` container and no script include. Does the shared helper try to initialize it anyway?

**Decision**: `static/js/map.js:63` iterates `["eventsMap", "dailyPlanMap", "mapPageMap"]` and calls `renderMapFallback` for each when `google.maps` is unavailable, but this is a no-op if the element is absent. The script is only included on dashboard pages that pull it in — `map.html` does not, so no Google Maps call is emitted from `/map/`. This already satisfies FR-003 / SC-005 in principle; the Coming Soon template just needs to remain script-free (we must not accidentally add the events or daily-plan JS bundles to it).

**Rationale**: Confirms the "no external map requests from `/map/`" requirement is cheap to keep — we only need to avoid regressing it.

**Alternatives considered**: None needed.

## R-004 — Nav badge location

**Question**: Where does the Map sidebar nav item live so we can attach a `Soon / قريباً` badge?

**Decision**: The sidebar is rendered from the dashboard layout partial (`dashboard_base.html` or an included `_sidebar`-style fragment). The badge will be a Tailwind span placed adjacent to the Map nav label, mirroring existing `nav-label-en` / `nav-label-ar` bilingual pattern. Exact file will be located during implementation via a grep for the Map nav entry; this is a template-only surgical edit with no downstream consequences.

**Rationale**: Low-risk cosmetic change; the exact partial does not affect plan viability.

**Alternatives considered**: Grey-out the nav item (rejected — less discoverable, didn't match user's accepted option B in clarifications).

## R-005 — Load-more behavior for the events map

**Question**: What is the expected interaction contract for "first 50 pins, then Load more (N remaining)"?

**Decision** (from Clarifications Q3):
- On each render cycle, compute `filtered = events.filter(hasValidCoords && matchesCurrentFilters)`.
- Render pins for `filtered.slice(0, renderedCount)` where `renderedCount` starts at `min(50, filtered.length)`.
- If `filtered.length > renderedCount`, show a button with label `Load more (N remaining)` / `تحميل المزيد (N متبقية)` where `N = filtered.length - renderedCount`.
- On button click: `renderedCount = min(renderedCount + 50, filtered.length)`; append the new pins without clearing existing markers and without re-fitting bounds.
- On any filter/search change: reset `renderedCount` to `min(50, filtered.length)`, clear existing markers, re-fit bounds.

**Rationale**: Matches FR-007a/FR-007b and SC-003; preserves the user's "don't jump around the map when I click Load more" expectation by skipping viewport re-fit on append.

**Alternatives considered**:
- Cluster markers via `@googlemaps/markerclusterer`: rejected — adds dependency; the user chose progressive load instead, which is simpler and gives explicit user control.
- Virtualize by viewport: rejected — overkill for 953 total points.

## Summary

All unknowns resolved using source observation and the clarifications already captured in the spec. Zero new dependencies, zero schema changes, zero new API endpoints. The plan is a template/overlay edit on `/map/`, an overlay-removal + 30-ish-line JS extension on `/events/page/`, a one-line nav badge, and a one-line test fixture change.
