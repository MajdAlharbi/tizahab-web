# Quickstart: Fix Frontend-API Integration

**Feature Branch**: `001-fix-frontend-api-integration`  
**Date**: 2026-04-03

## Prerequisites

- Python 3.12
- Virtual environment activated (`.venv\Scripts\activate`)
- Dependencies installed (`pip install -r requirements.txt`)
- Database migrated (`python manage.py migrate`)
- Data loaded (`python manage.py load_data`)

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 001-fix-frontend-api-integration

# 2. Activate virtual environment
.venv\Scripts\activate

# 3. Run migrations (needed after adding Favorite model)
python manage.py makemigrations events
python manage.py migrate

# 4. Start dev server
python manage.py runserver
```

## Verification Steps

### 1. Verify serializer fix (Daily Plan returns full events)
```bash
# Create a test user and generate a plan, then verify list endpoint
curl -X POST http://localhost:8000/api/auth/signup/ \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"TestPass123!","password2":"TestPass123!"}'

# Use returned access token for subsequent requests
TOKEN="<access_token_from_signup>"

# Set preferences
curl -X POST http://localhost:8000/api/auth/preferences/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"interests":["food","culture"],"budget_min":0,"budget_max":100}'

# Generate plan
curl -X POST http://localhost:8000/api/daily-plan/generate/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-04-03"}'

# List plans — events should be full objects, not IDs
curl http://localhost:8000/api/daily-plan/ \
  -H "Authorization: Bearer $TOKEN"
```

### 2. Run tests
```bash
# All tests
python manage.py test

# Specific areas
python manage.py test daily_plan.tests
python manage.py test events.tests
python manage.py test accounts.tests
```

### 3. Browser verification (full flow)
1. Open `http://localhost:8000/` → Landing page
2. Sign up at `/api/auth/ui/signup/`
3. Set preferences at `/api/auth/ui/preferences/`
4. Visit `/daily-plan/` → Click "Generate Plan" → Verify cards + map markers
5. Visit `/events/page/` → Verify pagination "Load More" works
6. Visit `/profile/` → Verify real user data displayed
7. Visit `/settings/` → Change preferences → Save → Verify persistence

## Key Files to Modify

| Area                    | File                                      | Change                          |
|-------------------------|-------------------------------------------|---------------------------------|
| Serializer fix          | `daily_plan/serializers.py`               | Nested EventSerializer for read |
| Favorites model         | `events/models.py`                        | Add Favorite model              |
| Favorites serializer    | `events/serializers.py`                   | Add FavoriteSerializer          |
| Favorites views         | `events/views.py`                         | Add favorite CRUD views         |
| Favorites URLs          | `events/api_urls.py`                      | Add favorites endpoints         |
| Recommendation engine   | `daily_plan/services.py`                  | Scoring logic                   |
| Settings JS             | `templates/settings.html`                 | API sync for preferences        |
| Events pagination JS    | `static/js/events.js`                     | Load More button                |
| Favorites migration JS  | `static/js/events.js`                     | localStorage → backend sync     |
| Daily plan JS           | `static/js/daily_plan_integration.js`     | Verify data flow                |
| Profile JS              | `templates/profile.html`                  | Verify API connections          |
