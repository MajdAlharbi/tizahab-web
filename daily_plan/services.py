from datetime import datetime
from django.utils import timezone
from events.models import Event
from accounts.models import UserPreferences


def generate_recommendations(user, date_str):
    """
    Generate event recommendations for a user on a specific date.
    
    Args:
        user: Authenticated user object
        date_str: ISO format date string (YYYY-MM-DD)
        
    Returns:
        list: Up to 5 recommended Event objects
        None: If user has no preferences or no matching events
        
    Raises:
        ValueError: If date_str is invalid format
    """
    try:
        preferences = user.preferences
    except UserPreferences.DoesNotExist:
        return None

    interests = preferences.interests or []
    if not interests:
        return None

    try:
        target_date = datetime.fromisoformat(date_str).date()
    except (ValueError, AttributeError) as e:
        raise ValueError(f"Invalid date format. Expected YYYY-MM-DD: {e}")

    # Build query: Filter by interests and budget
    events = Event.objects.filter(category__in=interests)
    
    # Apply budget filtering if user has budget constraints
    if preferences.budget_max:
        events = events.filter(price__lte=preferences.budget_max)
    if preferences.budget_min:
        events = events.filter(price__gte=preferences.budget_min)
    
    # Filter by date if start_date is populated
    events = events.filter(
        start_date__date__lte=target_date,
        end_date__date__gte=target_date
    ) | events.filter(
        start_date__isnull=True,
        end_date__isnull=True,
        date__date=target_date
    )
    
    # Limit to 5 recommendations and return WITHOUT modifying
    recommended_events = list(events[:5])
    
    return recommended_events if recommended_events else None