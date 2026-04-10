# Data Model: Multi-Day Plan Generation

**Feature**: 002-multiday-plan-generation  
**Date**: 2026-04-10

## Existing Entities (No Changes)

### DailyPlan
- `id` (auto, PK)
- `user` (FK → User, CASCADE)
- `date` (DateField)
- `events` (M2M → Event)
- `created_at` (DateTimeField, auto)
- **Constraint**: unique_together = [user, date]

No structural changes needed. Multi-day plans are represented as multiple DailyPlan records sharing the same user and consecutive dates.

### UserPreferences
- `id` (auto, PK)
- `user` (OneToOne → User, CASCADE)
- `preferred_language` (CharField, default="en")
- `budget_min` (PositiveIntegerField, nullable)
- `budget_max` (PositiveIntegerField, nullable)
- `interests` (JSONField, default=list)
- `min_rating` (DecimalField, nullable)
- `trip_duration` (PositiveIntegerField, default=1) — **already exists**, drives multi-day generation
- `created_at` (DateTimeField, auto)
- `updated_at` (DateTimeField, auto)

No changes needed. The `trip_duration` field (1-30, validated in serializer) already exists in the database.

### Event
- `id` (auto, PK)
- `title`, `category`, `description`, `date`, `start_date`, `end_date`
- `location`, `price`, `price_range`, `rating`
- `latitude`, `longitude`
- `created_at`, `updated_at`

No changes needed.

## Relationships

```
User 1──1 UserPreferences
User 1──* DailyPlan
DailyPlan *──* Event
```

A multi-day trip for a user is implicitly represented as N DailyPlan records with consecutive dates. There is no explicit "Trip" entity — the trip is defined by `(user, start_date, trip_duration from preferences)`.

## State Transitions

### Multi-Day Plan Lifecycle
1. **No plans** → User generates → **Plans created** (N DailyPlan records atomically)
2. **Plans exist** → User regenerates full trip → **Plans replaced** (old deleted, new created atomically)
3. **Plans exist** → User regenerates single day → **One plan replaced** (single DailyPlan updated, uniqueness enforced against sibling days)
4. **Plans exist** → User shortens trip_duration and regenerates → **Excess plans deleted** (plans beyond new window removed)

## Validation Rules

- `trip_duration`: 1-30 (clamped in serializer, already implemented)
- `start_date`: must be today or future (validated in view)
- Events per day: 0-5 (natural limit of recommendation algorithm)
- Cross-day uniqueness: no event ID appears in more than one DailyPlan within the same trip generation
