from django.db.models import Q
from events.models import Event
from accounts.models import UserPreferences


def generate_recommendations(user, date_str=None):
    """
    Generate event recommendations for a user.

    Filters by the user's interests and budget. Date is accepted for
    API compatibility but not used to filter — the dataset contains
    permanent places (restaurants, parks, museums) that are always available.

    Args:
        user: Authenticated user object
        date_str: Unused; kept for API compatibility

    Returns:
        list: Up to 5 recommended Event objects (empty list if no match)
        None: If user has no preferences configured
    """
    try:
        preferences = user.preferences
    except UserPreferences.DoesNotExist:
        return None

    interests = preferences.interests or []
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
        remaining = queryset.exclude(
            id__in=[e.id for e in recommended]
        ).order_by("?")[: 5 - len(recommended)]
        recommended += list(remaining)
    return recommended[:5]
