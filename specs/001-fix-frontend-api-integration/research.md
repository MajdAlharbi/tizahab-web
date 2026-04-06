# Research: Fix Frontend-API Integration

**Feature Branch**: `001-fix-frontend-api-integration`  
**Date**: 2026-04-03

## Research Tasks & Findings

### R1: DailyPlan Serializer — Nested vs PrimaryKey for Read/Write

**Decision**: Use separate serializer fields for read and write operations on the `events` field.

**Rationale**: The `DailyPlanSerializer` currently uses `PrimaryKeyRelatedField` which returns integer IDs (e.g., `[1, 2, 3]`). The frontend expects full event objects. The generate view already manually serializes events with `EventSerializer`, but list/detail views do not. The fix is to override the `events` field to use `EventSerializer(many=True, read_only=True)` for read operations, and override `create`/`update` to accept IDs for write operations.

**Alternatives considered**:
- Two separate serializers (read vs write): More code, harder to maintain.
- `depth = 1` on Meta: Too broad, no control over which fields are nested.
- `SerializerMethodField`: Works but less clean than overriding `to_representation`.

### R2: Recommendation Scoring — Budget Fit + Category Diversity + Recency Avoidance

**Decision**: Replace `order_by("?")` with a Python-side scoring function that assigns each candidate event a composite score based on three factors.

**Rationale**: 
- **Budget fit**: Calculate distance from budget midpoint `(budget_min + budget_max) / 2`. Closer = higher score. Events with `price=NULL` get a neutral score.
- **Category diversity**: After scoring, select top events ensuring at least one per interest category before filling remaining slots.
- **Recency avoidance**: Query user's DailyPlan records from the last 7 days, collect event IDs, and penalize those events in scoring.

**Alternatives considered**:
- Database-level scoring with `annotate`: Complex for the budget midpoint calculation and recency penalty. Python-side is simpler for 5 results from a filtered queryset.
- ML-based recommendations: Overkill for the current dataset size (953 places) and user base.

### R3: Favorites Backend Model — App Placement & API Design

**Decision**: Add `Favorite` model to the `events` app (since it relates a user to an Event) with REST endpoints under `/api/events/favorites/`.

**Rationale**: The `events` app owns the `Event` model. A Favorite is a user-event relationship, logically belonging with events. Endpoints: `GET` (list user favorites), `POST` (add favorite), `DELETE /<event_id>/` (remove favorite).

**Alternatives considered**:
- Separate `favorites` app: Unnecessary for a single model with 3 endpoints.
- Add to `accounts` app: Events app is the better semantic home since Favorite references Event.

### R4: Settings Backend Sync — Which Fields

**Decision**: Sync `interests`, `budget_min`, `budget_max`, and `preferred_language` to the backend via `PUT /api/auth/preferences/`. Keep theme and notification preferences in localStorage.

**Rationale**: The `UserPreferences` model already has fields for interests, budget, and language. Theme/notification are display preferences that vary by device. The `UserPreferencesSerializer` already validates all backend-synced fields.

**Alternatives considered**:
- Add theme/notification columns to UserPreferences: Unnecessary — they are device-specific.
- Create a separate UserSettings model: Over-engineering for two localStorage keys.

### R5: Favorites Migration from localStorage

**Decision**: On page load (after login), check if localStorage has favorites. If yes, POST them to the backend bulk endpoint, then clear localStorage.

**Rationale**: One-time silent migration preserves existing user data. The migration check runs client-side on login. After successful backend save, localStorage favorites are cleared to prevent duplicate syncs.

**Alternatives considered**:
- Server-side migration: Not possible — localStorage is client-side only.
- Prompt user to confirm: Unnecessary friction for a seamless background operation.

### R6: Events Pagination — Frontend Pattern

**Decision**: Add a "Load More" button at the bottom of the events list that fetches the next page URL from the paginated API response.

**Rationale**: DRF's `PageNumberPagination` already returns `next` and `previous` URLs. The frontend just needs to track the `next` URL and append results. This is simpler than numbered pagination and matches infinite-scroll UX patterns.

**Alternatives considered**:
- Numbered pagination (page 1, 2, 3...): More complex UI, less suited for card-based layouts.
- Infinite scroll with intersection observer: More complex, "Load More" is sufficient for 953 items across ~19 pages.
