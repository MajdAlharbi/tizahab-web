# Tizahab

Tizahab is a Django web application for browsing places in Riyadh, storing user preferences, and generating daily plans from the existing events dataset. The current implementation combines a Django REST Framework API, Tailwind-based templates, and vanilla JavaScript pages that consume the API directly.

## Current Scope

Implemented functionality in the current codebase:

- JWT-based signup and login
- User preferences for categories, budget range, language, minimum rating, and trip duration
- Public event browsing with category, date, and text search filters
- Preference-based filtered event browsing for authenticated users
- Daily plan generation for a single day
- Multi-day plan generation across consecutive days
- Google Maps integration on the events page, daily plan page, and map page
- Favorites, profile, settings, password change, and password reset flows
- Staff-only admin panel access based on `is_staff`

## Category Values

The backend currently accepts only these category values:

- `restaurant`
- `cafe`
- `fast_food`
- `dessert`
- `bakery`
- `juice`
- `food_truck`
- `culture`
- `outdoor`
- `shopping`
- `other`

`food` is not a valid category in the current implementation.

## Recommendation Logic

Daily-plan generation is rule-based. It does not use AI or machine learning.

Current behavior in `daily_plan/services.py`:

- Starts from the user's saved preference categories
- Applies budget filtering and still keeps events whose `price` is `null`
- Scores candidates using budget fit and a penalty for places already used in the previous 7 days
- Selects one event per interest category first to improve diversity
- Fills the remaining slots from the remaining candidates
- Returns at most 5 events for a single day
- Reorders the selected events into a route-like sequence using nearest-neighbor distance logic

Multi-day generation calls the same recommendation logic once per day and excludes items already used earlier in the same generated trip.

## Authentication

The API uses JWT via SimpleJWT:

- Access token lifetime: 15 minutes
- Refresh token lifetime: 7 days

Frontend behavior:

- Shared requests go through `static/js/api.js`
- Requests attach `Authorization: Bearer <access_token>` when a token exists
- On `401`, the frontend attempts `POST /api/auth/token/refresh/`
- If refresh succeeds, the original request is retried automatically
- If refresh fails, stored tokens are cleared and the user is redirected to `/login/`

Admin access:

- Backend admin API access is controlled by DRF `IsAdminUser`
- The admin page route uses `user.is_staff`
- Frontend login checks admin capability by calling the admin users API
- Admin access is not based on email address

## Tech Stack

| Layer | Current implementation |
| --- | --- |
| Backend | Django 6.0, Django REST Framework 3.16.1 |
| Auth | `djangorestframework-simplejwt` |
| Database | SQLite via `DATABASE_URL` in development, PostgreSQL in Docker and production-style deployments |
| Frontend | Django templates, Tailwind CSS, vanilla JavaScript |
| Static serving | WhiteNoise |
| Maps | Google Maps JavaScript API |
| Containers | Docker, Docker Compose, Nginx |

## Local Setup

### Prerequisites

- Python 3.12+
- Node.js and npm
- Git

### 1. Create and activate a virtual environment

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

macOS / Linux:

```bash
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and update the placeholders.

Required values documented for the current setup:

| Variable | Notes |
| --- | --- |
| `DJANGO_SECRET_KEY` | Required by Django at startup |
| `DJANGO_DEBUG` | Actual runtime flag read by `config/settings.py` |
| `DEBUG` | Included in `.env.example` as a convenience alias for documentation; the app reads `DJANGO_DEBUG` |
| `DATABASE_URL` | Use SQLite for development or PostgreSQL for containerized deployment |
| `GOOGLE_MAPS_API_KEY` | Used by the map-enabled pages |
| `EMAIL_HOST_USER` | SMTP username for password reset emails when using SMTP |
| `EMAIL_HOST_PASSWORD` | SMTP password or app password |

Example development value for `DATABASE_URL`:

```env
DATABASE_URL=sqlite:///db.sqlite3
```

### 4. Run migrations

```bash
python manage.py migrate
```

### 5. Build Tailwind assets

If you are changing frontend styles, install the theme dependencies and build Tailwind:

```bash
python manage.py tailwind install
python manage.py tailwind build
```

### 6. Load the seed dataset

```bash
python manage.py load_data
```

### 7. Start the development server

```bash
python manage.py runserver
```

Application URL: `http://127.0.0.1:8000`

## API Summary

Primary API routes in the current implementation:

- `POST /api/auth/signup/`
- `POST /api/auth/login/`
- `POST /api/auth/token/refresh/`
- `GET|POST|PUT /api/auth/preferences/`
- `GET /api/events/`
- `GET /api/events/filtered/`
- `GET|POST /api/daily-plan/`
- `POST /api/daily-plan/generate/`
- `POST /api/daily-plan/generate-multiday/`

Detailed request and response examples are in `API_DOCUMENTATION.md`.

## Validation Behavior

The backend does not silently fall back on invalid input. Current validation behavior includes:

- Invalid category values return `400`
- Invalid date values return `400`
- Invalid `trip_duration` values return `400`
- Preference validation errors return `400`

The API returns descriptive validation messages in the response body.

## Deployment

The repository includes a Docker Compose stack with:

- Django application container
- PostgreSQL container
- Redis container
- Nginx reverse proxy on port `80`

Current deployment mode in the provided Compose setup is HTTP-only and suitable for internal testing. HTTPS termination is not implemented in `docker-compose.yml` or `nginx.conf`.

See `DEPLOYMENT.md` for the current container setup.

## Testing

Run the Django test suite:

```bash
python manage.py test
```

You can also run app-specific tests:

```bash
python manage.py test accounts.tests
python manage.py test events.tests
python manage.py test daily_plan.tests
```
