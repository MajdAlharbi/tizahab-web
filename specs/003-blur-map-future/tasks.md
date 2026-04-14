# Tasks: Blur Standalone Map as Future Feature & Activate Real Map on Events Page

**Feature**: 003-blur-map-future
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Contract**: [contracts/events-map-ui.md](./contracts/events-map-ui.md)

**Total tasks**: 13 · **MVP scope**: User Story 1 (`/map/` Coming Soon) — smallest visible fix users encounter first.

---

## Phase 1 — Setup

No project scaffolding needed; this is a surgical edit across existing files. Phase is intentionally empty.

---

## Phase 2 — Foundational (blocking prerequisites)

No shared foundation work needed. Each user story is independent and touches disjoint files (except for a shared glance at `dashboard_base.html`, which is already in the expected state).

- [x] T001 Verify dev environment: `.venv` active, `python manage.py runserver` boots, `/map/`, `/events/page/`, `/daily-plan/` all load without errors in the current branch. File: none (smoke check only).
- [x] T002 Verify the sidebar "Soon/قريباً" badge is already present at `templates/dashboard_base.html:107-110`; if the badge has been removed by a rebase, re-add it per FR-004a (the existing span uses `nav-label-en` / `nav-label-ar` and amber pill styling).

---

## Phase 3 — User Story 1 (P1): `/map/` Coming Soon page

**Goal**: Replace the empty placeholder grid at `/map/` with a polished blurred "Coming Soon" state that matches the visual pattern already in use on the events page, in both EN and AR.

**Independent test**: Visit `/map/` as an authenticated user → blurred backdrop visible within 1 s, bilingual "Interactive Map — Coming Soon!" headline and short description rendered, CTA button navigates to `/daily-plan/`, DevTools Network tab shows **zero** requests to `maps.googleapis.com` (SC-001, SC-005).

- [x] T003 [US1] Rewrite the `{% block content %}` of `templates/map.html` to render the Coming Soon overlay: an outer container with a blurred gradient/placeholder background (reuse the gradient already in the current template), overlaid by an absolute-positioned block styled `absolute inset-0 backdrop-blur-sm bg-white/50 flex flex-col items-center justify-center gap-4 z-10` containing the 🗺️ icon, bilingual `Interactive Map — Coming Soon!` / `خريطة تفاعلية — قريباً!` headline, short bilingual description, and a `Plan Your Trip Instead → / ← خطط لرحلتك بدلاً من ذلك` anchor with `href="/daily-plan/"`. Keep the existing page header + filter buttons visible above the overlay section.
- [x] T004 [US1] Remove the fake SVG grid pattern (`<svg … #grid`) from `templates/map.html`; the blurred gradient behind the overlay is enough visual placeholder.
- [x] T005 [US1] Confirm `templates/map.html` does **not** include `static/js/events.js`, `static/js/daily_plan_integration.js`, or a `<script src="https://maps.googleapis.com/…">` tag (directly or via a `{% block extra_js %}`). If any of them get pulled in transitively by `dashboard_base.html` script blocks, override the relevant block in `map.html` to emit nothing. Verify via DevTools that no request hits `maps.googleapis.com`.
- [x] T006 [US1] Language toggle verification (manual): switch the site to Arabic and confirm headline, description, and CTA all swap to Arabic copy; switch back to English and confirm the reverse. File: none (walkthrough of `/map/`).

---

## Phase 4 — User Story 2 (P1): Activate the events-page map with progressive load

**Goal**: Replace the blurred "Coming Soon" overlay on `/events/page/` with a real interactive Google Map that mirrors the behavior of the `/daily-plan/` map; render the first 50 pins and offer a bilingual "Load more (N remaining)" button for the rest. Pins track the currently-visible filtered/searched list.

**Independent test**: Load `/events/page/` with a valid `GOOGLE_MAPS_API_KEY` → map tile layer renders within 3 s; ≤50 pins on first render; clicking a pin opens an info-window with title + category; changing category filter or search clears markers and re-renders the first 50 for the new filtered set; `Load more (N remaining)` appears when filtered list > 50 and, on click, appends the next batch **without re-fitting the viewport**; counter decrements and disappears at 0 (SC-002, SC-003).

- [x] T007 [US2] Delete the `<!-- Coming Soon overlay -->` block and its children (currently `templates/events_list.html:106-125`) so the `#eventsMap` container at `templates/events_list.html:100-105` is no longer covered. Keep the surrounding `<section class="space-y-3">` + heading + height-380 wrapper intact.
- [x] T008 [P] [US2] Immediately after the map container's closing tag (new line ~105 after T007), add a `<div>` holding the Load-more button: an element with id `eventsMapLoadMore` that is `hidden` by default, containing a `<button type="button">` with two spans (`nav-label-en` showing `Load more (<span id="eventsMapLoadMoreCount">0</span> remaining)` and `nav-label-ar hidden` showing `تحميل المزيد (<span id="eventsMapLoadMoreCountAr">0</span> متبقية)`), styled with existing brand pill Tailwind classes (mirror the `/daily-plan/` "Plan Your Trip Instead" CTA styling for visual consistency).
- [x] T009 [US2] Extend `static/js/events.js::initEventsMap()` (current implementation starts near line 349) to support progressive loading per data-model.md §EventsMapState:
  1. Introduce closure-scoped state: `filteredEvents`, `renderedCount`, `markers`, `batchSize = 50`, `bounds`.
  2. Extract pin-creation into `function renderBatch(fromIndex, toIndex)` that appends `google.maps.Marker`s, attaches the shared `InfoWindow` already used in the file, and pushes into `markers`. Do NOT call `bounds.extend` after initial render (viewport stays stable on append).
  3. Replace the current "render all pins once" path with: compute `filteredEvents = currentVisibleEvents.filter(hasLatLng)`, set `renderedCount = Math.min(50, filteredEvents.length)`, call `renderBatch(0, renderedCount)`, `bounds.fit(...)` once.
  4. Add `function updateLoadMoreUi()` that toggles the `#eventsMapLoadMore` container's `hidden` attribute based on `remaining = filteredEvents.length - renderedCount`, and writes `remaining` into both `#eventsMapLoadMoreCount` and `#eventsMapLoadMoreCountAr`.
  5. Wire the button's `click` handler: `renderedCount = Math.min(renderedCount + batchSize, filteredEvents.length); renderBatch(oldRenderedCount, renderedCount); updateLoadMoreUi();` — temporarily disable the button while appending to prevent double-fire, re-enable after.
  6. Expose a small `resetEventsMap(newVisibleEvents)` function that clears `markers` (`markers.forEach(m => m.setMap(null)); markers.length = 0;`), recomputes `filteredEvents`, resets `renderedCount` to `Math.min(50, filteredEvents.length)`, calls `renderBatch(0, renderedCount)`, re-fits bounds, and calls `updateLoadMoreUi()`.
- [x] T010 [US2] In `static/js/events.js`, locate every place where category filter, search input, sort, or pagination change triggers a re-render of the event cards (there is an existing `applyFilters` / `renderEvents`-style function — find by searching for `renderEvents` or category button handlers). After the card list is re-rendered, call the new `resetEventsMap(currentFilteredEvents)` exposed from T009 so pin set, counter, and viewport all resynchronize.
- [x] T011 [US2] Confirm that when `window.google?.maps` is unavailable, `TZMap.initMap` returns falsy and `initEventsMap` already short-circuits (current code path at `static/js/events.js:360` — `if (!map || !window.google || !google.maps) return;`). Extend that early-return to also call `document.getElementById('eventsMapLoadMore')?.setAttribute('hidden', '');` so the Load-more button never shows in fallback state (FR-009).

---

## Phase 5 — User Story 3 (P2): Fix the failing preferences test

**Goal**: Bring the test suite back to 88/88 passing by aligning the one stale test fixture with the current `VALID_INTERESTS` whitelist.

**Independent test**: `python manage.py test accounts.tests.UserPreferencesTests` → all tests pass; `python manage.py test` → `Ran 88 tests … OK`, 0 failures, 0 errors (SC-004).

- [x] T012 [US3] In `accounts/tests.py` at `test_set_valid_preferences` (around line 127), change the posted `interests` list from `["food", "culture"]` to `["restaurant", "culture"]` (both values are in `UserPreferencesSerializer.VALID_INTERESTS`). Update the subsequent assertion at line 141 accordingly: `self.assertEqual(pref.interests, ["restaurant", "culture"])`. Do **not** modify `accounts/serializers.py`.

---

## Phase 6 — Polish & cross-cutting

- [x] T013 Run the full suite and manual checklist per `quickstart.md`: `python manage.py test` must print `Ran 88 tests … OK` with 0 failures; manually walk `/map/`, `/events/page/`, and `/daily-plan/` in both EN and AR, verifying every item in the quickstart "Manual verification checklist" section. File: none (validation gate).

---

## Dependencies & execution order

```
Phase 2 (T001–T002)   ─┐
                       ├─→ Phase 3 (T003 → T004 → T005 → T006)   ┐
                       ├─→ Phase 4 (T007 → T008 ∥ T009 → T010 → T011) ┤→ Phase 6 (T013)
                       └─→ Phase 5 (T012)                         ┘
```

- **Phase 3 (US1)**, **Phase 4 (US2)**, and **Phase 5 (US3)** are mutually independent — they touch disjoint files.
- **Within Phase 4**: T008 (template) and T009 (JS, new functions) can run in parallel. T010 depends on T009 (calls `resetEventsMap`). T011 depends on T008 (references `#eventsMapLoadMore`).
- **Within Phase 3**: T003 → T004 → T005 are sequential (same file); T006 is a pure verification walk.
- **T013** depends on all prior phases.

## Parallel execution examples

- **US1 in isolation** (one developer, fastest MVP): run `T003 → T004 → T005 → T006` back-to-back; ship as its own commit and PR.
- **US2 in parallel**: after T007, a dev can work T008 (template button) and T009 (JS state machine) on two worktrees/branches and merge before T010.
- **US3 can run any time**: T012 is a two-line test fixture change, safe to commit independently.

## Independent test criteria (summary)

| Story | Criterion |
|---|---|
| US1 | `/map/` renders blurred Coming Soon overlay in EN+AR within 1 s; zero Google Maps network requests; CTA navigates to `/daily-plan/`. |
| US2 | `/events/page/` map is interactive in ≤3 s; ≤50 pins initial; Load-more appears with correct `N`, appends without moving viewport, disappears at 0; filter/search resets pin set and counter. |
| US3 | `python manage.py test` → 88/88 pass. |

## Implementation strategy

1. **Ship US1 first** as the MVP — smallest change, removes the most visible defect (empty grid page) and requires no API key to validate.
2. **Ship US3 next** (two-line test fix) to restore a green baseline so US2 work ships against a clean suite.
3. **Ship US2 last** — most code, needs manual browser validation with a real `GOOGLE_MAPS_API_KEY`.
4. Final validation step (T013) gates merge to `dev`.

## Format validation

Every task above uses the required format `- [ ] T### [P?] [US?] Description with file path`:

- ✅ All 13 tasks start with `- [ ]` checkbox and a sequential ID (T001…T013).
- ✅ User-story-phase tasks (T003–T012) all carry a `[US1]` / `[US2]` / `[US3]` label.
- ✅ Setup / Polish tasks (T001, T002, T013) correctly omit the story label.
- ✅ `[P]` is applied only to T008 (parallelizable with T009 inside US2).
- ✅ Every task references a concrete file path (or explicitly says "none — validation").
