# Implementation Plan: Fix Frontend-API Integration

**Branch**: `001-fix-frontend-api-integration` | **Date**: 2026-04-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-fix-frontend-api-integration/spec.md`

## Summary

Fix the broken connections between the Tizahab frontend and its Django REST API. The root cause of most display issues is the `DailyPlanSerializer` returning event IDs instead of full objects. Additional fixes include: connecting the Settings page to the preferences API, adding pagination to the Events page, creating a backend Favorite model with migration from localStorage, and improving the recommendation engine with budget-fit scoring, category diversity, and recency avoidance.

## Technical Context

**Language/Version**: Python 3.12, Django 6.0, JavaScript (vanilla ES6)  
**Primary Dependencies**: Django REST Framework 3.16.1, SimpleJWT 5.5.1, django-tailwind 4.4.2  
**Storage**: SQLite (dev), PostgreSQL (prod via dj-database-url)  
**Testing**: pytest 8.3.5 with pytest-django, pytest-cov; also Django test runner  
**Target Platform**: Web application (Django server + browser frontend)  
**Project Type**: Web service (Django REST API + server-rendered templates with JS)  
**Performance Goals**: Standard web app — page loads under 3 seconds, API responses under 500ms  
**Constraints**: Dataset is 953 permanent places (not time-limited events). Max 5 events per daily plan.  
**Scale/Scope**: Single-user dev environment, ~953 events, ~15 templates, ~7 JS files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file is a blank template — no project-specific gates defined. No violations to check.

**Pre-Phase 0**: PASS (no gates)  
**Post-Phase 1**: PASS (no gates)

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-frontend-api-integration/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Research findings
├── data-model.md        # Phase 1: Data model changes
├── quickstart.md        # Phase 1: Development quickstart
├── contracts/
│   └── api-contracts.md # Phase 1: API contract definitions
├── checklists/
│   └── requirements.md  # Specification quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
config/                  # Django project settings, URLs, WSGI
├── settings.py
├── urls.py
└── settings_production.py

accounts/                # Auth, user profile, preferences
├── models.py            # User, UserPreferences
├── serializers.py       # Signup, Login, UserPreferences serializers
├── views.py             # Auth views, /me/, /preferences/
├── urls.py
└── tests.py

events/                  # Places/events + NEW favorites
├── models.py            # Event + NEW Favorite model
├── serializers.py       # EventSerializer + NEW FavoriteSerializer
├── views.py             # Event list/detail/filtered + NEW favorite views
├── api_urls.py          # API routes + NEW /favorites/ routes
└── tests.py

daily_plan/              # Daily plan generation
├── models.py            # DailyPlan (no changes)
├── serializers.py       # DailyPlanSerializer (FIX: nested events)
├── services.py          # generate_recommendations (IMPROVE: scoring)
├── views.py             # Generate, list, detail views
├── urls.py
└── tests.py

static/js/               # Frontend JavaScript
├── api.js               # Shared API layer (no changes)
├── daily_plan_integration.js  # Daily plan UI (verify data flow)
├── events.js            # Events list (ADD: pagination, favorites sync)
├── home.js              # Home dashboard (no changes)
├── map.js               # Google Maps (no changes expected)
├── auth.js              # Auth forms (no changes)
└── login.js             # Login form (no changes)

templates/               # Django templates
├── settings.html        # FIX: Connect to preferences API
├── profile.html         # VERIFY: API connections working
├── daily_plan.html      # VERIFY: Data display after serializer fix
├── events_list.html     # ADD: Load More button
└── [other templates]    # No changes expected
```

**Structure Decision**: Existing Django app structure is maintained. The only new model (`Favorite`) is added to the `events` app since it relates users to events. No new apps or structural changes needed.

## Complexity Tracking

No constitution violations to justify — no complexity tracking needed.
