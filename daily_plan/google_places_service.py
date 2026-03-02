import os
import requests

from django.conf import settings


TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"


from django.conf import settings

def fetch_places_for_interest(interest: str, city: str = "Riyadh", limit: int = 3):

    # Temporary Mock for development (Sprint 5 stabilization)
    return [
        {
            "name": f"{interest.title()} Spot 1",
            "address": "Riyadh Boulevard",
            "rating": 4.6,
            "latitude": 24.7136,
            "longitude": 46.6753,
        },
        {
            "name": f"{interest.title()} Spot 2",
            "address": "King Fahd Road",
            "rating": 4.3,
            "latitude": 24.7200,
            "longitude": 46.6800,
        }
    ]
