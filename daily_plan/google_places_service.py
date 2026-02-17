import os
import requests

TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"


def fetch_places_for_interest(interest: str, city: str = "Riyadh", limit: int = 3):
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")

    if not api_key:
        raise ValueError("GOOGLE_PLACES_API_KEY is not set")

    query = f"{interest} in {city}"
    params = {"query": query, "key": api_key}

    resp = requests.get(TEXT_SEARCH_URL, params=params, timeout=10)
    data = resp.json()

    if data.get("status") != "OK":
        raise ValueError(f"Google API Error: {data.get('status')}")

    results = data.get("results", [])[:limit]

    places = []
    for r in results:
        places.append({
            "name": r.get("name"),
            "address": r.get("formatted_address") or city,
            "rating": r.get("rating"),
        })

    return places
