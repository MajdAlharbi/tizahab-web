# Feature Specification: Multi-Day Plan Generation with Backend Persistence

**Feature Branch**: `002-multiday-plan-generation`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "i want to fix generate plan with ai feature to generating multiple days plans depends on preferences of user that he have in backend and saving generated plan in backend to keep all thing consistency reliable"

## Clarifications

### Session 2026-04-10

- Q: Can users regenerate a single day of their trip, or must they always regenerate the entire multi-day trip? → A: Both — user can regenerate the full trip OR a single day, with cross-day uniqueness enforced against events already assigned to other days in the same trip window.
- Q: Should category diversity be maintained within each day, or can days be category-concentrated (themed days)? → A: Balanced — each day should have a mix of categories, spreading the user's interests across every day.
- Q: When a user regenerates with a shorter trip duration, what happens to leftover plans from the previous longer trip? → A: Delete — remove plans for dates beyond the new trip window to keep a clean slate.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate a Multi-Day Trip Plan (Priority: P1)

A user who has configured their preferences (interests, budget, trip duration) wants to generate a complete multi-day itinerary in a single action. The system generates a plan for each day of their trip, ensuring variety across days (no repeated places), geographic clustering within each day, and saves all plans to the backend so they persist across sessions.

**Why this priority**: This is the core feature — without multi-day generation, the user must manually generate plans one day at a time and manage consistency themselves.

**Independent Test**: Can be fully tested by setting preferences with trip_duration=3 and calling the generate endpoint, verifying 3 daily plans are created with distinct events.

**Acceptance Scenarios**:

1. **Given** a user has preferences with interests=["food","culture"], budget_max=100, and trip_duration=3, **When** they request to generate a multi-day plan starting from 2026-04-15, **Then** the system creates 3 daily plans (April 15, 16, 17), each with up to 5 unique events, and no event appears in more than one day.
2. **Given** a user has preferences with trip_duration=5, **When** they generate a multi-day plan, **Then** all 5 daily plans are saved to the backend and are retrievable via the existing daily plan list endpoint.
3. **Given** a user generates a multi-day plan but plans already exist for some of those dates, **When** the generation completes, **Then** the existing plans for overlapping dates are replaced with the newly generated plans.
4. **Given** a user has a 3-day trip plan and dislikes Day 2's recommendations, **When** they regenerate only Day 2, **Then** Day 2 gets new events that do not duplicate any events in Day 1 or Day 3, and Days 1 and 3 remain unchanged.

---

### User Story 2 - Trip Duration Preference (Priority: P2)

A user wants to specify how many days their trip will last (1-30 days) in their preferences. This trip duration drives how many daily plans are generated when the user triggers plan generation.

**Why this priority**: The trip duration preference is the input that controls multi-day generation. Without it, the system doesn't know how many days to plan for.

**Independent Test**: Can be tested by updating user preferences with a trip_duration value and verifying it is saved and returned correctly.

**Acceptance Scenarios**:

1. **Given** a user is on the preferences page, **When** they set trip_duration to 7, **Then** the value is saved to their profile and reflected on subsequent page loads.
2. **Given** a user sets trip_duration to 0 or a negative number, **When** they save, **Then** the system rejects the input with a validation error.
3. **Given** a user has not set trip_duration, **When** they generate a plan, **Then** the system defaults to 1 day (backward-compatible with current behavior).

---

### User Story 3 - View Multi-Day Plan Results (Priority: P2)

After generating a multi-day plan, the user sees all generated days organized chronologically. Each day shows its list of recommended places, allowing the user to review their entire trip at a glance.

**Why this priority**: Without a way to view the multi-day results, the generation is useless to the user.

**Independent Test**: Can be tested by generating a multi-day plan and verifying the response contains all days with their events in chronological order.

**Acceptance Scenarios**:

1. **Given** a user has just generated a 3-day plan, **When** the response is returned, **Then** it contains an array of 3 daily plans, each with a date and list of events, ordered chronologically.
2. **Given** a user navigates to the daily plan page after generating a multi-day plan, **When** the page loads, **Then** all generated days are listed and accessible.

---

### User Story 4 - Cross-Day Event Uniqueness (Priority: P3)

When generating a multi-day plan, the system ensures no place/event is repeated across different days. Each day offers a fresh set of recommendations, maximizing the variety of the trip.

**Why this priority**: Event uniqueness across days is what makes multi-day generation valuable compared to simply calling single-day generation multiple times.

**Independent Test**: Can be tested by generating a multi-day plan and verifying no event ID appears in more than one day's plan.

**Acceptance Scenarios**:

1. **Given** a user generates a 3-day plan, **When** the plans are created, **Then** no event appears in more than one day's plan.
2. **Given** a user's interests and budget match only 8 events total, **When** they generate a 3-day plan (requesting up to 15 events), **Then** the system distributes the 8 events across the 3 days (e.g., 3, 3, 2) without duplicating any.
3. **Given** a user's preferences match fewer events than the number of days requested, **When** they generate the plan, **Then** empty days are still created (with 0 events) rather than reducing the number of days.

---

### Edge Cases

- What happens when the user has no preferences set? The system returns an error message asking them to configure preferences first (same as current behavior).
- What happens when the start date plus trip duration extends beyond a reasonable future date? The system allows it — events in this dataset are permanent places, not date-bound.
- What happens when a user generates a multi-day plan that overlaps with previously saved plans? Existing plans for those dates are replaced.
- What happens when there are not enough events to fill all days? Events are distributed across available days; some days may have fewer than 5 events or no events.
- What happens if plan generation fails partway through (e.g., on day 3 of 5)? The entire operation should be atomic — either all days are saved or none are, to avoid partial/inconsistent state.
- What happens when a user shortens their trip duration and regenerates (e.g., 5-day trip → 3-day trip)? Plans for dates beyond the new window (days 4 and 5) are deleted to prevent stale orphan plans.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate daily plans for multiple consecutive days in a single request, starting from a user-specified start date.
- **FR-002**: System MUST use the user's `trip_duration` preference to determine how many days to generate plans for.
- **FR-003**: System MUST ensure no event/place is repeated across any two days within the same multi-day plan generation.
- **FR-004**: System MUST save all generated daily plans to the backend database so they persist across sessions and page reloads.
- **FR-005**: System MUST replace any existing daily plans for overlapping dates when regenerating.
- **FR-012**: System MUST support both full-trip regeneration (all days) and single-day regeneration (one specific day), selectable by the user.
- **FR-013**: When regenerating a single day, the system MUST enforce cross-day uniqueness by excluding events already assigned to other days within the same trip window.
- **FR-006**: System MUST return all generated daily plans in the response, organized chronologically with events for each day.
- **FR-007**: System MUST default to generating 1 day if the user has not set a trip_duration preference.
- **FR-008**: System MUST validate that trip_duration is between 1 and 30 days.
- **FR-009**: System MUST perform multi-day plan generation atomically — either all days are saved or none, preventing partial/inconsistent state.
- **FR-010**: System MUST maintain geographic clustering within each individual day's plan (existing behavior preserved).
- **FR-014**: System MUST maintain category diversity within each day's plan, spreading the user's interest categories across every day rather than concentrating categories into themed days.
- **FR-015**: When regenerating a full trip with a shorter duration than the previous trip, the system MUST delete any existing plans for dates beyond the new trip window.
- **FR-011**: System MUST distribute events as evenly as possible across days when total available events are fewer than days × 5.

### Key Entities

- **DailyPlan**: Existing entity representing a single day's plan for a user. Contains a date and a set of events. Unique per user+date combination. No structural changes needed — multi-day generation creates multiple DailyPlan records.
- **UserPreferences**: Existing entity storing user's interests, budget range, and trip_duration. The trip_duration field already exists and drives multi-day generation.
- **Event**: Existing entity representing a place/activity in Riyadh. Used as recommendations within daily plans.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can generate a complete multi-day trip plan (up to 30 days) in a single action, receiving all daily plans in the response within 5 seconds.
- **SC-002**: 100% of generated multi-day plans have zero duplicate events across days.
- **SC-003**: All generated plans are persisted and retrievable after page refresh or re-login without data loss.
- **SC-004**: Users who previously used single-day generation experience no change in behavior when trip_duration is set to 1 (full backward compatibility).
- **SC-005**: When plan generation is interrupted or fails, no partial plans are left in the system (atomic operation).

## Assumptions

- The existing `trip_duration` field on `UserPreferences` (already in the database) will be used as-is to drive multi-day generation.
- The existing `DailyPlan` model (one record per user+date) is sufficient — no new models are needed. Multi-day plans are represented as multiple `DailyPlan` records.
- The event dataset contains permanent places (not date-specific events), so generating plans for any future date range is valid.
- The existing recommendation engine's scoring, geographic clustering, and route ordering logic will be reused for each day's plan.
- The frontend daily plan page will be updated to display multi-day results, but the primary scope is backend correctness and persistence.
- Trip duration of 1 day matches current single-day behavior exactly (backward compatibility).
