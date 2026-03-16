# Tizahab — Smart Tourism Planner for Riyadh

A Django web platform that helps users discover places in Riyadh (restaurants, museums, parks, malls) and generate personalized daily itineraries based on their interests and budget.

Developed as a graduation project at Princess Nourah bint Abdulrahman University (PNU), aligned with Saudi Vision 2030 tourism goals.

---

## Architecture

```
tizahab-web/
├── config/                    # Django project root: settings, URLs, WSGI
│   ├── settings.py            # Development settings (SQLite, DEBUG=True)
│   ├── settings_production.py # Production settings (PostgreSQL, Redis, HTTPS)
│   └── urls.py                # Root URL routing
│
├── accounts/                  # Authentication and user preferences
│   ├── models.py              # UserPreferences (interests, budget, language)
│   ├── views.py               # Signup, login, preferences, /me, change-password
│   ├── serializers.py         # Input validation for auth and preferences
│   └── urls.py                # /api/auth/* endpoints
│
├── events/                    # Place catalog (953 Riyadh places)
│   ├── models.py              # Event (title, category, price, lat/lng, rating)
│   ├── views.py               # List, filter by category/search, filtered by preferences
│   ├── serializers.py
│   └── management/commands/load_data.py  # Imports riyadh_cleaned.json
│
├── daily_plan/                # Itinerary generation
│   ├── models.py              # DailyPlan (user + date + M2M events)
│   ├── services.py            # generate_recommendations() — the recommendation engine
│   ├── views.py               # CRUD + generate endpoint
│   └── urls.py                # /api/daily-plan/* endpoints
│
├── core/                      # Shared utilities
│   ├── context_processors.py  # Injects GOOGLE_MAPS_API_KEY into templates
│   └── middleware.py          # NoIndexMiddleware (adds X-Robots-Tag noindex)
│
├── templates/                 # Django HTML templates (TailwindCSS)
├── static/js/                 # Vanilla JavaScript modules
│   ├── api.js                 # Shared API layer (auth headers, silent refresh)
│   ├── events.js              # Events page (search, filter, favorites, map)
│   ├── daily_plan_integration.js  # Daily plan page (generate, carousels, map)
│   └── map.js                 # Google Maps wrapper
│
├── data/dataset-Tizahab/      # Source JSON files for the 953-place dataset
├── docker-compose.yml         # Services: web, db (PostgreSQL), redis, nginx
├── entrypoint.sh              # Container startup: migrate + collectstatic + load_data
├── Dockerfile
└── nginx.conf
```

**Tech stack:**

| Layer | Technology |
|---|---|
| Backend | Django 6.0 + Django REST Framework 3.16 |
| Authentication | SimpleJWT (15-min access / 7-day refresh tokens) |
| Database (dev) | SQLite |
| Database (prod) | PostgreSQL 15 |
| Cache (prod) | Redis 7 |
| Frontend | TailwindCSS + Vanilla JavaScript |
| Maps | Google Maps JavaScript API |
| Static files | WhiteNoise (compressed, cache-busted) |
| Web server | Gunicorn + Nginx |
| Containerization | Docker Compose (4 services) |

---

## Local Development Setup

### Prerequisites

- Python 3.12+
- Git

### Steps

```bash
# 1. Clone the repository
git clone <repository-url>
cd tizahab-web

# 2. Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Open .env and set at minimum:
#   DJANGO_SECRET_KEY  — generate with the command below
#   GOOGLE_MAPS_API_KEY — from Google Cloud Console (Maps JS API)
python manage.py shell -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# 5. Run database migrations
python manage.py migrate

# 6. Import the 953 Riyadh places dataset (required — do this once)
python manage.py load_data

# 7. Start the development server
python manage.py runserver
```

Visit `http://127.0.0.1:8000`

### Re-importing data

```bash
# Wipe existing events and re-import from scratch
python manage.py load_data --clear
```

---

## Docker (Production-like)

```bash
# Build and start all services (web, db, redis, nginx)
docker compose up --build
```

The `entrypoint.sh` automatically runs `migrate`, `collectstatic`, and `load_data` (only if the events table is empty) before starting Gunicorn.

Visit `http://localhost`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values below.

| Variable | Required | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | Yes | Django secret key — generate a random 50-char string |
| `DJANGO_ALLOWED_HOSTS` | Yes | Comma-separated hostnames (e.g. `localhost,127.0.0.1`) |
| `DJANGO_DEBUG` | No | `True` for development, omit or `False` for production |
| `GOOGLE_MAPS_API_KEY` | Yes | Google Maps JavaScript API key — required for map pages |
| `DB_ENGINE` | No | Database backend — defaults to SQLite in dev |
| `DATABASE_URL` | Prod only | PostgreSQL connection string (used by `settings_production.py`) |
| `REDIS_URL` | Prod only | Redis connection string (e.g. `redis://localhost:6379/0`) |
| `EMAIL_HOST` | Prod only | SMTP server for password reset emails |
| `EMAIL_HOST_USER` | Prod only | SMTP username |
| `EMAIL_HOST_PASSWORD` | Prod only | SMTP password |
| `DEFAULT_FROM_EMAIL` | Prod only | Sender address for outgoing emails |

For production, set `DJANGO_SETTINGS_MODULE=config.settings_production`.

---

## Running Tests

```bash
# Run all tests with coverage report
pytest --cov=accounts --cov=events --cov=daily_plan --cov=core --cov-report=term-missing

# Run a specific app's tests
pytest accounts/tests.py -v
pytest events/tests.py -v
pytest daily_plan/tests.py -v

# Run a single test class
python manage.py test accounts.tests.LoginTests
```

Tests use an in-memory SQLite database and create their own isolated data — no fixtures needed.

---

## API Endpoints

All endpoints under `/api/` require `Authorization: Bearer <access_token>` unless noted.

### Authentication (`/api/auth/`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup/` | None | Register — returns JWT tokens |
| POST | `/api/auth/login/` | None | Login — returns JWT tokens |
| POST | `/api/auth/token/refresh/` | None | Refresh access token |
| GET | `/api/auth/me/` | Required | Current user: email, username, interests, budget |
| GET/POST/PUT | `/api/auth/preferences/` | Required | Get or set interests, budget, language |
| POST | `/api/auth/change-password/` | Required | Change password (requires current password) |

### Events (`/api/events/`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/events/` | List all places — supports `?category=food` and `?search=keyword` |
| GET | `/api/events/<id>/` | Single place detail |
| GET | `/api/events/filtered/` | Places filtered by the user's saved preferences and budget |

### Daily Plans (`/api/daily-plan/`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/daily-plan/` | List the user's saved plans |
| POST | `/api/daily-plan/` | Create a plan manually |
| POST | `/api/daily-plan/generate/` | Generate a personalized plan — body: `{"date": "YYYY-MM-DD"}` |
| GET/PUT/DELETE | `/api/daily-plan/<id>/` | Retrieve, update, or delete a specific plan |

### HTML Pages

| URL | Description |
|---|---|
| `/` | Public landing page |
| `/home/` | Authenticated dashboard |
| `/events/page/` | Events discovery with search and map |
| `/events/page/<id>/` | Event detail |
| `/daily-plan/` | Daily plan page |
| `/map/` | Full-page Riyadh map |
| `/profile/` | User profile |
| `/settings/` | Account settings and change password |
| `/api/auth/ui/preferences/` | Preferences / onboarding |

---

## How the Recommendation Engine Works

`daily_plan/services.py::generate_recommendations(user)`

1. Fetch `user.preferences` — return `None` if not set (no preferences = no plan)
2. Read `interests` list — return `None` if empty
3. Query `Event.objects.filter(category__in=interests)`
4. Apply budget filters: `price <= budget_max OR price IS NULL`
5. Diversity pass: pick one random event per interest category first
6. Fill remaining slots up to 5 with random events from the filtered queryset
7. Return list of up to 5 `Event` objects

The `date` parameter is accepted but not used — the dataset contains permanent places (restaurants, parks, museums), not time-limited events.

Return value semantics:
- `None` → user has no preferences configured
- `[]` → preferences exist but no matching events found
- `[Event, ...]` → up to 5 recommended places

---

## Key Design Decisions

- **JWT in localStorage** with silent refresh — `api.js` retries requests with a new token before redirecting to login, so users stay logged in for the full 7-day refresh window.
- **Deterministic pricing** — event prices are assigned with `base + abs(hash(title)) % spread` during `load_data`, giving reproducible variety without randomness.
- **User isolation** — every queryset in every view is filtered by `request.user`; users can never access another user's plans.
- **SQLite for dev, PostgreSQL for prod** — switched via `DATABASE_URL` or `DB_ENGINE` env var; no code change needed.
- **Noindex middleware** — `core/middleware.py` adds `X-Robots-Tag: noindex` to all authenticated dashboard pages.

---

## Project Status

**Completed:**
- JWT authentication (signup, login, password reset, change password)
- User preferences (interests, budget, language)
- 953 real Riyadh places across 5 categories
- Personalized itinerary generation
- Google Maps integration on events, map, and daily plan pages
- Client-side favorites (localStorage)
- Docker Compose production setup

**Remaining work (see ENGINEERING_AUDIT.md for full detail):**
- Place images (`image_url` field on Event)
- User reviews and ratings
- Arabic language UI (Django i18n)
- Booking system
- Google Places API live enrichment

---

## Commit Convention

| Prefix | Use |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring without behavior change |
| `docs:` | Documentation only |
| `test:` | Test changes |

---

**Project:** Tizahab | **University:** PNU | **Stack:** Django 6 + DRF + TailwindCSS
