"""
Management command to import events from riyadh_cleaned.json.

Usage:
    python manage.py load_data
    python manage.py load_data --clear   # wipe existing events first
"""

import json
from pathlib import Path
from django.core.management.base import BaseCommand
from django.utils import timezone
from events.models import Event

# Deterministic category-based pricing (SAR).
# Uses abs(hash(title)) % spread + base so each place gets a consistent price.
_PRICE_CONFIG = {
    "food": {"base": 20, "spread": 130},  # 20–150 SAR
    "culture": {"base": 0, "spread": 50},  # 0–50 SAR (many are free)
    "outdoor": {"base": 0, "spread": 0},  # free
    "shopping": {"base": 0, "spread": 0},  # no entry fee
    "other": {"base": 0, "spread": 30},
}

_DATA_FILE = Path(__file__).resolve().parents[3] / "riyadh_cleaned.json"


def _price_for(title: str, category: str) -> float | None:
    cfg = _PRICE_CONFIG.get(category, {"base": 0, "spread": 0})
    spread = cfg["spread"]
    if spread == 0:
        return float(cfg["base"])
    return float(cfg["base"] + (abs(hash(title)) % spread))


class Command(BaseCommand):
    help = "Import Riyadh places from riyadh_cleaned.json into the Event table."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all existing events before importing.",
        )

    def handle(self, *args, **options):
        if not _DATA_FILE.exists():
            self.stderr.write(self.style.ERROR(f"Data file not found: {_DATA_FILE}"))
            return

        if options["clear"]:
            deleted, _ = Event.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Deleted {deleted} existing events."))

        with open(_DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        created_count = 0
        updated_count = 0
        now = timezone.now()

        for item in data:
            title = item.get("title", "").strip()
            category = item.get("category", "other").strip().lower()
            if not title:
                continue

            price = _price_for(title, category)

            obj, created = Event.objects.update_or_create(
                title=title,
                defaults={
                    "category": category,
                    "description": item.get("description")
                    or "Imported from OpenStreetMap",
                    "price_range": item.get("price_range") or "Unknown",
                    "price": price,
                    "date": now,
                    "start_date": None,
                    "end_date": None,
                    "location": "Riyadh",
                    "latitude": item.get("latitude"),
                    "longitude": item.get("longitude"),
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Created: {created_count}, Updated: {updated_count}, Total: {created_count + updated_count}"
            )
        )
