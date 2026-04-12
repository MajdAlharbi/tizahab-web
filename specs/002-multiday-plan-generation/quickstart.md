# Quickstart: Multi-Day Plan Generation

**Feature**: 002-multiday-plan-generation  
**Date**: 2026-04-10

## Prerequisites

- Python 3.12, Django 6.0, DRF 3.16.1
- Virtual environment activated: `.venv\Scripts\activate`
- Database migrated: `python manage.py migrate`
- Data loaded: `python manage.py load_data`

## Files to Modify

### Backend (in order of implementation)

1. **`daily_plan/services.py`** — Core logic changes
   - Add `exclude_ids` parameter to `generate_recommendations()`
   - Add new `generate_multiday_plan(user, start_date_str)` orchestrator function
   - Orchestrator reads `trip_duration` from user preferences, loops N times, accumulates excluded event IDs

2. **`daily_plan/views.py`** — New endpoint + modify existing
   - Add `GenerateMultiDayPlanAPIView` class for `POST /api/daily-plan/generate-multiday/`
   - Modify `GenerateDailyPlanAPIView` to accept optional `exclude_plan_dates` parameter

3. **`daily_plan/urls.py`** — Register new endpoint
   - Add `path("generate-multiday/", ...)` 

4. **`daily_plan/tests.py`** — Test coverage
   - Tests for multi-day generation (happy path, edge cases)
   - Tests for single-day regeneration with exclusion
   - Tests for atomicity (transaction rollback)
   - Tests for cleanup of excess plans

### Frontend

5. **`static/js/daily_plan_integration.js`** — Migrate to new endpoint
   - Replace sequential single-day API calls with single multi-day endpoint call
   - Update `generateAllDays()` to call `/api/daily-plan/generate-multiday/`
   - Add single-day regeneration support (call existing endpoint with `exclude_plan_dates`)

6. **`staticfiles/js/daily_plan_integration.js`** — Mirror of static version (copy after changes)

## Development Workflow

```bash
# 1. Activate venv
.venv\Scripts\activate

# 2. Run existing tests (ensure nothing breaks)
python manage.py test daily_plan

# 3. Make backend changes (services → views → urls)
# 4. Run tests after each change
python manage.py test daily_plan

# 5. Make frontend changes
# 6. Manual test via browser at http://localhost:8000/daily-plan/

# 7. Run full test suite
python manage.py test

# 8. Lint
flake8 daily_plan --count --select=E9,F63,F7,F82 --show-source
```

## Key Implementation Notes

- No database migrations needed — all models already exist as required
- Use `django.db.transaction.atomic()` for the multi-day save operation
- The `generate_recommendations()` function already supports `seed` parameter for varied results across days
- Frontend currently makes N sequential API calls — the new endpoint replaces this with 1 call
- `staticfiles/` is the collected static files directory; update `static/` then run `collectstatic` or copy manually
