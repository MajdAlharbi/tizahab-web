import os
import django
import json
from django.utils import timezone


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

django.setup()

from events.models import Event

with open("riyadh_cleaned.json", "r", encoding="utf-8") as f:
    data = json.load(f)

count = 0

for item in data:
    Event.objects.get_or_create(
        title=item["title"],
        latitude=item["latitude"],
        longitude=item["longitude"],
        defaults={
            "category": item["category"],
            "description": item["description"],
            "price_range": item["price_range"],
            "date": timezone.now(),
            "location": "Riyadh",
        }
    )
    count += 1

print(f"Imported {count} places successfully")