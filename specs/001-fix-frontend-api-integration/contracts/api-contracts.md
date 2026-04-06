# API Contracts: Fix Frontend-API Integration

**Feature Branch**: `001-fix-frontend-api-integration`  
**Date**: 2026-04-03

## Modified Endpoints

### GET /api/daily-plan/ — List User's Daily Plans

**Change**: Response `events` field now returns full event objects instead of integer IDs.

**Response 200**:
```json
{
  "count": 2,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "date": "2026-04-03",
      "events": [
        {
          "id": 42,
          "title": "Al Faisaliah Tower",
          "category": "culture",
          "description": "Iconic skyscraper...",
          "date": "2025-12-01T00:00:00Z",
          "start_date": null,
          "end_date": null,
          "location": "King Fahd Road, Riyadh",
          "price": "25.00",
          "price_range": null,
          "latitude": 24.6901,
          "longitude": 46.6853
        }
      ],
      "created_at": "2026-04-03T10:00:00Z"
    }
  ]
}
```

### GET /api/daily-plan/{id}/ — Retrieve Single Plan

**Change**: Same as above — `events` returns full objects.

### POST /api/daily-plan/ — Create Plan

**Request** (unchanged — accepts event IDs):
```json
{
  "date": "2026-04-03",
  "events": [42, 55, 78]
}
```

**Response 201** (changed — returns full event objects):
```json
{
  "id": 1,
  "date": "2026-04-03",
  "events": [
    { "id": 42, "title": "...", "category": "...", ... }
  ],
  "created_at": "2026-04-03T10:00:00Z"
}
```

### PUT /api/daily-plan/{id}/ — Update Plan

**Request** (unchanged — accepts event IDs):
```json
{
  "date": "2026-04-03",
  "events": [42, 55, 99]
}
```

**Response 200** (changed — returns full event objects).

---

## New Endpoints

### GET /api/events/favorites/ — List User's Favorites

**Auth**: Required (Bearer token)

**Response 200**:
```json
[
  {
    "id": 1,
    "event": {
      "id": 42,
      "title": "Al Faisaliah Tower",
      "category": "culture",
      "description": "Iconic skyscraper...",
      "location": "King Fahd Road, Riyadh",
      "price": "25.00",
      "latitude": 24.6901,
      "longitude": 46.6853
    },
    "created_at": "2026-04-03T10:00:00Z"
  }
]
```

### POST /api/events/favorites/ — Add Favorite

**Auth**: Required

**Request**:
```json
{
  "event_id": 42
}
```

**Response 201**:
```json
{
  "id": 1,
  "event": { ... },
  "created_at": "2026-04-03T10:00:00Z"
}
```

**Error 400** (already favorited):
```json
{
  "detail": "Event already in favorites."
}
```

### POST /api/events/favorites/bulk/ — Bulk Add Favorites (migration)

**Auth**: Required

**Request**:
```json
{
  "event_ids": [42, 55, 78]
}
```

**Response 201**:
```json
{
  "migrated": 3,
  "skipped": 0
}
```

### DELETE /api/events/favorites/{event_id}/ — Remove Favorite

**Auth**: Required

**Response 204**: No content.

**Error 404**: Favorite not found.

---

## Existing Endpoints (No Changes)

These endpoints are already correct and require no backend modifications:

| Endpoint                        | Method | Notes                                    |
|---------------------------------|--------|------------------------------------------|
| POST /api/daily-plan/generate/  | POST   | Already returns full event objects        |
| GET /api/auth/me/               | GET    | Already returns user profile + preferences|
| GET /api/auth/preferences/      | GET    | Already returns preferences               |
| PUT /api/auth/preferences/      | PUT    | Already accepts and validates preferences |
| POST /api/auth/preferences/     | POST   | Already creates/updates preferences       |
| GET /api/events/                | GET    | Already paginated with full event objects |
| GET /api/events/filtered/       | GET    | Already filters by user preferences       |
| POST /api/auth/change-password/ | POST   | Already works correctly                   |
