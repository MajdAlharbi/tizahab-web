# Tasks: Multi-Day Plan Generation with Backend Persistence

**Input**: Design documents from `/specs/002-multiday-plan-generation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are included as they are part of the existing project workflow (existing test suite in `daily_plan/tests.py`).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — existing Django project with all models and infrastructure in place. No migrations required.

_No tasks — project is already set up with all required models, serializers, and test infrastructure._

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core service-layer change that ALL user stories depend on — adding exclusion support to the recommendation engine.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 Add `exclude_ids` parameter to `generate_recommendations()` in `daily_plan/services.py` — filter excluded event IDs from candidates list before scoring, default to empty set when not provided, preserve all existing behavior when `exclude_ids` is empty
- [x] T002 Add tests for `exclude_ids` parameter in `daily_plan/tests.py` — test that excluded events never appear in results, test that passing empty/None exclusion set preserves existing behavior, test with all candidates excluded returns empty list

**Checkpoint**: Foundation ready — `generate_recommendations()` now supports exclusion, all existing tests still pass

---

## Phase 3: User Story 1 - Generate a Multi-Day Trip Plan (Priority: P1) 🎯 MVP

**Goal**: Users generate a complete multi-day itinerary in a single action, with all plans saved atomically to the backend.

**Independent Test**: Set preferences with trip_duration=3, call `POST /api/daily-plan/generate-multiday/` with a start date, verify 3 daily plans created with distinct events across days.

### Implementation for User Story 1

- [x] T003 [US1] Implement `generate_multiday_plan(user, start_date_str)` orchestrator in `daily_plan/services.py` — reads `trip_duration` from `UserPreferences` (default 1), loops N times calling `generate_recommendations()` with accumulated `exclude_ids` and unique seeds per day, returns list of `(date_str, events_list)` tuples, handles None/empty preferences same as existing single-day
- [x] T004 [US1] Implement `GenerateMultiDayPlanAPIView` in `daily_plan/views.py` — new `APIView` handling `POST`, validates `start_date` (required, not past, valid ISO format), calls `generate_multiday_plan()`, wraps save in `transaction.atomic()` (delete existing plans from start_date onward for user, create DailyPlan records, set events), returns response per contracts/api.md
- [x] T005 [US1] Register new URL route in `daily_plan/urls.py` — add `path("generate-multiday/", GenerateMultiDayPlanAPIView.as_view(), name="daily-plan-generate-multiday")`
- [x] T006 [US1] Add tests for `generate_multiday_plan()` service in `daily_plan/tests.py` — test happy path with trip_duration=3 returns 3 date/events tuples, test cross-day event uniqueness (no event ID in more than one day), test default trip_duration=1 when preference not set, test returns None when no preferences, test with more days than available events distributes events without duplication
- [x] T007 [US1] Add tests for `GenerateMultiDayPlanAPIView` in `daily_plan/tests.py` — test successful multi-day creation returns 201 with correct response shape, test missing start_date returns 400, test past start_date returns 400, test invalid date format returns 400, test no preferences returns 400, test atomicity (plans saved all-or-nothing), test existing plans replaced on regeneration, test requires auth returns 401
- [x] T008 [US1] Add test for cleanup of excess plans in `daily_plan/tests.py` — create a 5-day trip, then regenerate with trip_duration=3, verify only 3 plans exist and days 4-5 are deleted

**Checkpoint**: At this point, User Story 1 should be fully functional — multi-day plans generated and saved atomically via API

---

## Phase 4: User Story 2 - Trip Duration Preference & View Results (Priority: P2)

**Goal**: Users can set trip_duration in preferences and view multi-day plan results organized chronologically in the frontend.

**Independent Test**: Set trip_duration=5 in preferences, generate a multi-day plan, verify the frontend displays 5 days with events.

### Implementation for User Story 2

- [x] T009 [US2] Update `generateAllDays()` in `static/js/daily_plan_integration.js` — replace the sequential N-call loop with a single `POST /api/daily-plan/generate-multiday/` call, parse response `plans` array into `multiDayPlans` object, update `_currentPlan` from first day, call `renderDaysBar()` and `renderPlanForDay(0)` on success
- [x] T010 [US2] Update error handling in `static/js/daily_plan_integration.js` — handle error responses from multi-day endpoint (400 no preferences, 404 no events, 500 server error), display appropriate user-facing messages
- [x] T011 [US2] Copy updated `static/js/daily_plan_integration.js` to `staticfiles/js/daily_plan_integration.js`

**Checkpoint**: Frontend now generates all days in one request, displays results chronologically, trip_duration preference drives day count

---

## Phase 5: User Story 3 - View Multi-Day Plan Results (Priority: P2)

**Goal**: Users see all generated days organized chronologically after generation, with each day showing its recommended places.

**Independent Test**: Generate a 3-day plan, verify the response and existing UI day bar shows all 3 days with events listed per day.

_Note: The existing `renderDaysBar()` and `renderPlanForDay()` functions in the frontend already support multi-day display. The backend list endpoint already returns all DailyPlan records. This story is primarily covered by Task T009 (frontend migration to multi-day endpoint). No additional tasks needed beyond Phase 4._

**Checkpoint**: Multi-day results viewable chronologically — already functional after Phase 4

---

## Phase 6: User Story 4 - Single-Day Regeneration with Cross-Day Uniqueness (Priority: P3)

**Goal**: Users can regenerate a single day's plan without affecting other days, with event uniqueness enforced against sibling days.

**Independent Test**: Generate a 3-day plan, regenerate Day 2 only, verify Day 2 has new events that don't duplicate Day 1 or Day 3 events, and Days 1/3 are unchanged.

### Implementation for User Story 4

- [x] T012 [US4] Modify `GenerateDailyPlanAPIView.post()` in `daily_plan/views.py` — accept optional `exclude_plan_dates` list from request body, when provided fetch events from user's existing DailyPlans on those dates, collect their event IDs, pass as `exclude_ids` to `generate_recommendations()`
- [x] T013 [US4] Add single-day regeneration support in `static/js/daily_plan_integration.js` — when regenerating a specific day (not full trip), call existing `POST /api/daily-plan/generate/` with `exclude_plan_dates` containing dates of all other days in the current trip, update only that day's entry in `multiDayPlans`
- [x] T014 [US4] Add tests for single-day regeneration in `daily_plan/tests.py` — test that `exclude_plan_dates` correctly excludes events from sibling plans, test regeneration of one day doesn't affect other days, test with no `exclude_plan_dates` preserves existing behavior
- [x] T015 [US4] Copy updated `static/js/daily_plan_integration.js` to `staticfiles/js/daily_plan_integration.js`

**Checkpoint**: Single-day regeneration works with cross-day uniqueness enforced

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all stories

- [x] T016 Run full test suite (`python manage.py test`) and fix any failures
- [x] T017 Run linter (`flake8 daily_plan --count --select=E9,F63,F7,F82 --show-source`) and fix violations
- [x] T018 Manual end-to-end test: set preferences with trip_duration=3, generate multi-day plan, verify 3 days display, regenerate single day, verify uniqueness
- [x] T019 Verify backward compatibility: set trip_duration=1, generate plan, verify identical behavior to pre-change single-day generation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **User Story 1 (Phase 3)**: Depends on Phase 2 (exclusion support in services)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (multi-day endpoint must exist for frontend to call)
- **User Story 3 (Phase 5)**: Covered by Phase 4 — no additional work
- **User Story 4 (Phase 6)**: Depends on Phase 2 (exclusion support), can run in parallel with Phase 3/4 on the backend side (T012, T014), but frontend tasks (T013) depend on Phase 4
- **Polish (Phase 7)**: Depends on all story phases complete

### Within Each User Story

- Service layer before view layer
- View layer before URL registration
- Backend before frontend
- Tests alongside or after implementation (not TDD — matches existing project pattern)

### Parallel Opportunities

- T006 and T007 (tests) can be written in parallel with T003/T004 (implementation) if following TDD
- T012 (backend single-day regen) can start as soon as Phase 2 is complete, in parallel with Phase 3
- T009 and T012 modify different sections of the same files but target different functions

---

## Parallel Example: Phase 3 (User Story 1)

```bash
# After T003 (service) is complete, these can run in parallel:
Task T004: "Implement GenerateMultiDayPlanAPIView in daily_plan/views.py"
Task T006: "Add tests for generate_multiday_plan() service in daily_plan/tests.py"

# After T004 + T005 are complete:
Task T007: "Add tests for GenerateMultiDayPlanAPIView in daily_plan/tests.py"
Task T008: "Add test for cleanup of excess plans in daily_plan/tests.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (`exclude_ids` support)
2. Complete Phase 3: User Story 1 (multi-day endpoint + tests)
3. **STOP and VALIDATE**: Test multi-day generation via API
4. Functional backend ready for frontend integration

### Incremental Delivery

1. Phase 2 → Foundational exclusion support ready
2. Phase 3 → Multi-day API works → Backend MVP!
3. Phase 4 → Frontend uses new endpoint → Full MVP!
4. Phase 6 → Single-day regeneration → Feature complete!
5. Phase 7 → Polish → Ship ready!

---

## Notes

- No database migrations needed — all models already exist
- `staticfiles/` is a copy of `static/` — always update `static/` first, then copy
- Existing tests in `daily_plan/tests.py` must continue to pass throughout
- Use `transaction.atomic()` for multi-day save — critical for data consistency
- SQLite dev limitation: no concurrent writes, but atomic transactions work fine
