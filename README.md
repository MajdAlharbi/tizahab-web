# Tizahab — Smart Tourism Planner for Riyadh

A Django web platform that helps users discover 953 real places in Riyadh (restaurants, cafes, parks, museums, malls) and generate personalized daily itineraries based on their interests and budget.

Developed as a graduation project at Princess Nourah bint Abdulrahman University (PNU), aligned with Saudi Vision 2030 tourism goals.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, Django 6.0, Django REST Framework 3.16 |
| Authentication | SimpleJWT (15-min access / 7-day refresh tokens) |
| Database (dev) | SQLite |
| Database (prod) | PostgreSQL 15 |
| Frontend | TailwindCSS + Vanilla JavaScript (ES6) |
| Maps | Google Maps JavaScript API |
| Containerization | Docker Compose |

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

# 4. Configure environment variables
cp .env.example .env
```

Open `.env` and set these values:

| Variable | How to get it |
|---|---|
| `DJANGO_SECRET_KEY` | Run: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `GOOGLE_MAPS_API_KEY` | From [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — enable "Maps JavaScript API" |
| `GOOGLE_PLACES_API_KEY` | Same console — used for map embeds on all pages |

```bash
# 5. Run database migrations
python manage.py migrate

# 6. Import the 953 Riyadh places dataset (run once after migrate)
python manage.py load_data

# 7. Create an admin account
python manage.py createsuperuser

# 8. Start the development server
python manage.py runserver
```

Visit **http://127.0.0.1:8000**

Admin panel: **http://127.0.0.1:8000/admin/** (log in with the superuser you created)

### Re-importing data

```bash
# Wipe existing events and re-import from scratch
python manage.py load_data --clear
```

---

## Running Tests

```bash
# All tests
python manage.py test

# Specific app
python manage.py test events.tests
python manage.py test daily_plan.tests
python manage.py test accounts.tests

# With coverage
pytest --cov=accounts --cov=events --cov=daily_plan --cov=core --cov-report=term-missing
```

---

## Docker (Production)

```bash
docker compose up --build
```

The entrypoint automatically runs `migrate`, `collectstatic`, and `load_data` (if events table is empty) before starting Gunicorn.

Visit **http://localhost**

For production, set `DJANGO_SETTINGS_MODULE=config.settings_production` and provide `DATABASE_URL` and `REDIS_URL` in `.env`.

---

## How the AI Plan Generator Works

When you click **Generate AI Plan** on the daily plan page, the engine builds a personalized 5-place itinerary based on your preferences set in `/onboarding/`.

### Inputs

- **Interests** — your selected categories (restaurant, cafe, outdoor, culture, shopping, etc.)
- **Budget** — your min/max price range in SAR

### Algorithm (3 phases)

**Phase 1 — Category diversity:**
Picks the highest-scored place from each of your interest categories first, so if you like restaurants + outdoor + culture, you're guaranteed at least one of each.

**Phase 2 — Fill with nearby places:**
Remaining slots are filled considering **geographic proximity**. The engine calculates the centroid (geographic center) of already-selected places and favors candidates within 10 km. Places farther away get penalized — this prevents plans that send you from north Riyadh to south Riyadh and back. The centroid recalculates as each place is added, keeping the cluster tight.

**Phase 3 — Route ordering:**
The final 5 places are reordered using a nearest-neighbour algorithm so the plan reads as a logical path, minimizing travel between stops.

### Scoring factors

| Factor | Effect |
|---|---|
| **Budget fit** | Places priced closer to your budget midpoint score higher |
| **Recency** | Places already in your plans from the last 7 days are penalized (no repeats) |
| **Distance** | Places within 10 km of the cluster: no penalty. Beyond that: -0.1 per extra km |
| **Free places** | Always included regardless of budget filters (price = null) |

### Edge cases

- **No preferences set** → prompts you to go to `/onboarding/`
- **No matching places** → suggests adjusting your budget
- **All places recently visited** → still returns results but with lower scores, naturally rotating through different places

---

## Pages

| URL | Description |
|---|---|
| `/` | Public landing page |
| `/home/` | Dashboard — daily plan timeline, recommended places, popular places |
| `/events/page/` | Browse all 953 places with search, category filters, favorites, and map |
| `/events/page/<id>/` | Place detail with info, map link, and add-to-plan |
| `/daily-plan/` | Daily plan — generate AI plan, add activities, export, map view |
| `/map/` | Full-page interactive map with all places and filters |
| `/onboarding/` | Set interests, budget, and language preferences |
| `/profile/` | User profile |
| `/settings/` | Account settings and change password |

---

## API Endpoints

All endpoints require `Authorization: Bearer <access_token>` unless noted.

### Authentication — `/api/auth/`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup/` | No | Register — returns JWT tokens |
| POST | `/api/auth/login/` | No | Login — returns JWT tokens |
| POST | `/api/auth/token/refresh/` | No | Refresh access token |
| GET | `/api/auth/me/` | Yes | Current user info |
| GET/PUT | `/api/auth/preferences/` | Yes | Get or update preferences |
| POST | `/api/auth/change-password/` | Yes | Change password |

### Events — `/api/events/`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/events/` | No | List places — `?category=restaurant`, `?search=keyword` |
| GET | `/api/events/<id>/` | No | Single place detail |
| GET | `/api/events/filtered/` | Yes | Places matching user preferences and budget |
| GET | `/api/events/favorites/` | Yes | User's favorited places |
| POST | `/api/events/favorites/` | Yes | Add favorite — `{"event_id": 1}` |
| DELETE | `/api/events/favorites/<event_id>/` | Yes | Remove favorite |

### Daily Plans — `/api/daily-plan/`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/daily-plan/` | List user's plans |
| POST | `/api/daily-plan/` | Create plan — `{"date": "YYYY-MM-DD", "events": [1,2,3]}` |
| POST | `/api/daily-plan/generate/` | AI-generated plan — `{"date": "YYYY-MM-DD"}` |
| GET/PUT/DELETE | `/api/daily-plan/<id>/` | Retrieve, update, or delete a plan |

---

## Commit Convention

| Prefix | Use |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring |
| `docs:` | Documentation |
| `test:` | Test changes |

---

**Project:** Tizahab | **University:** PNU | **Stack:** Django 6 + DRF + TailwindCSS
