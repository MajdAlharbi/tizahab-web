# Research: Multi-Day Plan Generation

**Feature**: 002-multiday-plan-generation  
**Date**: 2026-04-10

## R-001: Multi-Day Generation Strategy

**Decision**: Extend the existing `generate_recommendations()` function with an `exclude_ids` parameter rather than creating a new function. A new top-level `generate_multiday_plan()` orchestrator calls it in a loop, accumulating used event IDs across days.

**Rationale**: The existing scoring/clustering/routing logic in `generate_recommendations()` is well-tested and handles budget, category diversity, geographic clustering, and route ordering. Reusing it avoids duplication and preserves proven behavior. The only change needed is an `exclude_ids` parameter so each subsequent day avoids events already assigned to earlier days.

**Alternatives considered**:
- Build a completely new multi-day algorithm that scores all events at once and partitions them into days. Rejected: higher complexity, harder to maintain backward compatibility, and the existing per-day algorithm already handles geographic clustering well.
- Call the existing function N times from the frontend (current approach). Rejected: no cross-day uniqueness guarantee, N sequential HTTP requests are slow, and atomicity is impossible.

## R-002: Atomicity Approach

**Decision**: Use Django's `transaction.atomic()` to wrap the entire multi-day save operation. Delete existing plans in the date range, create new ones, and set events — all within a single transaction.

**Rationale**: Django's ORM transaction support is straightforward and sufficient. If any error occurs during generation or saving, the transaction rolls back and no partial plans are persisted. This is simpler and more reliable than manual cleanup logic.

**Alternatives considered**:
- Save each day individually and roll back manually on failure. Rejected: error-prone and leaves inconsistent state if rollback itself fails.
- Use a two-phase approach (generate all, then save all). Rejected: still needs atomicity for the save phase, so `transaction.atomic()` is needed regardless.

## R-003: API Endpoint Design

**Decision**: Add a new `POST /api/daily-plan/generate-multiday/` endpoint alongside the existing single-day endpoint. The new endpoint accepts `{ "start_date": "YYYY-MM-DD" }` and reads `trip_duration` from the user's preferences. Returns an array of daily plans.

**Rationale**: Keeping the existing single-day endpoint preserves backward compatibility. The new endpoint has a clear purpose and a different response shape (array of plans vs. single plan). The frontend can migrate to the new endpoint while the old one continues to work.

**Alternatives considered**:
- Modify the existing `/generate/` endpoint to accept an optional `days` parameter. Rejected: changes the response shape conditionally, making the API harder to consume and test.
- Use a query parameter on the existing list endpoint. Rejected: generation is a write operation, not a read.

## R-004: Single-Day Regeneration

**Decision**: The existing `POST /api/daily-plan/generate/` endpoint will be enhanced to accept an optional `exclude_plan_dates` parameter (list of dates). When provided, the endpoint fetches events from plans on those dates and passes them as `exclude_ids` to ensure cross-day uniqueness.

**Rationale**: This approach reuses the existing single-day endpoint for regeneration with minimal changes. The frontend sends the dates of the other days in the trip, and the backend figures out which event IDs to exclude. This keeps the API simple and the frontend doesn't need to track event IDs.

**Alternatives considered**:
- Send `exclude_event_ids` directly from the frontend. Rejected: requires the frontend to maintain event ID state, which is fragile.
- Add a dedicated `/regenerate-day/` endpoint. Rejected: unnecessary complexity when the existing generate endpoint can handle it with a small addition.

## R-005: Event Distribution Strategy

**Decision**: When total matching events < days × 5, distribute events round-robin across days. Generate recommendations for each day with the full pool minus already-used events. Days generated later naturally get fewer events as the pool shrinks.

**Rationale**: The existing algorithm already handles "fewer than 5 candidates" gracefully by returning whatever is available. By generating days sequentially and excluding used events, the pool naturally depletes. This produces an organic distribution where earlier days may get slightly more events, which is acceptable.

**Alternatives considered**:
- Pre-partition events into day buckets, then run scoring within each bucket. Rejected: loses the benefit of per-day geographic clustering since events are assigned before scoring.
- Limit each day to `total_events / num_days` events to equalize. Rejected: over-constrains the algorithm and may produce suboptimal days when events are unevenly distributed across categories.

## R-006: Cleanup of Plans Beyond Trip Window

**Decision**: When generating a full multi-day plan, delete any existing plans for the user within the date range `[start_date, start_date + trip_duration)` AND any plans beyond that range that were part of a previous longer trip. Implementation: delete all user plans with `date >= start_date`.

**Rationale**: Since trip_duration may have changed (user shortened their trip), plans beyond the new window are stale. Deleting all plans from start_date onward is simple and correct — the user is starting a fresh trip from that date.

**Alternatives considered**:
- Only delete plans within the new trip window. Rejected: leaves orphan plans from the previous longer trip.
- Track "trip groups" with a foreign key. Rejected: adds model complexity for a problem solvable with a simple date range delete.
