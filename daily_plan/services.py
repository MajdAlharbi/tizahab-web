from datetime import datetime
from django.utils import timezone
from events.models import Event
from accounts.models import UserPreferences
from .google_places_service import fetch_places_for_interest


def generate_recommendations(user, date_str):
    try:
        preferences = user.preferences
    except UserPreferences.DoesNotExist:
        return None  # No preferences at all

    interests = preferences.interests or []
    if not interests:
        return None  # Preferences exist but no interests

    target_date = timezone.make_aware(datetime.fromisoformat(date_str))

    created_events = []

    for interest in interests:
        places = fetch_places_for_interest(
            interest=interest,
            city="Riyadh",
            limit=2
        )

        for place in places:
            title = place.get("name")
            location = place.get("address") or "Riyadh"

            event, _ = Event.objects.get_or_create(
                title=title,
                date=target_date,
                location=location,
                defaults={
                    "category": interest,
                    "description": f"Generated from Google Places (rating: {place.get('rating')})",
                    "price_range": "Unknown",
                }
            )

            created_events.append(event)

    return created_events[:5]
