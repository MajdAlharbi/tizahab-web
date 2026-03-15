"""
Fetch outdoor and entertainment places for Riyadh from the Overpass API.

Usage:
    python manage.py fetch_outdoor_data
"""

import requests
from datetime import datetime, timezone

from django.core.management.base import BaseCommand

from events.models import Event

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

COMBINED_QUERY = """
[out:json][timeout:60];
(
  node["leisure"="park"](23.5,46.4,25.0,47.5);
  node["leisure"="playground"](23.5,46.4,25.0,47.5);
  node["leisure"="sports_centre"](23.5,46.4,25.0,47.5);
  node["leisure"="stadium"](23.5,46.4,25.0,47.5);
  node["tourism"="attraction"](23.5,46.4,25.0,47.5);
  node["tourism"="theme_park"](23.5,46.4,25.0,47.5);
  node["amenity"="cinema"](23.5,46.4,25.0,47.5);
  node["amenity"="theatre"](23.5,46.4,25.0,47.5);
  node["amenity"="arts_centre"](23.5,46.4,25.0,47.5);
);
out body 500;
""".strip()

# Which OSM tag value maps to which Event category
TAG_CATEGORY = {
    "park": "outdoor",
    "playground": "outdoor",
    "sports_centre": "outdoor",
    "stadium": "outdoor",
    "attraction": "other",
    "theme_park": "other",
    "cinema": "other",
    "theatre": "other",
    "arts_centre": "other",
}

HARDCODED_PLACES = [
    {"title": "King Abdullah Park", "category": "outdoor", "price": None, "lat": 24.6877, "lng": 46.7219, "description": "Large public park in Riyadh with walking trails and green spaces."},
    {"title": "Salam Park", "category": "outdoor", "price": None, "lat": 24.7453, "lng": 46.6589, "description": "Family park with outdoor activities and recreational areas."},
    {"title": "Riyadh Zoo", "category": "outdoor", "price": 20, "lat": 24.6201, "lng": 46.7705, "description": "Home to hundreds of animal species in Riyadh."},
    {"title": "King Fahd Cultural Centre", "category": "other", "price": 50, "lat": 24.6877, "lng": 46.6869, "description": "Premier cultural and arts venue hosting concerts and exhibitions."},
    {"title": "Boulevard Riyadh City", "category": "other", "price": None, "lat": 24.7692, "lng": 46.6935, "description": "Entertainment destination with restaurants, rides and shows."},
    {"title": "Al Nakheel Park", "category": "outdoor", "price": None, "lat": 24.7892, "lng": 46.6412, "description": "Public park in northern Riyadh ideal for family outings."},
    {"title": "Dirab Golf & Country Club", "category": "outdoor", "price": 200, "lat": 24.5441, "lng": 46.5631, "description": "Championship golf course surrounded by desert landscape."},
    {"title": "Riyadh Season Park", "category": "other", "price": None, "lat": 24.7711, "lng": 46.6889, "description": "Annual entertainment hub hosting events and performances."},
    {"title": "Al Hamra Oasis Village", "category": "outdoor", "price": 30, "lat": 24.6011, "lng": 46.5921, "description": "Outdoor recreation and adventure activities in Riyadh outskirts."},
    {"title": "King Salman Park", "category": "outdoor", "price": None, "lat": 24.7011, "lng": 46.6411, "description": "One of the largest urban parks in the world under development."},
    {"title": "Via Riyadh", "category": "other", "price": None, "lat": 24.7741, "lng": 46.7021, "description": "Modern entertainment and shopping destination in Riyadh."},
    {"title": "Al Mamlaka Theatre", "category": "other", "price": 80, "lat": 24.6921, "lng": 46.6831, "description": "Theatre venue hosting cultural performances and shows."},
    {"title": "Wadi Hanifah", "category": "outdoor", "price": None, "lat": 24.5891, "lng": 46.5521, "description": "Natural valley offering hiking and nature walks near Riyadh."},
    {"title": "Thumamah National Park", "category": "outdoor", "price": None, "lat": 25.0211, "lng": 46.7011, "description": "Protected natural area north of Riyadh for camping and hiking."},
    {"title": "Riyadh Front", "category": "other", "price": None, "lat": 24.7511, "lng": 46.6211, "description": "Mixed-use entertainment and dining destination in Riyadh."},
    {"title": "Al Rabwa Garden", "category": "outdoor", "price": None, "lat": 24.6711, "lng": 46.6411, "description": "Scenic garden area popular for evening walks and picnics."},
    {"title": "Panorama Mall Ice Rink", "category": "other", "price": 60, "lat": 24.7091, "lng": 46.6791, "description": "Indoor ice skating rink inside Panorama Mall."},
    {"title": "Riyadh Go-Kart", "category": "other", "price": 100, "lat": 24.7211, "lng": 46.6911, "description": "Go-kart racing track for all ages in Riyadh."},
    {"title": "Al Faisaliah Tower Observation Deck", "category": "outdoor", "price": 75, "lat": 24.6911, "lng": 46.6831, "description": "Stunning 360-degree views of Riyadh from the observation deck."},
    {"title": "Escape Hunt Riyadh", "category": "other", "price": 120, "lat": 24.7011, "lng": 46.6711, "description": "Escape room adventure experience in the heart of Riyadh."},
    {"title": "Bounce Riyadh", "category": "other", "price": 80, "lat": 24.7311, "lng": 46.6511, "description": "Indoor trampoline park with obstacle courses and foam pits."},
    {"title": "Kidzania Riyadh", "category": "other", "price": 150, "lat": 24.7011, "lng": 46.7311, "description": "Educational entertainment city for children in Riyadh."},
    {"title": "National Museum of Saudi Arabia", "category": "culture", "price": 20, "lat": 24.6881, "lng": 46.7081, "description": "Explore Saudi Arabia's rich history and heritage across 8 galleries."},
    {"title": "Murabba Palace", "category": "culture", "price": 15, "lat": 24.6531, "lng": 46.7131, "description": "Historic palace of King Abdulaziz in central Riyadh."},
    {"title": "Al Masmak Fortress", "category": "culture", "price": 0, "lat": 24.6881, "lng": 46.7131, "description": "19th-century mud-brick fortress central to Saudi history."},
    {"title": "Riyadh City Tour Bus", "category": "other", "price": 50, "lat": 24.7111, "lng": 46.6811, "description": "Hop-on hop-off bus tour covering Riyadh's top attractions."},
    {"title": "VR Park Riyadh", "category": "other", "price": 90, "lat": 24.7211, "lng": 46.6911, "description": "Virtual reality gaming and experience park in Riyadh."},
    {"title": "Ithra Museum Riyadh Branch", "category": "culture", "price": 30, "lat": 24.7011, "lng": 46.6811, "description": "Contemporary art and innovation exhibitions in Riyadh."},
    {"title": "Riyadh Cycling Track", "category": "outdoor", "price": 0, "lat": 24.7511, "lng": 46.6611, "description": "Dedicated cycling paths through scenic areas of Riyadh."},
    {"title": "Safari Riyadh", "category": "outdoor", "price": 180, "lat": 24.5211, "lng": 46.4911, "description": "Desert safari adventure with quad biking and dune bashing."},
]


def _name(tags: dict) -> str | None:
    raw = tags.get("name:en") or tags.get("name")
    if not raw or raw.strip().lower() == "unknown":
        return None
    return raw.strip()


def _tag_type(tags: dict) -> str | None:
    """Return the first matching OSM tag value we care about."""
    for key in ("leisure", "tourism", "amenity"):
        val = tags.get(key)
        if val and val in TAG_CATEGORY:
            return val
    return None


class Command(BaseCommand):
    help = "Seed outdoor/entertainment places from hardcoded list + Overpass API."

    def handle(self, *args, **options):
        now = datetime.now(tz=timezone.utc)
        added = skipped = 0
        category_counts: dict[str, int] = {}

        def _save(title, category, description, price, lat, lng):
            nonlocal added, skipped
            if Event.objects.filter(title__iexact=title).exists():
                skipped += 1
                return
            Event.objects.create(
                title=title,
                category=category,
                description=description,
                price=price,
                date=now,
                location="Riyadh, Saudi Arabia",
                latitude=lat,
                longitude=lng,
                rating=None,
            )
            added += 1
            category_counts[category] = category_counts.get(category, 0) + 1

        # ── 1. Hardcoded seeds ─────────────────────────────────────────────────
        self.stdout.write("Seeding 30 hardcoded places…")
        for p in HARDCODED_PLACES:
            _save(
                title=p["title"],
                category=p["category"],
                description=p["description"],
                price=p["price"],
                lat=p["lat"],
                lng=p["lng"],
            )
        self.stdout.write(self.style.SUCCESS(f"  Hardcoded: {added} added, {skipped} skipped."))

        # ── 2. Overpass API (single combined query) ────────────────────────────
        self.stdout.write("Fetching from Overpass API…")
        try:
            resp = requests.post(
                OVERPASS_URL,
                data={"data": COMBINED_QUERY},
                timeout=90,
                headers={"User-Agent": "Tizahab/1.0 (tourism planning app)"},
            )
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
        except requests.Timeout:
            self.stdout.write(self.style.ERROR("Overpass API timed out — skipping API fetch."))
            elements = []
        except requests.RequestException as exc:
            self.stdout.write(self.style.ERROR(f"Overpass API error: {exc} — skipping API fetch."))
            elements = []

        # Count per tag type for reporting
        tag_type_counts: dict[str, int] = {}
        api_added = 0

        for el in elements:
            tags = el.get("tags", {})
            name = _name(tags)
            if not name:
                continue
            tag_val = _tag_type(tags)
            if not tag_val:
                continue
            category = TAG_CATEGORY[tag_val]
            description = f"{name} — {tag_val} in Riyadh"
            lat = el.get("lat")
            lng = el.get("lon")

            before = added
            _save(title=name, category=category, description=description, price=None, lat=lat, lng=lng)
            if added > before:
                api_added += 1
                tag_type_counts[tag_val] = tag_type_counts.get(tag_val, 0) + 1

        self.stdout.write(f"  API returned {len(elements)} nodes.")
        if tag_type_counts:
            for tag_val, cnt in sorted(tag_type_counts.items()):
                self.stdout.write(f"    {tag_val:20s}: {cnt} added")
        else:
            self.stdout.write("  (no new API places added)")

        # ── 3. Summary ─────────────────────────────────────────────────────────
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=== fetch_outdoor_data complete ==="))
        self.stdout.write(f"  Total added   : {added}")
        self.stdout.write(f"  Total skipped : {skipped} (already in DB)")
        self.stdout.write("  By category:")
        for cat, cnt in sorted(category_counts.items()):
            self.stdout.write(f"    {cat:12s}: {cnt}")
        self.stdout.write("")
        self.stdout.write("DB totals by category:")
        for cat in ["food", "shopping", "culture", "outdoor", "other"]:
            self.stdout.write(f"  {cat:12s}: {Event.objects.filter(category=cat).count()}")
        self.stdout.write(f"  {'TOTAL':12s}: {Event.objects.count()}")
