from datetime import datetime
from django.utils import timezone
from .models import Event


def load_mock_events():
    mock_events = [
        {
            "title": "Riyadh Music Festival",
            "category": "music",
            "description": "Live performances by local and international artists.",
            "date": timezone.now(),
            "location": "Boulevard Riyadh City",
            "price_range": "100 - 300 SAR",
        },
        {
            "title": "Saudi Cultural Exhibition",
            "category": "culture",
            "description": "Discover Saudi heritage, art, and traditions.",
            "date": timezone.now(),
            "location": "King Abdulaziz Historical Center",
            "price_range": "Free",
        },
    ]

    for event_data in mock_events:
        Event.objects.get_or_create(
            title=event_data["title"],
            defaults=event_data
        )
