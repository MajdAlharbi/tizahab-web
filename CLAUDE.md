# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tizahab is a Django REST Framework + TailwindCSS tourism planning platform for Riyadh. Users discover places (restaurants, museums, parks), set preferences (interests, budget, language), and generate personalized daily itineraries via a rule-based recommendation engine.

## Commands

### Development Setup
```bash
# Activate virtual environment (Windows)
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Database setup
python manage.py makemigrations
python manage.py migrate

# Import 953 Riyadh places (must run after migrate)
python manage.py load_data

# Wipe and re-import
python manage.py load_data --clear

# Run dev server
python manage.py runserver
```

### Testing
```bash
# Run all tests
python manage.py test

# Run specific test case
python manage.py test accounts.tests.LoginTestCase

# Run with coverage (pytest)
pytest --cov=accounts --cov=events --cov=daily_plan --cov=core --cov-report=html

# Single test module
python manage.py test daily_plan.tests
```

### Linting & Formatting
```bash
# Lint (CI checks only E9, F63, F7, F82 errors)
flake8 accounts events daily_plan core --count --select=E9,F63,F7,F82 --show-source

# Format check
black --check accounts events daily_plan core

# Security scan
bandit -r accounts events daily_plan core
```

### Docker (Production-like)
```bash
docker compose up --build
# Services: web (8000), db (postgres:5432), redis (6379), nginx (80)
```

### Production
```bash
export DJANGO_SETTINGS_MODULE=config.settings_production
python manage.py collectstatic --noinput
gunicorn config.wsgi:application --bind 0.0.0.0:8000
```

## Architecture

### Django Apps

- **`config/`** — Project settings, URL root, WSGI/ASGI, logging config. Dev uses SQLite; production uses `settings_production.py` with PostgreSQL + Redis (SQLite is explicitly rejected in production).
- **`accounts/`** — JWT auth (signup/login via SimpleJWT), `UserPreferences` model (interests as JSONField, budget_min/max, preferred_language). Password reset uses `django.core.signing.TimestampSigner` with a 1-hour token.
- **`events/`** — `Event` model (category, date, price, lat/lng). Two API views: `EventListAPIView` (filter by category/date/search) and `FilteredEventsAPIView` (filters by user preferences + date range). Management command `load_data` imports from `riyadh_cleaned.json`.
- **`daily_plan/`** — `DailyPlan` model (user + date + M2M events, unique on user+date). `services.py` contains `generate_recommendations()` which filters events by user interests and budget (no date filtering — the dataset contains permanent places, not dated events).
- **`core/`** — Custom exception classes (`TizahahAPIException` subclasses), context processor injecting `GOOGLE_MAPS_API_KEY` (only for authenticated users).
- **`theme/`** — django-tailwind app for TailwindCSS compilation.

### Removed / Dead Code
- `itinerary/` — Removed from `INSTALLED_APPS`. Migration files remain to preserve DB migration state. The `itinerary_dailyplan` table is an orphan in the DB (safe to drop manually with `DROP TABLE itinerary_dailyplan;`).
- `services/` — Deleted (stubs that returned empty data).
- `events/services.py` — Deleted (unused mock loader).
- `daily_plan/google_places_service.py` — Deleted (never wired into recommendation flow).
- `load_data_once.py` — Replaced by `python manage.py load_data`.

### URL Structure

| Prefix | App |
|--------|-----|
| `/api/auth/` | `accounts.urls` — signup, login, preferences, password reset |
| `/api/events/` | `events.urls` — list (with search), filtered |
| `/api/daily-plan/` | `daily_plan.urls` — list/create, generate, detail (GET/PUT/DELETE) |
| `/events/` | Same `events.urls` (serves HTML pages too) |
| `/daily-plan/` | Template view for `daily_plan.html` |

### Authentication Flow

All API endpoints (except signup/login) require `Authorization: Bearer <access_token>`. Tokens: 15-minute access, 7-day refresh. Refresh via `POST /api/auth/token/refresh/`.

User queryset isolation is enforced in view-level `get_queryset()` — users only see their own `DailyPlan` records.

### Password Reset Flow

1. `POST /api/auth/ui/forgot-password/` — Submits email; generates a time-limited signed token via `TimestampSigner(salt='tizahab-password-reset')`.
2. Redirects to `/api/auth/ui/reset-password/<token>/`.
3. Token is validated (max age 1 hour) before the reset form is shown.
4. Always shows same message regardless of whether email exists (prevents user enumeration).

### Recommendation Engine

`daily_plan/services.py::generate_recommendations(user, date_str=None)`:
1. Requires `UserPreferences` with non-empty `interests` list; returns `None` if no preferences configured.
2. Filters `Event` by `category__in=interests`.
3. Applies `budget_min`/`budget_max` price filters with `OR price IS NULL` to include events without pricing data.
4. Returns up to 5 events as a list, or empty list `[]` if none match.
5. Returns `None` (not `[]`) specifically when user has no preferences — callers can distinguish the two cases.

Date is NOT used to filter events because the dataset contains permanent places (restaurants, parks, museums) that are always available.

### Event Price Data

Prices are assigned deterministically during `load_data` based on category:
- `food`: 20–150 SAR
- `culture`: 0–50 SAR
- `outdoor`: 0 SAR (free)
- `shopping`: 0 SAR (no entry fee)

The price for each place is `base + abs(hash(title)) % spread`, giving variety without randomness.

### Settings & Environment

`.env` is loaded manually in `config/settings.py` (no `python-dotenv` library — uses `os.environ.setdefault`). Copy `.env.example` to `.env` before first run. Key variables: `DJANGO_SECRET_KEY`, `GOOGLE_MAPS_API_KEY`, `DB_ENGINE`, Redis/email settings.

Pagination is set to 50 items per page via `REST_FRAMEWORK["PAGE_SIZE"]`. Override per-view with `?page=N`.

### Event Date Fields

`Event` has three date fields: `date` (required, set to import time for all current data), `start_date`, `end_date` (optional). Queries in `FilteredEventsAPIView` and `EventListAPIView` handle both patterns — events with `start_date`/`end_date` populated and events with only `date` field.

## Commit Convention

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code refactoring
- `docs:` — documentation
- `test:` — test changes

## Active Technologies
- Python 3.12, Django 6.0, JavaScript (vanilla ES6) + Django REST Framework 3.16.1, SimpleJWT 5.5.1, django-tailwind 4.4.2 (001-fix-frontend-api-integration)
- SQLite (dev), PostgreSQL (prod via dj-database-url) (001-fix-frontend-api-integration)
- Python 3.12 + Django 6.0, Django REST Framework 3.16.1, SimpleJWT 5.5.1 (002-multiday-plan-generation)
- SQLite (dev), PostgreSQL (prod) (002-multiday-plan-generation)
- Python 3.12 (Django 6.0), vanilla ES6 (browser) + Django 6.0, Django REST Framework 3.16.1, django-tailwind 4.4.2, Google Maps JavaScript API (already loaded via `GOOGLE_MAPS_API_KEY` context processor for authenticated users) (003-blur-map-future)
- SQLite (dev), PostgreSQL (prod) — untouched by this feature (003-blur-map-future)

## Recent Changes
- 001-fix-frontend-api-integration: Added Python 3.12, Django 6.0, JavaScript (vanilla ES6) + Django REST Framework 3.16.1, SimpleJWT 5.5.1, django-tailwind 4.4.2
