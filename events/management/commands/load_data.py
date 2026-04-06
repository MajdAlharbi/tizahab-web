"""
Management command to import events from the Riyadh restaurants dataset.

Reads from data/dataset-Tizahab/riyadh_resturants_clean.csv (19,361 places
with lat/lng from Foursquare).

Usage:
    python manage.py load_data
    python manage.py load_data --clear   # wipe existing events first
"""

import csv
from pathlib import Path
from django.core.management.base import BaseCommand
from django.utils import timezone
from events.models import Event

_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "dataset-Tizahab"
_CSV_FILE = _DATA_DIR / "riyadh_resturants_clean.csv"

# Map Foursquare categories → Event.category
# Uses the first matching keyword from the raw category string.
_KEYWORD_CATEGORY = [
    # Order matters — more specific keywords first
    ("food truck", "food_truck"),
    ("food stand", "food_truck"),
    ("food court", "food_truck"),
    ("coffee shop", "cafe"),
    ("café", "cafe"),
    ("cafe", "cafe"),
    ("tea room", "cafe"),
    ("juice bar", "juice"),
    ("juice", "juice"),
    ("smoothie", "juice"),
    ("dessert", "dessert"),
    ("donut", "dessert"),
    ("ice cream", "dessert"),
    ("frozen yogurt", "dessert"),
    ("cupcake", "dessert"),
    ("pastry", "dessert"),
    ("candy", "dessert"),
    ("chocolate", "dessert"),
    ("pie shop", "dessert"),
    ("creperie", "dessert"),
    ("bakery", "bakery"),
    ("bagel", "bakery"),
    ("fast food", "fast_food"),
    ("burger", "fast_food"),
    ("fried chicken", "fast_food"),
    ("pizza", "fast_food"),
    ("shawarma", "fast_food"),
    ("falafel", "fast_food"),
    ("sandwich", "fast_food"),
    ("fish & chips", "fast_food"),
    ("doner", "fast_food"),
    ("wing", "fast_food"),
    ("hot dog", "fast_food"),
    ("taco", "fast_food"),
    ("mall", "shopping"),
    ("shopping", "shopping"),
    ("grocery", "shopping"),
    ("supermarket", "shopping"),
    ("market", "shopping"),
    ("convenience store", "shopping"),
    ("department store", "shopping"),
    ("museum", "culture"),
    ("art gallery", "culture"),
    ("library", "culture"),
    ("theater", "culture"),
    ("cultural center", "culture"),
    ("mosque", "culture"),
    ("park", "outdoor"),
    ("garden", "outdoor"),
    ("playground", "outdoor"),
    ("trail", "outdoor"),
    ("zoo", "outdoor"),
    ("beach", "outdoor"),
    ("scenic lookout", "outdoor"),
]


def _classify(raw_category):
    """Match a Foursquare category string to an Event category."""
    lower = raw_category.lower()
    for keyword, category in _KEYWORD_CATEGORY:
        if keyword in lower:
            return category
    # Default: if it contains "restaurant" anywhere, it's a restaurant
    if "restaurant" in lower:
        return "restaurant"
    # Remaining food-related terms
    for term in ["steakhouse", "bbq", "noodle", "dumpling", "sushi",
                  "seafood", "bistro", "diner", "buffet", "cafeteria",
                  "breakfast", "brunch", "snack", "food"]:
        if term in lower:
            return "restaurant"
    return "other"

# Convert Foursquare price labels to SAR values
_PRICE_MAP = {
    "Cheap": 25.0,
    "Moderate": 75.0,
    "Expensive": 150.0,
    "Very Expensive": 250.0,
}


class Command(BaseCommand):
    help = "Import Riyadh places from riyadh_resturants_clean.csv into the Event table."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all existing events before importing.",
        )

    def handle(self, *args, **options):
        if not _CSV_FILE.exists():
            self.stderr.write(self.style.ERROR(
                f"Dataset not found: {_CSV_FILE}"
            ))
            return

        if options["clear"]:
            deleted, _ = Event.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Deleted {deleted} existing events."))

        now = timezone.now()
        created_count = 0
        updated_count = 0
        skipped_count = 0

        self.stdout.write(f"Reading {_CSV_FILE.name}...")

        with open(_CSV_FILE, encoding="utf-8") as f:
            reader = csv.DictReader(f)

            for row in reader:
                name = (row.get("name") or "").strip()
                if not name:
                    skipped_count += 1
                    continue

                # Map category
                raw_cat = (row.get("categories") or "").strip()
                category = _classify(raw_cat)

                # Parse coordinates
                try:
                    lat = float(row.get("lat", ""))
                    lng = float(row.get("lng", ""))
                except (ValueError, TypeError):
                    lat = None
                    lng = None

                # Parse price
                price_label = (row.get("price") or "").strip()
                price = _PRICE_MAP.get(price_label)

                # Parse rating
                rating = None
                raw_rating = (row.get("rating") or "").strip()
                if raw_rating:
                    try:
                        r = float(raw_rating)
                        # Foursquare uses 0-10 scale, convert to 0-5
                        rating = round(r / 2, 1) if 0 <= r <= 10 else None
                    except (ValueError, TypeError):
                        pass

                # Build description from category + address
                address = (row.get("address") or "").strip()
                description = raw_cat.title() or "Place in Riyadh"
                if address:
                    description = f"{description} — {address}"

                obj, created = Event.objects.update_or_create(
                    title=name,
                    defaults={
                        "category": category,
                        "description": description,
                        "price": price,
                        "price_range": price_label or None,
                        "rating": rating,
                        "date": now,
                        "start_date": None,
                        "end_date": None,
                        "location": "Riyadh",
                        "latitude": lat,
                        "longitude": lng,
                    },
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1

        total = created_count + updated_count
        self.stdout.write(self.style.SUCCESS(
            f"Done. Created: {created_count}, Updated: {updated_count}, "
            f"Skipped: {skipped_count}, Total: {total}"
        ))
