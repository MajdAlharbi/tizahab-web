# Implementation Plan: Blur Standalone Map as Future Feature & Activate Real Map on Events Page

**Branch**: `003-blur-map-future` | **Date**: 2026-04-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-blur-map-future/spec.md`

## Summary

Three coordinated changes to the existing Django+Tailwind app:

1. Convert `/map/` into a polished "Coming Soon" page (blurred backdrop + bilingual overlay + CTA to `/daily-plan/`), and add a bilingual "Soon / قريباً" badge to the Map sidebar nav item.
2. Replace the blurred "Coming Soon" overlay on `/events/page/` with a real interactive Google Map — reusing the existing `TZMap.initMap` helper (`static/js/map.js`) and the `initEventsMap()` wiring in `static/js/events.js` that already targets `#eventsMap`. Pin set mirrors the currently visible (filtered/searched) event list; the map renders the first 50 pins, then shows a bilingual `Load more (N remaining)` button that appends the next batch without resetting the viewport. Filter/search changes reset the progressive-load state.
3. Fix the single failing test (`accounts.tests.UserPreferencesTests.test_set_valid_preferences`) by aligning its `interests` fixture with the current `VALID_INTERESTS` whitelist (`"food"` → `"restaurant"`).

No new dependencies, no schema changes, no new API endpoints. All data already reaches the client; all map plumbing already exists for `/daily-plan/`.

## Technical Context

**Language/Version**: Python 3.12 (Django 6.0), vanilla ES6 (browser)
**Primary Dependencies**: Django 6.0, Django REST Framework 3.16.1, django-tailwind 4.4.2, Google Maps JavaScript API (already loaded via `GOOGLE_MAPS_API_KEY` context processor for authenticated users)
**Storage**: SQLite (dev), PostgreSQL (prod) — untouched by this feature
**Testing**: Django `manage.py test` (88 tests today; target 88/88 green)
**Target Platform**: Modern desktop + mobile browsers, Django monolith served by gunicorn behind nginx in prod
**Project Type**: Web application (Django templates + vanilla JS frontend, DRF API)
**Performance Goals**: Map interactive within 3s of `/events/page/` load on broadband (SC-002); `/map/` overlay visible within 1s (SC-001)
**Constraints**: No new third-party JS; reuse existing `TZMap` helper; no Google Maps calls from `/map/` page; bilingual EN/AR via `nav-label-en` / `nav-label-ar` classes
**Scale/Scope**: ~953 places in dataset, DRF page size 50; initial map batch = 50 pins, incremental +50 per "Load more" click

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The repository's `.specify/memory/constitution.md` is the unedited placeholder template — no principles are ratified. No hard gates apply. Soft project conventions observed (and upheld by this plan):

- **Reuse before reinvention**: reuse `TZMap.initMap` and existing `initEventsMap()` rather than introducing a second map code path.
- **Bilingual parity**: every user-facing string is added in both EN and AR via existing classes.
- **Test cleanliness**: the failing test is fixed in the same change set so the suite stays 88/88 green.
- **No secrets in client of the Coming Soon page**: `/map/` must not emit the Google Maps script tag (FR-003 / SC-005).

**Status**: PASS (no violations; Complexity Tracking section left empty).

## Project Structure

### Documentation (this feature)

```text
specs/003-blur-map-future/
├── plan.md              # This file
├── spec.md              # Feature spec (existing)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── events-map-ui.md # Phase 1 output — UI contract for the events-page map
└── checklists/
    └── requirements.md  # From /speckit.specify
```

### Source Code (repository root)

Files touched by this feature (all already exist):

```text
templates/
├── map.html                     # Replace placeholder body with Coming Soon overlay; strip map container id
├── events_list.html             # Remove "Coming Soon" overlay; add "Load more (N)" button block
└── dashboard_base.html          # Add "Soon / قريباً" badge next to Map nav item (locate actual sidebar nav file if badge lives elsewhere)

static/js/
├── events.js                    # Extend initEventsMap(): batch of 50, Load-more handler, filter/search reset of pin state
└── map.js                       # (unchanged) — shared TZMap helper already handles missing API key

accounts/
└── tests.py                     # Fix test_set_valid_preferences: interests=["food",…] → ["restaurant",…]
```

**Structure Decision**: Existing Django app layout is retained; no new modules, no new apps, no new static files. All work is surgical edits to the four files above plus one test fixture. The map helper (`static/js/map.js`) already supports a graceful fallback (`renderMapFallback`) when `google.maps` is unavailable, satisfying FR-009 without new code.

## Complexity Tracking

> No constitution violations. Section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| —         | —          | —                                    |
