import random
from events.models import Event

def recommend_events(user_categories: list, max_events: int = 4) -> list:
    # Fetch matching events directly from DB
    matching_events = Event.objects.filter(category__in=user_categories)
    
    # Fallback if no exact match found
    if not matching_events.exists():
        matching_events = Event.objects.all()
        
    events_list = list(matching_events)
    
    # Limit number of events for a realistic daily plan
    if len(events_list) > max_events:
        return random.sample(events_list, max_events)
        
    return events_list