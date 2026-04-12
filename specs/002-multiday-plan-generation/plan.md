# Implementation Plan: Multi-Day Plan Generation with Backend Persistence

**Branch**: `002-multiday-plan-generation` | **Date**: 2026-04-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-multiday-plan-generation/spec.md`

## Summary

Extend the daily plan generation system to produce multi-day trip itineraries in a single backend request. The system reads `trip_duration` from user preferences, generates N consecutive daily plans with cross-day event uniqueness, geographic clustering per day, and category diversity within each day. All plans are saved atomically. A new `/generate-multiday/` endpoint handles full trip generation, while the existing `/generate/` endpoint gains exclusion support for single-day regeneration.

## Technical Context

**Language/Version**: Python 3.12  
**Primary Dependencies**: Django 6.0, Django REST Framework 3.16.1, SimpleJWT 5.5.1  
**Storage**: SQLite (dev), PostgreSQL (prod)  
**Testing**: Django TestCase + APIClient (existing pattern in `daily_plan/tests.py`)  
**Target Platform**: Web (Django server + vanilla JS frontend)  
**Project Type**: Web service (REST API + server-rendered templates)  
**Performance Goals**: Multi-day generation (up to 30 days) completes within 5 seconds  
**Constraints**: SQLite in dev (no concurrent writes — sequential generation), atomic transactions  
**Scale/Scope**: ~953 events in dataset, up to 30 days × 5 events = 150 events per trip

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file contains only placeholder template — no project-specific gates defined. Proceeding without violations.

**Post-Phase 1 re-check**: No violations. Design uses existing models (no new tables), existing patterns (DRF APIView, service functions), and existing test approach (Django TestCase).

## Project Structure

### Documentation (this feature)

```text
specs/002-multiday-plan-generation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Research decisions
├── data-model.md        # Phase 1: Data model documentation
├── quickstart.md        # Phase 1: Development quickstart
├── contracts/
│   └── api.md           # Phase 1: API endpoint contracts
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (files to modify)

```text
daily_plan/
├── services.py          # Add exclude_ids param + generate_multiday_plan()
├── views.py             # Add GenerateMultiDayPlanAPIView, modify GenerateDailyPlanAPIView
├── urls.py              # Register generate-multiday/ route
└── tests.py             # Add multi-day generation tests

static/js/
└── daily_plan_integration.js  # Migrate to single multi-day API call

staticfiles/js/
└── daily_plan_integration.js  # Mirror of static version
```

**Structure Decision**: No new directories or files created beyond the specs. All changes are modifications to existing files within the `daily_plan/` app and `static/js/` directory. This follows the existing Django app structure.

## Complexity Tracking

No constitution violations to justify. Design reuses all existing models, patterns, and infrastructure.

## Phase 2: Implementation Tasks

### Task 1: Extend `generate_recommendations()` with exclusion support (Backend)
**File**: `daily_plan/services.py`
**Changes**:
- Add `exclude_ids=None` parameter to `generate_recommendations()`
- Filter out excluded event IDs from candidates early (before scoring)
- No other logic changes — scoring, clustering, routing all preserved

### Task 2: Add `generate_multiday_plan()` orchestrator (Backend)
**File**: `daily_plan/services.py`
**Changes**:
- New function `generate_multiday_plan(user, start_date_str)` that:
  1. Reads `trip_duration` from `UserPreferences` (default 1)
  2. Loops N times, calling `generate_recommendations()` with accumulated `exclude_ids`
  3. Each iteration uses a unique seed (based on day index) for variety
  4. Maintains category diversity across days (Phase 1 of existing algorithm already ensures per-day diversity)
  5. Returns list of `(date, events_list)` tuples

### Task 3: Add `GenerateMultiDayPlanAPIView` (Backend)
**File**: `daily_plan/views.py`
**Changes**:
- New `APIView` class handling `POST /api/daily-plan/generate-multiday/`
- Validates `start_date` (required, not past, valid format)
- Calls `generate_multiday_plan()`
- Wraps save in `transaction.atomic()`: deletes existing plans from start_date onward, creates new DailyPlan records, sets events
- Returns array of plans with events

### Task 4: Add exclusion support to existing generate endpoint (Backend)
**File**: `daily_plan/views.py`
**Changes**:
- Modify `GenerateDailyPlanAPIView.post()` to accept optional `exclude_plan_dates`
- When provided, fetch events from user's plans on those dates → pass as `exclude_ids`

### Task 5: Register new URL route (Backend)
**File**: `daily_plan/urls.py`
**Changes**:
- Add `path("generate-multiday/", GenerateMultiDayPlanAPIView.as_view(), name="daily-plan-generate-multiday")`

### Task 6: Add tests for multi-day generation (Backend)
**File**: `daily_plan/tests.py`
**Changes**:
- Test `generate_multiday_plan()` service: happy path, cross-day uniqueness, event distribution
- Test `GenerateMultiDayPlanAPIView`: request/response contract, validation, atomicity
- Test single-day regeneration with `exclude_plan_dates`
- Test cleanup of excess plans when trip_duration shortened

### Task 7: Update frontend to use multi-day endpoint (Frontend)
**File**: `static/js/daily_plan_integration.js`
**Changes**:
- Replace `generateAllDays()` loop of N sequential API calls with single `POST /api/daily-plan/generate-multiday/`
- Parse response array and populate `multiDayPlans` from response
- Add "regenerate day" button that calls existing `/generate/` with `exclude_plan_dates`
- Copy updated file to `staticfiles/js/daily_plan_integration.js`
