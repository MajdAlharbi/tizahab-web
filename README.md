🌍 Tizahab – Smart Tourism Planner for Riyadh

Tizahab is a smart tourism web platform designed to help users discover events and generate personalized daily plans in Riyadh.

The system integrates authentication, user preferences, events discovery, rule-based AI recommendation logic, and Google Places API to dynamically generate daily itineraries.

⸻

🚀 Project Overview

Tizahab allows users to:
 • Register and authenticate securely (JWT-based authentication)
 • Set tourism preferences (interests + budget)
 • Browse events
 • Generate AI-based daily plans
 • View recommended places dynamically
 • Interact with map-based content

The platform is structured in incremental sprints following Agile methodology.

⸻

🏗️ Architecture

Backend: Django + Django REST Framework
Frontend: HTML + TailwindCSS + JavaScript
Authentication: JWT (SimpleJWT)
External API: Google Places API (with fallback mechanism)
Database: SQLite (Development)

System Design:

User → Preferences → Events → AI Recommendation Service → Daily Plan → UI Rendering

AI logic is separated into a service layer for scalability and clean architecture.

⸻

🧠 AI Daily Plan Logic (Sprint 4)

The recommendation engine is rule-based (no ML used).

How it works:
 1. Retrieve user preferences (interests + budget)
 2. For each interest:
 • Fetch dynamic places from Google Places API
 • If API fails → fallback mock data
 3. Convert results into Event objects
 4. Create a DailyPlan linked to the authenticated user
 5. Return structured response

Design Decisions:
 • Service layer separation (services.py)
 • External API isolation (google_places_service.py)
 • Extendable architecture for future ML integration

⸻

🔐 Authentication

JWT-based authentication using SimpleJWT.

Protected endpoints require:

Authorization: Bearer <access_token>

User isolation is enforced at the queryset level:
 • Users can only access their own Daily Plans
 • Users cannot retrieve or modify others’ data

⸻

📡 Main API Endpoints

Authentication

POST /api/auth/login/
POST /api/auth/register/

Events

GET /api/events/

Daily Plan

GET /api/daily-plan/
POST /api/daily-plan/
POST /api/daily-plan/generate/
GET /api/daily-plan//

⸻

🗺️ Maps Integration (Sprint 5)
 • Interactive map embedded in Events page
 • Daily Plan map integration
 • Dynamic markers from backend events
 • Responsive UI for desktop and mobile

⸻

🌐 Localization
 • English / Arabic toggle
 • RTL support
 • UI text abstraction for translation
 • Layout consistency in both directions

⸻

🎨 UI/UX Standards
 • Tailwind-based consistent design system
 • Standardized spacing, typography, and colors
 • Loading states
 • Empty states
 • Auth guards
 • Responsive layout

⸻

🧪 Testing Strategy
 • Backend tested via PowerShell + Thunder Client
 • JWT authentication validation
 • Permission isolation verification
 • API response validation
 • Manual UI validation

Sprint 6 will include formal testing and deployment validation.

⸻

⚙️ Local Setup
 1. Clone repository
 2. Create virtual environment
 3. Install requirements
 4. Apply migrations
 5. Run server

python manage.py migrate
python manage.py runserver

Optional:

Add Google Places API key in environment variables:

GOOGLE_PLACES_API_KEY=your_key_here

If no key is provided → system automatically uses mock fallback.

⸻

📁 Folder Structure (Simplified)

tizahab-web/
│
├── config/
├── events/
├── daily_plan/
│   ├── services.py
│   ├── google_places_service.py
│   ├── views.py
│
├── templates/
├── static/


⸻

🔄 Sprint Progress
 • Sprint 1 – Foundation & Environment
 • Sprint 2 – Authentication & Preferences
 • Sprint 3 – Events Integration
 • Sprint 4 – AI & Daily Plan
 • Sprint 5 – Maps, UI & Localization
 • Sprint 6 – Testing & Deployment

⸻

🛠️ Future Improvements
 • ML-based recommendation engine
 • Real-time event ranking
 • Caching Google API results
 • User feedback loop
 • Admin dashboard analytics
 • Production deployment

⸻

Backend Core APIs
Backend AI & Integration
Frontend UI
Frontend Integration & Auth

Agile workflow with feature branches + PR review before merge.

⸻

🎯 Project Goal

Deliver a scalable, clean-architecture tourism planning platform aligned with Saudi Vision 2030 tourism objectives.
