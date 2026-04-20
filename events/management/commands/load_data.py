"""
Management command to import events from the Riyadh restaurants CSV dataset.

Usage:
    python manage.py load_data
    python manage.py load_data --clear
"""

import csv
from pathlib import Path

from django.core.management.base import BaseCommand
from django.utils import timezone

from events.models import Event

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "dataset-Tizahab"
CSV_FILE = DATA_DIR / "riyadh_resturants_clean.csv"

KEYWORD_CATEGORY = [
    ("food truck", "food_truck"),
    ("food stand", "food_truck"),
    ("food court", "food_truck"),
    ("coffee shop", "cafe"),
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


def classify_category(raw_category):
    lower = str(raw_category or "").lower()
    for keyword, category in KEYWORD_CATEGORY:
        if keyword in lower:
            return category

    if "restaurant" in lower:
        return "restaurant"

    for term in [
        "steakhouse",
        "bbq",
        "noodle",
        "dumpling",
        "sushi",
        "seafood",
        "bistro",
        "diner",
        "buffet",
        "cafeteria",
        "breakfast",
        "brunch",
        "snack",
        "food",
    ]:
        if term in lower:
            return "restaurant"

    return "other"


class Command(BaseCommand):
    help = "Import Riyadh places from riyadh_resturants_clean.csv into the Event table."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all existing events before importing.",
        )

    def handle(self, *args, **options):
        if not CSV_FILE.exists():
            self.stderr.write(self.style.ERROR(f"Dataset not found: {CSV_FILE}"))
            return

        if options["clear"]:
            deleted, _ = Event.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Deleted {deleted} existing events."))

        now = timezone.now()
        rows_read = 0
        created_count = 0
        updated_count = 0
        skipped_count = 0

        self.stdout.write(f"Reading {CSV_FILE.name}...")

        with CSV_FILE.open(encoding="utf-8", newline="") as csv_file:
            reader = csv.DictReader(csv_file)
            self.stdout.write(f"Columns: {', '.join(reader.fieldnames or [])}")

            for row in reader:
                rows_read += 1

                name = (row.get("place_name") or "").strip()
                if not name:
                    skipped_count += 1
                    continue

                raw_category = (row.get("categories") or "").strip()
                category = classify_category(raw_category)

                try:
                    latitude = float(row.get("latitude", ""))
                    longitude = float(row.get("longitude", ""))
                except (TypeError, ValueError):
                    latitude = None
                    longitude = None

                rating = None
                raw_rating = (row.get("average_rating") or "").strip()
                if raw_rating:
                    try:
                        parsed_rating = float(raw_rating)
                        rating = round(parsed_rating, 1) if 0 <= parsed_rating <= 5 else None
                    except (TypeError, ValueError):
                        rating = None

                rate_count = (row.get("rate_count") or "").strip()
                description = raw_category.replace("|", ", ") or "Place in Riyadh"
                if rate_count:
                    description = f"{description} - {rate_count} ratings"

                _, created = Event.objects.update_or_create(
                    title=name,
                    defaults={
                        "category": category,
                        "description": description,
                        "price": None,
                        "price_range": None,
                        "rating": rating,
                        "date": now,
                        "start_date": None,
                        "end_date": None,
                        "location": "Riyadh, Saudi Arabia",
                        "latitude": latitude,
                        "longitude": longitude,
                    },
                )

                if created:
                    created_count += 1
                else:
                    updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                "Done. "
                f"Rows read: {rows_read}, "
                f"Created: {created_count}, "
                f"Updated: {updated_count}, "
                f"Skipped: {skipped_count}"
            )
        )
