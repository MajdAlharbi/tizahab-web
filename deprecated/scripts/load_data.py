import os
import django
import json
from datetime import date  # 👈 جديد

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from events.models import Event

files = [
    "data/dataset-Tizahab/cafes_cleaned.json",
    "data/dataset-Tizahab/restaurants_cleaned.json",
    "data/dataset-Tizahab/riyadh_malls_museums.json"
]

Event.objects.all().delete()

for file in files:
    with open(file, encoding="utf-8") as f:
        data = json.load(f)

    for item in data:
        Event.objects.create(
            title=item.get("Name"),
            category=item.get("Type_of_Utility"),
            location="Riyadh",
            date=date.today(),  # 👈 الحل هنا
            description=f"Rating: {item.get('Rating')} | Price: {item.get('Price_Level') or item.get('Price_Range')}"
        )

print("DONE ✅")