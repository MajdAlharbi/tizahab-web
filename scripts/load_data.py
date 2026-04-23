import json
import os
from datetime import date

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from events.models import Event

DATASET_FILE = "data/dataset-Tizahab/cleaned_dataset.json"

# Using cleaned_dataset.json as the single source of truth
Event.objects.all().delete()

with open(DATASET_FILE, encoding="utf-8") as dataset_file:
    data = json.load(dataset_file)

for item in data:
    Event.objects.create(
        title=item.get("name"),
        category=item.get("category"),
        location=item.get("city") or "Riyadh",
        date=date.today(),
        description=item.get("subcategory") or f"Rating: {item.get('rating')}",
    )

print("DONE")
