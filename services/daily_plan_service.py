from typing import Dict, List
from .recommendation_service import recommend_events


def generate_daily_plan(user_preferences: Dict, events: List[Dict]) -> Dict:
    recommended_events = recommend_events(user_preferences, events)

    return {
        "morning": recommended_events[:2],
        "afternoon": recommended_events[2:4],
        "evening": recommended_events[4:6],
    }
