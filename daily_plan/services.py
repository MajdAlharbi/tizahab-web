from django.db.models import Q
from events.models import Event
from accounts.models import UserPreferences


def generate_recommendations(user, date_str=None):

    preferences = UserPreferences.objects.filter(user=user).first()

    if preferences is None:
        return None

    interests = [i.lower() for i in (preferences.interests or [])]
    if not interests:
        return None

    queryset = Event.objects.filter(category__in=interests)

    if preferences.budget_max is not None:
        queryset = queryset.filter(
            Q(price__lte=preferences.budget_max) | Q(price__isnull=True)
        )
    if preferences.budget_min is not None:
        queryset = queryset.filter(
            Q(price__gte=preferences.budget_min) | Q(price__isnull=True)
        )

    recommended = []
    for category in interests:
        event = queryset.filter(category=category).order_by("?").first()
        if event:
            recommended.append(event)

    if len(recommended) < 5:
        remaining = queryset.exclude(id__in=[e.id for e in recommended]).order_by("?")[: 5 - len(recommended)]
        recommended += list(remaining)

    return recommended[:5]