import json

CATEGORY_MAP = {
    "restaurant": "food",
    "cafe": "food",
    "fast_food": "food",
    "museum": "culture",
    "attraction": "culture",
    "park": "outdoor",
    "sports_centre": "outdoor",
    "mall": "shopping",
}

with open("export (1).geojson", "r", encoding="utf-8") as f:
    data = json.load(f)

cleaned = []
seen = set()

for feature in data["features"]:
    props = feature.get("properties", {})
    geometry = feature.get("geometry", {})

    if geometry.get("type") != "Point":
        continue

    coords = geometry.get("coordinates", [])
    if len(coords) != 2:
        continue

    lon, lat = coords
    name = props.get("name")

    if not name:
        continue

    # منع التكرار
    key = (name.lower(), lat, lon)
    if key in seen:
        continue
    seen.add(key)

    raw_category = (
        props.get("amenity")
        or props.get("tourism")
        or props.get("leisure")
        or props.get("shop")
    )

    category = CATEGORY_MAP.get(raw_category, "other")

    cleaned.append({
        "title": name.strip(),
        "category": category,
        "latitude": lat,
        "longitude": lon,
        "description": "Imported from OpenStreetMap",
        "price_range": "Unknown",
    })

print(f"Total cleaned places: {len(cleaned)}")

with open("riyadh_cleaned.json", "w", encoding="utf-8") as f:
    json.dump(cleaned, f, ensure_ascii=False, indent=2)

print("Saved to riyadh_cleaned.json")