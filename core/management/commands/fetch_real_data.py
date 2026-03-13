"""
Management command to fetch real Riyadh places from the Overpass API (OpenStreetMap).
No API key required.

Usage:
    python manage.py fetch_real_data
    python manage.py fetch_real_data --dry-run   # preview without saving
    python manage.py fetch_real_data --limit 200 # cap at 200 places
"""

import random
import time
import requests
from django.core.management.base import BaseCommand
from django.utils import timezone
from events.models import Event

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
RIYADH_LAT = 24.7136
RIYADH_LNG = 46.6753
RADIUS_M = 25_000  # 25 km

# OSM tag → (Event category, human-readable type label)
QUERIES = [
    ('amenity', 'restaurant', 'food',     'Restaurant'),
    ('amenity', 'cafe',       'food',     'Café'),
    ('tourism', 'museum',     'culture',  'Museum'),
    ('tourism', 'attraction', 'culture',  'Attraction'),
    ('leisure', 'park',       'outdoor',  'Park'),
    ('shop',    'mall',       'shopping', 'Shopping Mall'),
]

# Realistic SAR price ranges per category
PRICE_RANGES = {
    'food':     (25, 180),
    'culture':  (0,  50),
    'outdoor':  (0,  0),
    'shopping': (0,  0),
}

DESCRIPTIONS = {
    'food': [
        "A popular dining destination in Riyadh offering a variety of dishes.",
        "Enjoy an authentic culinary experience in the heart of Riyadh.",
        "A beloved local eatery known for fresh ingredients and great flavors.",
        "From traditional Saudi cuisine to international fare — a great choice.",
    ],
    'culture': [
        "Explore the rich history and heritage of Saudi Arabia at this landmark.",
        "A cultural gem in Riyadh showcasing art, history, and tradition.",
        "An unmissable attraction offering a window into Saudi culture.",
        "Discover fascinating exhibits and stories from the Arabian Peninsula.",
    ],
    'outdoor': [
        "A scenic green space perfect for relaxation and outdoor activities.",
        "Enjoy fresh air and open skies at this well-maintained Riyadh park.",
        "A family-friendly outdoor destination in the city.",
        "A peaceful retreat from the hustle of urban life.",
    ],
    'shopping': [
        "One of Riyadh's premier shopping destinations with top brands.",
        "A world-class mall offering fashion, dining, and entertainment.",
        "Shop, dine, and explore at this iconic Riyadh mall.",
        "A modern retail hub at the center of Riyadh's commercial scene.",
    ],
}

DEFAULT_MAX = 500

# ---------------------------------------------------------------------------
# Overpass query builder
# ---------------------------------------------------------------------------

def _build_query(key: str, value: str) -> str:
    """Return an Overpass QL query for nodes/ways/relations near Riyadh."""
    return f"""
[out:json][timeout:60];
(
  node["{key}"="{value}"](around:{RADIUS_M},{RIYADH_LAT},{RIYADH_LNG});
  way["{key}"="{value}"](around:{RADIUS_M},{RIYADH_LAT},{RIYADH_LNG});
);
out center tags;
""".strip()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_name(tags: dict) -> str | None:
    """Prefer English name, fall back to Arabic, then generic name."""
    return (
        tags.get("name:en")
        or tags.get("name:ar")
        or tags.get("name")
    )


def _pick_price(category: str) -> float:
    lo, hi = PRICE_RANGES.get(category, (0, 0))
    if lo == hi:
        return float(lo)
    return float(random.randint(lo, hi))


def _pick_description(category: str) -> str:
    options = DESCRIPTIONS.get(category, ["A unique place to visit in Riyadh."])
    return random.choice(options)


def _get_coords(element: dict) -> tuple[float | None, float | None]:
    """Return (lat, lng) from a node or a way's center."""
    if element["type"] == "node":
        return element.get("lat"), element.get("lon")
    center = element.get("center", {})
    return center.get("lat"), center.get("lon")


# ---------------------------------------------------------------------------
# Command
# ---------------------------------------------------------------------------

class Command(BaseCommand):
    help = "Fetch real Riyadh places from Overpass API and save them as Events."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview fetched places without writing to the database.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=DEFAULT_MAX,
            metavar="N",
            help=f"Maximum number of places to save (default: {DEFAULT_MAX}).",
        )

    def handle(self, *args, **options):
        dry_run: bool = options["dry_run"]
        limit: int = options["limit"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — nothing will be saved.\n"))

        all_places: list[dict] = []

        # ------------------------------------------------------------------ #
        # 1. Fetch from Overpass for each OSM tag combination                 #
        # ------------------------------------------------------------------ #
        for key, value, category, label in QUERIES:
            self.stdout.write(f"  Querying {label} ({key}={value})…", ending=" ")
            self.stdout.flush()

            query = _build_query(key, value)
            try:
                resp = requests.post(
                    OVERPASS_URL,
                    data={"data": query},
                    timeout=90,
                    headers={"User-Agent": "Tizahab/1.0 (tourism planning app)"},
                )
                resp.raise_for_status()
                elements = resp.json().get("elements", [])
            except requests.Timeout:
                self.stdout.write(self.style.ERROR("TIMEOUT — skipping."))
                continue
            except requests.RequestException as exc:
                self.stdout.write(self.style.ERROR(f"ERROR: {exc} — skipping."))
                continue

            count = 0
            for el in elements:
                tags = el.get("tags", {})
                name = _extract_name(tags)
                if not name:
                    continue
                lat, lng = _get_coords(el)
                all_places.append({
                    "title":    name.strip(),
                    "category": category,
                    "lat":      lat,
                    "lng":      lng,
                })
                count += 1

            self.stdout.write(self.style.SUCCESS(f"{count} places found."))

            # Be polite to the free Overpass API
            time.sleep(1)

        # ------------------------------------------------------------------ #
        # 2. Deduplicate within the fetched batch (same name + category)      #
        # ------------------------------------------------------------------ #
        seen_titles: set[str] = set()
        unique_places: list[dict] = []
        for p in all_places:
            key_str = p["title"].lower()
            if key_str not in seen_titles:
                seen_titles.add(key_str)
                unique_places.append(p)

        unique_places = unique_places[:limit]

        self.stdout.write(
            f"\nFetched {len(all_places)} total, "
            f"{len(unique_places)} unique (after dedup + limit={limit}).\n"
        )

        # ------------------------------------------------------------------ #
        # 3. Dry-run preview                                                  #
        # ------------------------------------------------------------------ #
        if dry_run:
            self.stdout.write(self.style.HTTP_INFO("Preview (first 20):"))
            for p in unique_places[:20]:
                lat_str = f"{p['lat']:.4f}" if p["lat"] else "n/a"
                lng_str = f"{p['lng']:.4f}" if p["lng"] else "n/a"
                self.stdout.write(
                    f"  [{p['category']:8s}] {p['title'][:60]:<60}  "
                    f"lat={lat_str} lng={lng_str}"
                )
            self.stdout.write(
                self.style.WARNING(
                    f"\nDry run complete. Would process {len(unique_places)} places."
                )
            )
            return

        # ------------------------------------------------------------------ #
        # 4. Save to database                                                 #
        # ------------------------------------------------------------------ #
        now = timezone.now()
        added = skipped = 0

        for p in unique_places:
            title = p["title"]

            # Skip if a place with this exact title already exists
            if Event.objects.filter(title=title).exists():
                skipped += 1
                continue

            Event.objects.create(
                title=title,
                category=p["category"],
                description=_pick_description(p["category"]),
                price=_pick_price(p["category"]),
                price_range=None,
                date=now,
                start_date=None,
                end_date=None,
                location="Riyadh, Saudi Arabia",
                latitude=p["lat"],
                longitude=p["lng"],
            )
            added += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Fetched {len(unique_places)} places, "
                f"added {added} new, "
                f"skipped {skipped} duplicates."
            )
        )
