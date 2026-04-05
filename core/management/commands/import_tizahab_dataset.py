import json
import os
from datetime import datetime, timezone

from django.conf import settings
from django.core.management.base import BaseCommand

from events.models import Event

DATASET_DIR = os.path.join(settings.BASE_DIR, "data", "dataset-Tizahab")

PRICE_MAP = {
    "$": 30,
    "$$": 80,
    "$$$": 150,
}

CATEGORY_MAP = {
    "restaurant": "food",
    "cafe": "food",
    "mall": "shopping",
    "museum": "culture",
}

NOW = datetime.now(tz=timezone.utc)


def _price(record):
    raw = record.get("Price_Level") or record.get("Price_Range")
    return PRICE_MAP.get(raw) if raw else None


def _category(type_of_utility):
    return CATEGORY_MAP.get(type_of_utility.lower(), "other")


def _description(name, type_of_utility):
    return f"{name} — {type_of_utility} in Riyadh"


class Command(BaseCommand):
    help = (
        "Import Tizahab dataset (cafes, restaurants, malls/museums) into Event table."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all existing events before importing.",
        )

    def handle(self, *args, **options):
        if options["clear"]:
            deleted, _ = Event.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {deleted} existing events."))

        seen_titles = {t.lower() for t in Event.objects.values_list("title", flat=True)}

        stats = {"food": 0, "shopping": 0, "culture": 0, "skipped": 0}

        # ── Restaurants (limit 2000, highest-rated first) ──────────────────────
        restaurants_path = os.path.join(DATASET_DIR, "restaurants_cleaned.json")
        with open(restaurants_path, encoding="utf-8") as f:
            restaurants = json.load(f)

        restaurants.sort(key=lambda r: r.get("Rating") or 0, reverse=True)
        restaurants = restaurants[:2000]

        self.stdout.write(f"Importing up to {len(restaurants)} restaurants…")
        count = 0
        for record in restaurants:
            name = record.get("Name", "").strip()
            if not name or name.lower() in seen_titles:
                stats["skipped"] += 1
                continue
            seen_titles.add(name.lower())
            Event.objects.create(
                title=name,
                category="food",
                description=_description(
                    name, record.get("Type_of_Utility", "Restaurant")
                ),
                date=NOW,
                location="Riyadh, Saudi Arabia",
                price=_price(record),
                rating=record.get("Rating"),
                latitude=None,
                longitude=None,
            )
            count += 1
            stats["food"] += 1
            if count % 500 == 0:
                self.stdout.write(f"  … {count} restaurants imported")
        self.stdout.write(self.style.SUCCESS(f"Restaurants done: {count} imported."))

        # ── Cafes ──────────────────────────────────────────────────────────────
        cafes_path = os.path.join(DATASET_DIR, "cafes_cleaned.json")
        with open(cafes_path, encoding="utf-8") as f:
            cafes = json.load(f)

        self.stdout.write(f"Importing {len(cafes)} cafes…")
        count = 0
        for i, record in enumerate(cafes):
            name = record.get("Name", "").strip()
            if not name or name.lower() in seen_titles:
                stats["skipped"] += 1
                continue
            seen_titles.add(name.lower())
            Event.objects.create(
                title=name,
                category="food",
                description=_description(name, record.get("Type_of_Utility", "Cafe")),
                date=NOW,
                location="Riyadh, Saudi Arabia",
                price=_price(record),
                rating=record.get("Rating"),
                latitude=None,
                longitude=None,
            )
            count += 1
            stats["food"] += 1
            if (i + 1) % 500 == 0:
                self.stdout.write(f"  … {i + 1} cafes processed")
        self.stdout.write(self.style.SUCCESS(f"Cafes done: {count} imported."))

        # ── Malls & Museums ────────────────────────────────────────────────────
        malls_path = os.path.join(DATASET_DIR, "riyadh_malls_museums.json")
        with open(malls_path, encoding="utf-8") as f:
            malls = json.load(f)

        self.stdout.write(f"Importing {len(malls)} malls/museums…")
        count = 0
        for record in malls:
            name = record.get("Name", "").strip()
            if not name or name.lower() in seen_titles:
                stats["skipped"] += 1
                continue
            seen_titles.add(name.lower())
            type_util = record.get("Type_of_Utility", "")
            cat = _category(type_util)
            Event.objects.create(
                title=name,
                category=cat,
                description=_description(name, type_util),
                date=NOW,
                location="Riyadh, Saudi Arabia",
                price=_price(record),
                rating=record.get("Rating"),
                latitude=None,
                longitude=None,
            )
            count += 1
            stats[cat] = stats.get(cat, 0) + 1
        self.stdout.write(self.style.SUCCESS(f"Malls/museums done: {count} imported."))

        # ── Summary ────────────────────────────────────────────────────────────
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=== Import complete ==="))
        self.stdout.write(f"  food     : {stats['food']}")
        self.stdout.write(f"  shopping : {stats.get('shopping', 0)}")
        self.stdout.write(f"  culture  : {stats.get('culture', 0)}")
        self.stdout.write(f"  skipped  : {stats['skipped']} (duplicates / blank names)")
        self.stdout.write(
            f"  TOTAL    : {stats['food'] + stats.get('shopping', 0) + stats.get('culture', 0)}"
        )
