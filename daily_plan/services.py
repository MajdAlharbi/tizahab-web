from datetime import datetime
from django.utils import timezone
from events.models import Event
from accounts.models import UserPreferences


def generate_recommendations(user, date_str):

    try:
        preferences = user.preferences
    except UserPreferences.DoesNotExist:
        return None

    interests = preferences.interests or []
    if not interests:
        return None

    target_date = timezone.make_aware(datetime.fromisoformat(date_str))

    # get events matching interests
    events = Event.objects.filter(category__in=interests)

    recommended_events = []

    for event in events[:10]:

        # update event date for the generated plan
        event.date = target_date
        event.save()

        recommended_events.append(event)

    return recommended_events[:5]