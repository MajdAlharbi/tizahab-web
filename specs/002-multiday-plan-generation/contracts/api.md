# API Contracts: Multi-Day Plan Generation

**Feature**: 002-multiday-plan-generation  
**Date**: 2026-04-10

## New Endpoint: Generate Multi-Day Plan

### `POST /api/daily-plan/generate-multiday/`

**Auth**: Bearer token required

**Request Body**:
```json
{
  "start_date": "2026-04-15"
}
```

| Field        | Type   | Required | Description                              |
|--------------|--------|----------|------------------------------------------|
| `start_date` | string | Yes      | ISO date (YYYY-MM-DD), today or future   |

**Success Response** (`201 Created` if new plans, `200 OK` if replacing existing):
```json
{
  "trip_duration": 3,
  "start_date": "2026-04-15",
  "plans": [
    {
      "id": 10,
      "date": "2026-04-15",
      "events": [
        {
          "id": 1,
          "title": "Al Baik",
          "category": "food",
          "description": "...",
          "location": "Riyadh",
          "price": "45.00",
          "latitude": 24.7136,
          "longitude": 46.6753,
          "rating": "4.5"
        }
      ],
      "count": 5
    },
    {
      "id": 11,
      "date": "2026-04-16",
      "events": [...],
      "count": 5
    },
    {
      "id": 12,
      "date": "2026-04-17",
      "events": [...],
      "count": 3
    }
  ],
  "total_events": 13
}
```

**Error Responses**:

| Status | Condition                              | Body                                                    |
|--------|----------------------------------------|---------------------------------------------------------|
| 400    | Missing start_date                     | `{"detail": "start_date is required. Format: YYYY-MM-DD"}` |
| 400    | Past date                              | `{"detail": "Cannot create plans for past dates."}`     |
| 400    | Invalid date format                    | `{"detail": "Invalid date format. Expected YYYY-MM-DD"}` |
| 400    | No preferences / no interests          | `{"detail": "Please set your interests in preferences before generating a plan."}` |
| 404    | No matching events                     | `{"detail": "No recommendations found for your interests and budget."}` |
| 500    | Server error                           | `{"detail": "Unexpected error while generating plan."}` |

## Modified Endpoint: Generate Single Day (with exclusion support)

### `POST /api/daily-plan/generate/`

**Existing behavior preserved.** New optional field added:

**Request Body** (updated):
```json
{
  "date": "2026-04-16",
  "seed": 1234567890,
  "exclude_plan_dates": ["2026-04-15", "2026-04-17"]
}
```

| Field                | Type     | Required | Description                                               |
|----------------------|----------|----------|-----------------------------------------------------------|
| `date`               | string   | Yes      | ISO date (YYYY-MM-DD)                                     |
| `seed`               | any      | No       | Seed for randomized selection                             |
| `exclude_plan_dates` | string[] | No       | Dates of sibling plans; events from those plans excluded  |

**Response**: Unchanged (single plan object).

When `exclude_plan_dates` is provided, the endpoint fetches events from the user's existing plans on those dates and excludes them from the recommendation pool, ensuring cross-day uniqueness during single-day regeneration.

## Unchanged Endpoints

- `GET /api/daily-plan/` — List all user's plans (already returns multi-day plans since they're individual DailyPlan records)
- `GET /api/daily-plan/<id>/` — Retrieve single plan
- `PUT /api/daily-plan/<id>/` — Update plan
- `DELETE /api/daily-plan/<id>/` — Delete plan
