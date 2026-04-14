# Quickstart: Blur Map & Activate Events Map

**Feature**: 003-blur-map-future
**Audience**: developer picking up this branch to implement or validate the change.

## Prerequisites

- Working dev setup per `CLAUDE.md` (Python 3.12, `.venv`, dependencies installed, DB migrated, `python manage.py load_data` run at least once).
- `.env` includes a valid `GOOGLE_MAPS_API_KEY` so the events-page map can actually render in the browser during manual verification.
- Dev server runnable: `python manage.py runserver`.

## Expected end state (after implementation)

| URL | Expected |
|---|---|
| `/map/` | Blurred backdrop with a centered 🗺️ icon, bilingual "Interactive Map — Coming Soon!" / "خريطة تفاعلية — قريباً!" headline, short description, and a `Plan Your Trip Instead →` button linking to `/daily-plan/`. No Google Maps network requests in DevTools Network panel. |
| `/events/page/` | Map card renders an interactive Google Map centered on Riyadh. No blur overlay. Up to 50 pins by default. If more events match the current filter, a `Load more (N remaining)` / `تحميل المزيد (N متبقية)` button appears below the map. Clicking it appends the next 50 pins and updates `N` without moving the viewport. |
| Sidebar nav (any dashboard page) | `Map` item is still present and clickable; a small `Soon` / `قريباً` badge appears next to its label. |
| `/daily-plan/` | Unchanged — still works exactly as before. |

## Manual verification checklist

Run the dev server and walk through these in both EN and AR:

1. **`/map/` Coming Soon**
   - [ ] Overlay visible within 1 s of page load (SC-001).
   - [ ] Network tab shows zero requests to `maps.googleapis.com` (SC-005).
   - [ ] Clicking `Plan Your Trip Instead` navigates to `/daily-plan/`.
   - [ ] Toggle language: headline + description + CTA switch EN ↔ AR.

2. **Sidebar badge**
   - [ ] `Soon` badge appears next to Map nav item in EN mode.
   - [ ] `قريباً` badge appears next to the Arabic label in AR mode.

3. **`/events/page/` map**
   - [ ] Map tile layer visible; no blurred overlay.
   - [ ] Pin count ≤ 50 on first render (SC-003).
   - [ ] `Load more (N remaining)` shows with correct `N` when dataset has more matches.
   - [ ] Clicking the button appends pins; `N` decreases by the batch size; viewport does NOT jump.
   - [ ] Clicking any pin opens an info-window with at least title + category.
   - [ ] Apply category filter → markers clear, fresh first-50 render, Load-more counter resets and may disappear if filter yields ≤50 events.
   - [ ] Clear the filter → full list reflects with fresh first-50 again.
   - [ ] Temporarily unset `GOOGLE_MAPS_API_KEY` and reload → map area shows neutral fallback (via `TZMap.renderMapFallback`), no uncaught JS errors, Load-more button hidden.

4. **Automated**
   - [ ] `python manage.py test` → `Ran 88 tests … OK` with 0 failures, 0 errors (SC-004).
   - [ ] Specifically: `python manage.py test accounts.tests.UserPreferencesTests` → all green.

## Common pitfalls

- **Forgetting to delete the z-10 overlay div**: the map will appear "broken" because it is literally hidden under a white translucent layer. Delete the whole `<!-- Coming Soon overlay -->` block in `templates/events_list.html`, not just a few lines.
- **Re-fitting bounds on Load more**: violates FR-007a's "without resetting the viewport" clause. Only `bounds.fit()` on first render and on filter change.
- **Loading the events/daily-plan JS on `/map/`**: would emit Google Maps requests and violate SC-005. The Coming Soon template should stay script-free.
- **Test fix**: updating `accounts/tests.py` is enough — do NOT modify `UserPreferencesSerializer.VALID_INTERESTS` (product taxonomy is authoritative per Assumptions in spec).

## Rollback

All changes are on branch `003-blur-map-future`. Rollback is `git checkout dev -- templates/map.html templates/events_list.html static/js/events.js accounts/tests.py <sidebar-template-file>`. No DB migrations to revert.
