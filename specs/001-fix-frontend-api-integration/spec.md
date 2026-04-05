# Feature Specification: Fix Frontend-API Integration

**Feature Branch**: `001-fix-frontend-api-integration`  
**Created**: 2026-04-03  
**Status**: Draft  
**Input**: User description: "Fix the current issues in the Tizahab project. The backend mostly works, but there are clear problems with the connection between the frontend and the API."

## Clarifications

### Session 2026-04-03

- Q: Which settings should sync to backend vs stay in localStorage? → A: Sync interests, budget, and language to backend (user-profile data); keep theme and notifications in localStorage (device-specific display preferences).
- Q: What happens to existing localStorage favorites when backend persistence is added? → A: Auto-migrate localStorage favorites to backend on first login, then clear localStorage.
- Q: What factors should the recommendation scoring engine use? → A: Budget fit (price proximity to user's budget midpoint) + category diversity (spread across interests) + avoid recently recommended places.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate and View Daily Plan (Priority: P1)

A logged-in user who has set their preferences (interests and budget) navigates to the Daily Plan page and clicks "Generate Plan." The system calls the recommendation engine, returns a list of up to 5 personalized places with full details (title, location, price, coordinates), and displays them as cards on the page. The places also appear as markers on the map.

**Why this priority**: This is the core value proposition of the platform. Without a working generate-and-display flow, the product has no primary use case. The serializer currently returns only event IDs instead of full objects, breaking both the card display and the map markers.

**Independent Test**: Can be fully tested by registering a user, setting preferences, clicking "Generate Plan," and verifying that place cards and map markers appear with correct data.

**Acceptance Scenarios**:

1. **Given** a logged-in user with preferences set (interests: food, culture; budget: 0-100 SAR), **When** the user clicks "Generate Plan," **Then** up to 5 places matching their interests and budget appear as cards with title, location, category, and price visible.
2. **Given** a daily plan has been generated, **When** the plan is displayed, **Then** each place with valid coordinates appears as a pin on the Google Map with an info window showing its title.
3. **Given** a user revisits the Daily Plan page on the same date, **When** the page loads, **Then** the previously generated plan is retrieved and displayed with full place details (not just IDs).
4. **Given** a user with no preferences set, **When** the user clicks "Generate Plan," **Then** a clear message instructs the user to set their preferences first.

---

### User Story 2 - Profile Displays Real User Data (Priority: P1)

A logged-in user navigates to their Profile page and sees their actual account information (name, email) and their current preference settings (interests, budget range) loaded from the backend.

**Why this priority**: The profile page is essential for users to verify their identity and review their settings. Currently, it partially works but must consistently pull from the backend API.

**Independent Test**: Can be tested by logging in and verifying that the profile page shows the correct email, name, and preference data matching what was set during registration or preference updates.

**Acceptance Scenarios**:

1. **Given** a logged-in user, **When** they navigate to the Profile page, **Then** their name and email from the user profile endpoint are displayed.
2. **Given** a user with preferences set, **When** the Profile page loads, **Then** their interests and budget range from the preferences endpoint are displayed.
3. **Given** a user who is not logged in, **When** they try to access the Profile page, **Then** they are redirected to the login page.

---

### User Story 3 - Settings Save to Backend (Priority: P1)

A logged-in user navigates to Settings, updates their interests or budget preferences, and clicks Save. The changes are persisted to the backend so they take effect across sessions and devices.

**Why this priority**: Preferences drive the recommendation engine. If preferences only save to localStorage, they are lost on device/browser changes and the recommendation engine cannot use them. This directly blocks the core daily plan generation flow.

**Independent Test**: Can be tested by updating preferences in Settings, refreshing the page, and confirming the saved values persist. Then generate a daily plan to verify the updated preferences influence results.

**Acceptance Scenarios**:

1. **Given** a logged-in user on the Settings page, **When** they update their interests, budget, or language and click Save, **Then** those changes are sent to the preferences endpoint and a success confirmation is shown.
2. **Given** a user who just saved new preferences, **When** they refresh the page or visit from another browser, **Then** the Settings page loads the saved preferences (interests, budget, language) from the backend, while theme and notification settings load from localStorage.
3. **Given** a user submits invalid preference data (e.g., budget_min greater than budget_max), **When** they click Save, **Then** an appropriate error message is displayed.

---

### User Story 4 - Daily Plan Returns Complete Event Data (Priority: P1)

When a daily plan is retrieved (list or detail view), the response includes complete event information for each place in the plan, not just numeric IDs.

**Why this priority**: This is the root cause of multiple frontend display issues. The generate endpoint already returns full data, but the list/retrieve endpoints return only IDs, causing the plan page and map to break when loading existing plans.

**Independent Test**: Can be tested by generating a plan, then fetching it via the daily plan list endpoint and verifying the response contains nested event objects with title, location, latitude, longitude, price, and category.

**Acceptance Scenarios**:

1. **Given** a user has generated a daily plan, **When** they request the daily plan list, **Then** each plan's events field contains full event objects (title, location, category, price, latitude, longitude), not integer IDs.
2. **Given** a user requests a specific plan by ID, **Then** the events field contains full event objects.
3. **Given** a user creates or updates a plan by submitting event IDs, **When** the operation completes, **Then** the response returns full event objects.

---

### User Story 5 - Map Displays Correct Location Markers (Priority: P1)

When a daily plan or event list is displayed, the Google Map shows pin markers at the correct geographic positions for each place, with info windows that display place details.

**Why this priority**: The map is a key visual component of the tourism planning experience. Markers depend on the serializer returning latitude/longitude data, making this directly tied to the serializer fix.

**Independent Test**: Can be tested by generating a daily plan and verifying that the number of map markers matches the number of places in the plan, each positioned at the correct coordinates.

**Acceptance Scenarios**:

1. **Given** a daily plan with 5 places, **When** the plan is displayed, **Then** 5 markers appear on the map at the correct latitude/longitude positions.
2. **Given** a marker on the map, **When** the user clicks it, **Then** an info window appears showing the place title and location.
3. **Given** events on the Events page, **When** the page loads, **Then** markers appear for all displayed events with correct positions.

---

### User Story 6 - Events Page Supports Pagination (Priority: P2)

A user browsing the Events page can load additional results beyond the first page. The system shows the initial set of events and provides a way to load more.

**Why this priority**: With 953 places in the database and a page size of 50, users currently only see the first page. This limits discoverability but doesn't block the core plan generation flow.

**Independent Test**: Can be tested by loading the Events page, scrolling to the bottom, clicking "Load More," and verifying additional events appear.

**Acceptance Scenarios**:

1. **Given** there are more than 50 events, **When** a user visits the Events page, **Then** the first 50 events are displayed with a "Load More" button visible.
2. **Given** the first page of events is displayed, **When** the user clicks "Load More," **Then** the next page of events is appended below the existing ones.
3. **Given** all events have been loaded, **When** the user reaches the last page, **Then** the "Load More" button is hidden or disabled.

---

### User Story 7 - Recommendation Engine Uses Scoring (Priority: P2)

When generating a daily plan, the system selects places using a scoring or ranking approach rather than pure random selection, providing more relevant and diverse recommendations.

**Why this priority**: The current random selection works but provides inconsistent quality. Users may receive poor recommendations that don't align well with their preferences. This is an improvement, not a blocker.

**Independent Test**: Can be tested by generating multiple plans for the same user preferences and verifying that results show reasonable consistency and diversity across categories.

**Acceptance Scenarios**:

1. **Given** a user with interests in food and culture, **When** a plan is generated, **Then** the results include places from both categories (not all from one category), ensuring category diversity.
2. **Given** a user with a budget of 0-50 SAR, **When** a plan is generated, **Then** places with prices closer to the budget midpoint (25 SAR) are scored higher and appear preferentially.
3. **Given** repeated plan generation for the same user, **When** multiple plans are generated on different days, **Then** previously recommended places are deprioritized, producing varied results.

---

### User Story 8 - Favorites Persist to Backend (Priority: P3)

A logged-in user can favorite/unfavorite places and have those favorites stored on the server so they persist across devices and browsers.

**Why this priority**: This requires creating a new backend model and API endpoints, making it the largest scope item. The current localStorage approach works for single-browser use. This is an enhancement rather than a fix.

**Independent Test**: Can be tested by favoriting a place, logging in from a different browser, and verifying the favorite persists.

**Acceptance Scenarios**:

1. **Given** a logged-in user viewing an event, **When** they click the favorite button, **Then** the favorite is saved to the backend and the button reflects the favorited state.
2. **Given** a user with saved favorites, **When** they visit their Profile page, **Then** their favorited places are loaded from the backend.
3. **Given** a user unfavorites a place, **When** they click the unfavorite button, **Then** the favorite is removed from the backend.
4. **Given** a user who is not logged in, **When** they try to favorite a place, **Then** they are prompted to log in.
5. **Given** a user with existing localStorage favorites who logs in after the backend favorites feature is deployed, **When** the page loads, **Then** localStorage favorites are automatically migrated to the backend and localStorage is cleared.

---

### Edge Cases

- What happens when the recommendation engine finds zero matching events for the user's preferences and budget? The system should display a helpful message suggesting the user broaden their preferences.
- What happens when a user's JWT token expires while they are interacting with the page? The system should handle 401 responses by redirecting to login or prompting re-authentication.
- What happens when the Google Maps API key is missing or invalid? The map area should show a fallback message rather than a blank area or JavaScript error.
- What happens when a place in a saved daily plan has been deleted from the database? The plan should still display the remaining valid places without errors.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST return full event details (title, location, category, price, latitude, longitude) in daily plan list and detail responses, not just event IDs.
- **FR-002**: System MUST call the daily plan generate endpoint when the Generate Plan button is clicked and display the returned places as cards and map markers.
- **FR-003**: System MUST load user profile data from the user profile endpoint on the Profile page.
- **FR-004**: System MUST load user preferences from the preferences endpoint on both the Profile and Settings pages.
- **FR-005**: System MUST save interests, budget, and language preferences to the backend when the user clicks Save on the Settings page, with success/error feedback. Theme and notification preferences MUST remain in localStorage as device-specific settings.
- **FR-006**: System MUST display Google Maps markers using latitude and longitude from the API response data, placed after the data has loaded.
- **FR-007**: System MUST support pagination on the Events page, allowing users to load additional results beyond the first page.
- **FR-008**: System MUST provide a backend-persisted favorites feature with a data model and endpoints for logged-in users. On first login after deployment, existing localStorage favorites MUST be automatically migrated to the backend, after which localStorage favorites are cleared.
- **FR-009**: System MUST use a scoring approach in the recommendation engine based on three factors: (1) budget fit — places with prices closer to the user's budget midpoint score higher, (2) category diversity — results are spread across the user's interest categories, and (3) recency avoidance — places recently recommended to the same user are deprioritized.
- **FR-010**: System MUST show appropriate error messages when API calls fail (network errors, validation errors, authentication errors).
- **FR-011**: System MUST handle the case where a user has no preferences set by displaying a message directing them to configure preferences before generating a plan.
- **FR-012**: System MUST accept event IDs for input on plan create/update operations but return full event objects in all responses.

### Key Entities

- **DailyPlan**: A user's plan for a specific date, containing a list of recommended places. Key attributes: user (owner), date, list of events. Unique per user per date.
- **Event (Place)**: A point of interest in Riyadh. Key attributes: title, location/address, category, price, latitude, longitude, description.
- **UserPreferences**: A user's stated interests and budget range. Key attributes: interests (list of categories), budget minimum, budget maximum, preferred language.
- **Favorite** (new): A user's saved/bookmarked place. Key attributes: user (owner), event reference, timestamp of when favorited. Unique per user per event.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the full flow (Register > Set Preferences > Browse Events > Generate Plan > View Plan on Map) without encountering errors or missing data in under 5 minutes.
- **SC-002**: Generated daily plans display all place details (title, location, price, category) on both initial generation and subsequent page loads with 100% consistency.
- **SC-003**: All map markers correspond to actual places in the generated plan, with correct positioning and clickable info windows.
- **SC-004**: Preference changes saved in Settings persist across page refreshes and browser sessions with 100% reliability.
- **SC-005**: Users can browse all available events (not just the first 50) through pagination controls on the Events page.
- **SC-006**: Favorited places persist across browser sessions and devices for logged-in users.
- **SC-007**: Generated plans show category diversity — plans for users with multiple interests include places from at least 2 different categories when available.
- **SC-008**: Profile page displays the user's actual email, name, and preference data as stored in the system.

## Assumptions

- The existing backend API endpoints for authentication, events, and daily plan generation are functional and return correct data — the issues are primarily in the frontend consuming them and in the DailyPlan serializer configuration.
- The Google Maps API key is properly configured and available to authenticated users via the existing context processor.
- The existing JWT authentication flow (signup, login, token refresh) works correctly and does not need modification.
- The Event model already contains valid latitude and longitude data for all 953 imported places from the data import process.
- The favorites feature will follow the same authentication pattern as existing endpoints (JWT Bearer token).
- The UI design, layout, and styling will remain unchanged — only the data binding, API connections, and data flow will be fixed.
- The recommendation engine improvement will maintain backward compatibility — it will still return up to 5 events and still respect user preferences and budget constraints.
- Password change functionality on the Settings page already works and does not need modification.
