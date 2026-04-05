# Data Model: Fix Frontend-API Integration

**Feature Branch**: `001-fix-frontend-api-integration`  
**Date**: 2026-04-03

## Existing Entities (Modifications)

### DailyPlan (daily_plan app)

**No schema changes.** Only the serializer changes — the model is correct as-is.

| Field      | Type              | Constraints                    | Notes             |
|------------|-------------------|--------------------------------|--------------------|
| id         | AutoField (PK)    | Auto-generated                 | Unchanged          |
| user       | FK → User         | CASCADE, related: daily_plans  | Unchanged          |
| date       | DateField         | Required                       | Unchanged          |
| events     | M2M → Event       | blank=True, related: daily_plans | Unchanged        |
| created_at | DateTimeField     | auto_now_add                   | Unchanged          |

**Serializer change**: `events` field must return nested `EventSerializer` objects on read, accept integer IDs on write.

### UserPreferences (accounts app)

**No schema changes.** Frontend Settings page must sync to existing fields.

| Field              | Type             | Constraints                     | Notes                      |
|--------------------|------------------|---------------------------------|-----------------------------|
| user               | OneToOne → User  | CASCADE, related: preferences   | Unchanged                   |
| preferred_language | CharField(5)     | choices: ar, en; default: en    | Synced from Settings page   |
| budget_min         | PositiveInteger  | nullable                        | Synced from Settings page   |
| budget_max         | PositiveInteger  | nullable                        | Synced from Settings page   |
| interests          | JSONField        | default: list                   | Synced from Settings page   |
| created_at         | DateTimeField    | auto_now_add                    | Unchanged                   |
| updated_at         | DateTimeField    | auto_now                        | Unchanged                   |

## New Entities

### Favorite (events app)

A record indicating a user has bookmarked/favorited an event.

| Field      | Type           | Constraints                                 | Notes                        |
|------------|----------------|---------------------------------------------|-------------------------------|
| id         | AutoField (PK) | Auto-generated                              |                               |
| user       | FK → User      | CASCADE, related: favorites                 | The user who favorited        |
| event      | FK → Event     | CASCADE, related: favorited_by              | The favorited event           |
| created_at | DateTimeField  | auto_now_add                                | When the favorite was created |

**Constraints**:
- `unique_together = [["user", "event"]]` — a user can favorite an event only once.

**Validation rules**:
- User must be authenticated to create/delete favorites.
- Only the owning user can list or delete their own favorites.

## Entity Relationships

```
User ──1:1──> UserPreferences
User ──1:N──> DailyPlan
User ──1:N──> Favorite (NEW)
DailyPlan ──M:N──> Event
Favorite ──N:1──> Event (NEW)
```

## State Transitions

### Favorite Lifecycle
1. **Created**: User clicks favorite button → POST to backend → record created
2. **Exists**: Displayed on Profile page, favorite button shown as active
3. **Deleted**: User clicks unfavorite → DELETE to backend → record removed

### localStorage Migration (one-time)
1. **Check**: On page load after login, check `tizahab_favorites` in localStorage
2. **Migrate**: If non-empty, POST event IDs to bulk favorites endpoint
3. **Clear**: After successful migration, delete `tizahab_favorites` from localStorage
4. **Done**: Future page loads skip migration (localStorage key absent)
