"""
Google Places API Integration Service

This service is currently using mock data for development.
To enable real API calls:
1. Ensure GOOGLE_MAPS_API_KEY is set in .env
2. Uncomment the actual API call below
3. Replace mock data with real responses
"""

import os
import requests
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"


def fetch_places_for_interest(interest: str, city: str = "Riyadh", limit: int = 3):
    """
    Fetch places matching an interest/category from Google Places API.
    
    Args:
        interest: Category (e.g., 'food', 'culture', 'outdoor')
        city: City name (default: Riyadh)
        limit: Max results (default: 3)
    
    Returns:
        list: Dict with keys: name, address, rating, latitude, longitude
    """
    api_key = settings.GOOGLE_MAPS_API_KEY
    
    if not api_key:
        logger.warning("GOOGLE_MAPS_API_KEY not configured. Using mock data.")
        return _get_mock_places(interest, limit)
    
    try:
        # Real API call (currently disabled for development)
        # query = f"{interest} in {city}"
        # params = {
        #     'query': query,
        #     'key': api_key
        # }
        # response = requests.get(TEXT_SEARCH_URL, params=params, timeout=5)
        # response.raise_for_status()
        # results = response.json().get('results', [])
        # 
        # return [
        #     {
        #         'name': r.get('name'),
        #         'address': r.get('formatted_address'),
        #         'rating': r.get('rating'),
        #         'latitude': r['geometry']['location']['lat'],
        #         'longitude': r['geometry']['location']['lng'],
        #     }
        #     for r in results[:limit]
        # ]
        
        return _get_mock_places(interest, limit)
        
    except requests.RequestException as e:
        logger.error(f"Google Places API error: {e}")
        return _get_mock_places(interest, limit)


def _get_mock_places(interest: str, limit: int = 3) -> list:
    """Fallback mock data for development."""
    mock_db = {
        'food': [
            {'name': 'Al Tazaj', 'address': 'Olaya Street', 'rating': 4.6, 'lat': 24.7136, 'lng': 46.6753},
            {'name': 'Nando\'s', 'address': 'Al Batha District', 'rating': 4.4, 'lat': 24.6753, 'lng': 46.7136},
            {'name': 'Shawarma House', 'address': 'Dammam Street', 'rating': 4.5, 'lat': 24.7200, 'lng': 46.6800},
        ],
        'culture': [
            {'name': 'National Museum', 'address': 'Museum Square', 'rating': 4.3, 'lat': 24.7136, 'lng': 46.6753},
            {'name': 'Riyadh Art Gallery', 'address': 'Arts District', 'rating': 4.2, 'lat': 24.7200, 'lng': 46.6800},
            {'name': 'Heritage Palace', 'address': 'Old Town', 'rating': 4.1, 'lat': 24.7050, 'lng': 46.6900},
        ],
        'outdoor': [
            {'name': 'Diplomatic Quarter Park', 'address': 'DQ Area', 'rating': 4.7, 'lat': 24.7136, 'lng': 46.6753},
            {'name': 'Riyadh Zoo', 'address': 'Zoo Road', 'rating': 4.5, 'lat': 24.7200, 'lng': 46.6800},
            {'name': 'Al Khayma Park', 'address': 'King Fahd Road', 'rating': 4.4, 'lat': 24.7250, 'lng': 46.6600},
        ],
        'shopping': [
            {'name': 'Riyadh Gallery', 'address': 'Downtown', 'rating': 4.6, 'lat': 24.7136, 'lng': 46.6753},
            {'name': 'Panorama Mall', 'address': 'Panorama Center', 'rating': 4.5, 'lat': 24.7200, 'lng': 46.6800},
            {'name': 'Kingdom Centre', 'address': 'City Center', 'rating': 4.4, 'lat': 24.7250, 'lng': 46.6600},
        ],
    }
    
    places = mock_db.get(interest.lower(), mock_db['food'])
    return [
        {
            'name': p['name'],
            'address': p['address'],
            'rating': p['rating'],
            'latitude': p['lat'],
            'longitude': p['lng'],
        }
        for p in places[:limit]
    ]

