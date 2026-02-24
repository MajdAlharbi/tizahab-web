from typing import List, Dict


def recommend_events(user_preferences: Dict, events: List[Dict]) -> List[Dict]:
    preferred_categories = user_preferences.get("categories", [])
    recommended = []

    for event in events:
        if event.get("category") in preferred_categories:
            recommended.append(event)

    return recommended
