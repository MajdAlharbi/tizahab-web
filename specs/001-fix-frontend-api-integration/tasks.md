# Tasks: Fix Frontend-API Integration

**Input**: Design documents from `/specs/001-fix-frontend-api-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted. Existing tests in `daily_plan/tests.py`, `events/tests.py`, `accounts/tests.py` should continue to pass.

**Organization**: Tasks grouped by user story. US4 (serializer fix) placed in Foundational phase as it is the root cause blocking US1 and US5.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — existing Django project. Verify current state.

- [x] T001 Run existing test suite to establish baseline (`python manage.py test`)
- [x] T002 Verify dev server starts and all pages load (`python manage.py runserver`)

---

## Phase 2: Foundational — Fix DailyPlan Serializer (US4, Priority: P1)

**Purpose**: Fix the root cause blocking US1 and US5. The `DailyPlanSerializer` returns event IDs instead of full objects. This MUST be fixed before any frontend work can be verified.

**Goal**: Daily plan list and detail API responses return full event objects (title, location, category, price, latitude, longitude) instead of integer IDs. Write operations still accept event IDs.

**Independent Test**: `GET /api/daily-plan/` returns events as objects with title/location/lat/lng fields, not integers.

- [x] T003 [US4] Update `DailyPlanSerializer` to use nested `EventSerializer(many=True, read_only=True)` for read and accept IDs for write via `to_internal_value` or overridden `create`/`update` in `daily_plan/serializers.py`
- [x] T004 [US4] Update existing daily plan tests to assert full event objects in list/detail responses in `daily_plan/tests.py`
- [x] T005 [US4] Verify `POST /api/daily-plan/generate/` still returns full event objects (already works — regression check) in `daily_plan/views.py`

**Checkpoint**: `GET /api/daily-plan/` and `GET /api/daily-plan/<id>/` now return full event objects. All existing tests pass.

---

## Phase 3: User Story 1 + User Story 5 — Generate and View Daily Plan with Map Markers (Priority: P1) MVP

**Goal**: Clicking "Generate Plan" calls the API, displays place cards, and shows map markers at correct coordinates. Revisiting the page on the same date loads the saved plan with full details.

**Independent Test**: Register user → set preferences → click Generate Plan → verify cards show title/location/price AND map shows correct number of markers.

### Implementation

- [x] T006 [US1] Verify `daily_plan_integration.js` correctly calls `POST /api/daily-plan/generate/` and renders returned event objects as cards in `static/js/daily_plan_integration.js`
- [x] T007 [US1] Verify the daily plan page loads existing plans via `GET /api/daily-plan/` and renders full event data (now that serializer is fixed) in `static/js/daily_plan_integration.js`
- [x] T008 [US1] Ensure "no preferences" case shows a clear message directing user to set preferences in `static/js/daily_plan_integration.js`
- [x] T009 [US5] Verify map markers are added from event latitude/longitude after data loads in `static/js/daily_plan_integration.js` and `static/js/map.js`
- [x] T010 [US5] Verify markers on Events page render correctly from API response data in `static/js/events.js`
- [x] T011 [US1] End-to-end browser verification: Generate Plan → cards appear → markers appear → revisit page → same plan loads

**Checkpoint**: Full generate-and-display flow works. Map markers appear at correct positions with info windows.

---

## Phase 4: User Story 2 — Profile Displays Real User Data (Priority: P1)

**Goal**: Profile page loads and displays actual user data (name, email, interests, budget) from the backend API.

**Independent Test**: Log in → visit Profile → verify email matches signup email and preferences match what was set.

### Implementation

- [x] T012 [US2] Verify Profile page JS calls `GET /api/auth/me/` and populates name/email fields in `templates/profile.html`
- [x] T013 [US2] Verify Profile page JS calls `GET /api/auth/preferences/` and displays interests and budget range in `templates/profile.html`
- [x] T014 [US2] Ensure unauthenticated users are redirected to login when accessing Profile in `templates/profile.html`
- [x] T015 [US2] Verify Profile page loads user's past daily plans from `GET /api/daily-plan/` in `templates/profile.html`

**Checkpoint**: Profile page displays real user data from backend. No static/mock data.

---

## Phase 5: User Story 3 — Settings Save to Backend (Priority: P1)

**Goal**: Settings page loads preferences from backend, saves interests/budget/language via `PUT /api/auth/preferences/`, and shows success/error feedback. Theme and notifications remain in localStorage.

**Independent Test**: Update interests in Settings → Save → refresh page → same interests load → generate plan → plan reflects new interests.

### Implementation

- [x] T016 [US3] Add backend preferences loading on Settings page init — call `GET /api/auth/preferences/` and populate form fields in `templates/settings.html`
- [x] T017 [US3] Connect Save button to `PUT /api/auth/preferences/` for interests, budget_min, budget_max, and preferred_language in `templates/settings.html`
- [x] T018 [US3] Add success/error feedback UI after save (toast or inline message) in `templates/settings.html`
- [x] T019 [US3] Ensure theme and notification settings continue to use localStorage (no backend sync) in `templates/settings.html`
- [x] T020 [US3] Handle validation errors from backend (e.g., budget_min > budget_max) and display to user in `templates/settings.html`

**Checkpoint**: Preferences saved via Settings persist across page refreshes and browser sessions. Theme/notifications stay in localStorage.

---

## Phase 6: User Story 6 — Events Page Pagination (Priority: P2)

**Goal**: Events page displays first 50 events with a "Load More" button that appends the next page of results.

**Independent Test**: Load Events page → see 50 events + "Load More" button → click → 50 more events appear → continue until all loaded → button hides.

### Implementation

- [x] T021 [US6] Track `nextPageUrl` from paginated API response (`data.next`) in `static/js/events.js`
- [x] T022 [US6] Add "Load More" button to events list template in `templates/events_list.html`
- [x] T023 [US6] Implement click handler on "Load More" to fetch `nextPageUrl` and append results to existing event list in `static/js/events.js`
- [x] T024 [US6] Hide/disable "Load More" button when `data.next` is null (all events loaded) in `static/js/events.js`
- [x] T025 [US6] Ensure map markers are also added for newly loaded events in `static/js/events.js`

**Checkpoint**: Users can browse all 953 events via pagination. Map updates with each page load.

---

## Phase 7: User Story 7 — Recommendation Engine Scoring (Priority: P2)

**Goal**: Replace random event selection with scoring based on budget fit, category diversity, and recency avoidance.

**Independent Test**: Generate multiple plans for same user → results show category diversity and budget-appropriate selections. Previously recommended places are deprioritized.

### Implementation

- [x] T026 [US7] Implement `_score_event(event, budget_midpoint, recent_event_ids)` scoring function in `daily_plan/services.py`
- [x] T027 [US7] Query user's DailyPlan records from last 7 days to collect recently recommended event IDs in `daily_plan/services.py`
- [x] T028 [US7] Replace `order_by("?")` with scored selection: sort candidates by score, select top per category for diversity, fill remaining slots in `daily_plan/services.py`
- [x] T029 [US7] Update existing recommendation tests to verify category diversity and budget-aware ordering in `daily_plan/tests.py`

**Checkpoint**: Generated plans show category diversity and budget-aware ordering. Previously recommended places are deprioritized.

---

## Phase 8: User Story 8 — Favorites Persist to Backend (Priority: P3)

**Goal**: Create Favorite model and API endpoints. Migrate existing localStorage favorites to backend on first login. Profile page loads favorites from backend.

**Independent Test**: Favorite an event → refresh → favorite persists → check Profile → favorite listed → unfavorite → removed.

### Implementation

- [x] T030 [P] [US8] Create `Favorite` model with `unique_together = [["user", "event"]]` in `events/models.py`
- [x] T031 [US8] Run `python manage.py makemigrations events` and `python manage.py migrate` for Favorite model
- [x] T032 [P] [US8] Create `FavoriteSerializer` with nested `EventSerializer` for read in `events/serializers.py`
- [x] T033 [US8] Create favorite views: list (GET), add (POST), bulk add (POST), remove (DELETE) in `events/views.py`
- [x] T034 [US8] Register favorite URL routes at `/api/events/favorites/` and `/api/events/favorites/bulk/` and `/api/events/favorites/<int:event_id>/` in `events/api_urls.py`
- [x] T035 [US8] Update frontend favorite toggle to call `POST /api/events/favorites/` and `DELETE /api/events/favorites/<event_id>/` instead of localStorage in `static/js/events.js`
- [x] T036 [US8] Add localStorage-to-backend migration logic: on page load after login, POST `tizahab_favorites` IDs to bulk endpoint, then clear localStorage in `static/js/events.js`
- [x] T037 [US8] Update Profile page to load favorites from `GET /api/events/favorites/` instead of localStorage in `templates/profile.html`
- [x] T038 [US8] Handle unauthenticated favorite attempts — prompt user to log in in `static/js/events.js`

**Checkpoint**: Favorites persist to backend. localStorage migration works on first login. Profile shows backend-stored favorites.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all stories.

- [x] T039 Run full test suite and fix any regressions (`python manage.py test`)
- [x] T040 Run linting checks (`flake8 accounts events daily_plan core --count --select=E9,F63,F7,F82 --show-source`)
- [x] T041 [P] Run format check (`black --check accounts events daily_plan core`)
- [x] T042 Verify complete end-to-end flow in browser: Register → Set Preferences → Browse Events → Generate Plan → View on Map → Favorite a place → Check Profile
- [x] T043 [P] Verify error handling for expired JWT tokens (401 → redirect to login) across all API-connected pages
- [x] T044 [P] Verify Google Maps fallback when API key is missing or invalid

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — run immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 + US5 (Phase 3)**: Depends on Phase 2 (serializer fix)
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with Phase 3
- **US3 (Phase 5)**: Depends on Phase 2 — can run in parallel with Phases 3-4
- **US6 (Phase 6)**: Depends on Phase 2 — can run in parallel with Phases 3-5
- **US7 (Phase 7)**: Depends on Phase 2 — can run in parallel with Phases 3-6
- **US8 (Phase 8)**: Depends on Phase 2 — can run in parallel with Phases 3-7
- **Polish (Phase 9)**: Depends on all previous phases

### User Story Dependencies

- **US4 (Serializer)**: FOUNDATIONAL — blocks US1 and US5 directly
- **US1 + US5 (Plan + Map)**: Depend on US4 — tightly coupled (same JS file)
- **US2 (Profile)**: Independent — backend endpoints already work
- **US3 (Settings)**: Independent — backend endpoints already work
- **US6 (Pagination)**: Independent — backend already paginated
- **US7 (Scoring)**: Independent — internal service change
- **US8 (Favorites)**: Independent — new model + endpoints

### Within Each User Story

- Backend changes before frontend changes
- Model → Serializer → View → URL → Frontend JS
- Verify after each task

### Parallel Opportunities

- After Phase 2 (Foundational), Phases 3-8 can ALL run in parallel
- Within Phase 8: T030 and T032 can run in parallel (model and serializer in different files)
- Within Phase 9: T040, T041, T043, T044 can run in parallel

---

## Parallel Example: After Foundational Phase

```bash
# All user story phases can start simultaneously after Phase 2:
Phase 3: US1+US5 (daily_plan_integration.js, map.js)
Phase 4: US2 (profile.html)
Phase 5: US3 (settings.html)
Phase 6: US6 (events.js, events_list.html)
Phase 7: US7 (daily_plan/services.py)
Phase 8: US8 (events/models.py, events/views.py, events/api_urls.py)

# Within Phase 8 (Favorites):
Task: "Create Favorite model in events/models.py"        # T030
Task: "Create FavoriteSerializer in events/serializers.py" # T032
# These can run in parallel — different files, no dependencies
```

---

## Implementation Strategy

### MVP First (Phase 2 + Phase 3)

1. Complete Phase 1: Setup (verify baseline)
2. Complete Phase 2: Foundational (fix serializer — root cause)
3. Complete Phase 3: US1 + US5 (generate plan + map)
4. **STOP and VALIDATE**: Full plan generation flow works end-to-end
5. This alone fixes the most critical reported issues

### Incremental Delivery

1. Phase 2 → Serializer fixed → API returns correct data
2. Phase 3 → Generate Plan + Map works → Core value delivered (MVP!)
3. Phase 4 → Profile shows real data
4. Phase 5 → Settings save to backend → Preferences persist
5. Phase 6 → Pagination → All events browsable
6. Phase 7 → Better recommendations → Improved quality
7. Phase 8 → Favorites → Full feature set
8. Phase 9 → Polish → Production-ready

### Single Developer Strategy

Work phases sequentially in priority order: 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Each phase delivers independently testable value.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US4 is placed in Foundational (Phase 2) because it is the root cause fix that blocks US1 and US5
- US1 and US5 are combined into Phase 3 because they share the same JS files and are tightly coupled
- Most frontend "fixes" in Phases 3-5 may be verification-only tasks if the serializer fix resolves the data flow
- Commit after each phase completion
- Run `python manage.py test` after each phase to catch regressions
