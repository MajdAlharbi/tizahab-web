# Feature Specification: Blur Standalone Map as Future Feature & Activate Real Map on Events Page

**Feature Branch**: `003-blur-map-future`
**Created**: 2026-04-13
**Status**: Draft
**Input**: User description: "i want map in http://127.0.0.1:8000/map/ to be like this map blured as future feature http://127.0.0.1:8000/events/page/ and run test for all app and tell me what should be fixen" + follow-ups: "in /daily-plan/ map i want it to be used in events page, currently [events] one is not working" and "i want it to be working as daily-plan one".

## Clarifications

### Session 2026-04-13

- Q: For the `/map/` Coming Soon page, how should the dashboard's Map nav item be treated? → A: Keep the Map nav item and add a small "Soon" / "قريباً" badge next to it (bilingual).
- Q: What data source drives the events-page map pins? → A: Pins mirror the currently visible (filtered/searched) event list and update reactively when the filter or search changes.
- Q: How should the events-page map handle pin volume given the ~953-place dataset? → A: Render the first 50 pins by default; show a "Load more (N remaining)" button (bilingual) that appends the next batch, displaying how many events are still unloaded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Standalone Map page shown as a future feature (Priority: P1)

A visitor navigates to `/map/` from the dashboard sidebar. Instead of seeing an empty placeholder grid, they see a visually blurred map preview with a "Coming Soon" overlay and a call-to-action to plan a trip instead. This signals that a full interactive map is planned but not yet available, while still letting users reach the working parts of the product.

**Why this priority**: The `/map/` route is linked from the dashboard navigation; today it renders an obviously empty grid which looks broken. Turning it into a polished "future feature" state is the highest-value, lowest-risk change and removes a visible defect immediately.

**Independent Test**: Visit `/map/` as an authenticated user. Confirm the page shows a blurred background, a "Coming Soon" headline (EN + AR), explanatory copy, and a CTA linking to `/daily-plan/`. No JavaScript map initialization errors occur in the console.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the dashboard, **When** they click the Map nav item, **Then** the `/map/` page loads with a blurred backdrop and a clearly visible "Interactive Map — Coming Soon!" message in the user's current language (English or Arabic).
2. **Given** the user sees the Coming Soon overlay, **When** they click the "Plan Your Trip Instead" CTA, **Then** they are taken to `/daily-plan/`.
3. **Given** the page is rendered, **When** the DOM settles, **Then** no script attempts to call an external map provider from this page and no map-related errors are logged to the browser console.

---

### User Story 2 — Working interactive map on the Events page (Priority: P1)

A user on `/events/page/` scrolls to the "Map" section and sees a fully functional interactive map of Riyadh with place pins, matching the behavior already present on `/daily-plan/`. Clicking a pin shows place details (title, category, location). The current blurred "Coming Soon" overlay on the events page is removed.

**Why this priority**: The events page is the primary discovery surface. Its map is currently masked by a placeholder even though an equivalent working implementation already ships on `/daily-plan/`, so users perceive a regression. Reusing the working implementation is a direct, high-value fix.

**Independent Test**: Load `/events/page/` as an authenticated user with a Google Maps API key configured. Confirm the map tile layer renders, pins appear for events visible in the list, and clicking a pin opens a details popup. No "Coming Soon" overlay is shown.

**Acceptance Scenarios**:

1. **Given** the Google Maps API key is configured and the user is authenticated, **When** `/events/page/` loads, **Then** the map section displays an interactive map centered on Riyadh with pins for the loaded events and no blurred overlay.
2. **Given** the map is visible, **When** the user clicks any pin, **Then** a popup/info window shows the place's title and key details consistent with the `/daily-plan/` map.
3. **Given** the events list is filtered (category/search), **When** the visible event set changes, **Then** the map pins update to match the filtered set.
4. **Given** the Google Maps API key is missing or fails to load, **When** the page renders, **Then** the map area degrades gracefully to a static message instead of a broken/blank frame.

---

### User Story 3 — Fix broken preferences API test (Priority: P2)

The project-wide test suite currently fails on one test (`accounts.tests.UserPreferencesTests.test_set_valid_preferences`). The test posts `interests: ["food", "culture"]` but the serializer's `VALID_INTERESTS` list no longer contains the legacy `"food"` value (food has been split into `restaurant`, `cafe`, `fast_food`, `dessert`, `bakery`, `juice`, `food_truck`). Either the test fixture or the serializer whitelist must be aligned so the suite is green again.

**Why this priority**: CI reliability. This is the only failing test out of 88; fixing it restores a clean baseline that later work can depend on.

**Independent Test**: Run `python manage.py test accounts.tests.UserPreferencesTests`. The suite passes without modifying any unrelated test.

**Acceptance Scenarios**:

1. **Given** the current serializer interest whitelist, **When** the test posts a valid set of interests drawn from that whitelist, **Then** the preferences endpoint responds with 200 or 201 and the record is persisted.
2. **Given** the full suite is executed (`python manage.py test`), **When** it completes, **Then** 88/88 tests pass with zero failures and zero errors.

---

### Edge Cases

- Arabic language mode must show Arabic copy for the Coming Soon overlay and Arabic info-window labels on the events-page map.
- If the dataset returns events without valid latitude/longitude, those events are skipped on the map (no broken pin, no console error).
- If the Google Maps API key is absent (e.g., unauthenticated user or missing env var), the events-page map shows a neutral fallback instead of a blank grey box.
- If the user has no events in the current filter, the map renders centered on Riyadh with zero pins rather than erroring.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `/map/` page MUST display a blurred background with a prominent "Coming Soon" overlay, visually consistent with the existing coming-soon pattern on the events page (centered icon, bilingual headline, short description, CTA button).
- **FR-002**: The `/map/` page overlay MUST include a CTA that navigates the user to `/daily-plan/`.
- **FR-003**: The `/map/` page MUST NOT load or initialize any external map provider script, so it causes no network calls, no console errors, and no exposure of the Google Maps API key.
- **FR-004**: The `/map/` page MUST render copy in both English and Arabic using the existing `nav-label-en` / `nav-label-ar` mechanism.
- **FR-004a**: The dashboard sidebar MUST keep the Map nav item visible and MUST show a small "Soon" (EN) / "قريباً" (AR) badge next to it, so users can still discover the upcoming feature without being misled about its availability.
- **FR-005**: The `/events/page/` map section MUST render an interactive map with the same behavior and appearance as the map on `/daily-plan/` (same tile provider, same pin style, same info-window layout).
- **FR-006**: The `/events/page/` MUST remove the existing "Coming Soon" blurred overlay from the map region.
- **FR-007**: The events-page map MUST show one pin per event from the **currently visible (filtered/searched) list** that has valid coordinates. When the user changes filters, search terms, or pagination, the map's pin set MUST update reactively to match the visible list without a full page reload.
- **FR-007a**: The events-page map MUST render at most 50 pins on initial load. When additional matching events exist beyond the first 50, the map MUST display a bilingual "Load more (N remaining)" / "تحميل المزيد (N متبقية)" button where N is the exact count of not-yet-rendered events. Clicking the button MUST append the next batch (up to 50 more) without discarding already-rendered pins or resetting the map viewport.
- **FR-007b**: When the user changes filters or search terms, the pin set and the "Load more" counter MUST be recomputed from the new filtered list (the progressive-load state resets to a fresh first 50).
- **FR-008**: Clicking a pin on the events-page map MUST open a popup with at least the place's title and category, matching the daily-plan map's info-window contents.
- **FR-009**: If the Google Maps API key is unavailable, the events-page map area MUST show a neutral fallback message instead of a blank or broken frame; no uncaught errors reach the console.
- **FR-010**: The failing test `accounts.tests.UserPreferencesTests.test_set_valid_preferences` MUST pass, by aligning the test's interest values with the serializer's current whitelist (or vice versa — whichever is correct per product intent).
- **FR-011**: After changes, `python manage.py test` MUST report 88/88 passing with zero failures and zero errors.

### Key Entities

- **Map Placeholder (Future Feature)**: The visual state shown at `/map/`; conveys "planned, not yet available," offers a redirect to working functionality.
- **Events Map**: An interactive geographic view of places currently visible on the events page; sources its data from the same event list rendered in the page's cards.
- **Event (existing)**: Must provide latitude/longitude to be plottable; events without coordinates are excluded from the map without error.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of visits to `/map/` render the Coming Soon overlay within 1 second of page load, with no console errors.
- **SC-002**: On `/events/page/`, the map becomes interactive (pins clickable) within 3 seconds of page load on a standard broadband connection, for at least 95% of loads.
- **SC-003**: Every event in the currently-loaded pin batch has valid coordinates and is represented by exactly one pin (0 duplicates, 0 missing). The "Load more" counter always equals `visible_filtered_total − currently_rendered_pins` and reaches 0 once all visible events are loaded.
- **SC-004**: `python manage.py test` reports 88 passed / 0 failed / 0 errors after the fix.
- **SC-005**: Zero external map-provider requests originate from `/map/` (verified by network panel).
- **SC-006**: Both English and Arabic language modes pass a manual walkthrough of `/map/` and `/events/page/` with all user-facing copy correctly translated.

## Assumptions

- The `/daily-plan/` map is the reference implementation; its initialization logic, pin rendering, and info-window template will be reused rather than rewritten.
- The Google Maps API key is already exposed to authenticated users via the existing `GOOGLE_MAPS_API_KEY` context processor and does not need to be re-plumbed.
- The events page already has access to the list of events being displayed client-side, so the map can consume the same data source without a new API endpoint.
- The Coming Soon visual style on `/map/` mirrors the existing pattern in `templates/events_list.html` (backdrop-blur, white/50 overlay, 🗺️ icon, bilingual headline, CTA button) so no new design review is required.
- For the failing preferences test, the correct resolution is to update the test fixture to use interests from the current whitelist; the serializer taxonomy is considered authoritative.
- Mobile-specific layout tuning for the map is out of scope for this feature; existing responsive container rules are assumed sufficient.

## Test Suite Baseline (run at spec time)

Running `python manage.py test` on branch `dev` at 2026-04-13:

- **Total**: 88 tests — **87 passed, 1 failed, 0 errors**
- **Failure**: `accounts.tests.UserPreferencesTests.test_set_valid_preferences` — posts `interests=["food", "culture"]`; endpoint returns **HTTP 400** because `"food"` is not in `UserPreferencesSerializer.VALID_INTERESTS` (current whitelist: `restaurant, cafe, fast_food, dessert, bakery, juice, food_truck, shopping, culture, outdoor, other`). Test expects 200/201.
- **Recommended fix**: change the test payload to `interests=["restaurant", "culture"]` (or another pair drawn from the current whitelist). This is test-fixture drift from the taxonomy change, not a product defect.
- **Runtime**: ~323 s (SQLite in-memory).
