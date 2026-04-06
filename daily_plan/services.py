import math
from datetime import date, timedelta

from django.db.models import Q
from events.models import Event
from accounts.models import UserPreferences
from daily_plan.models import DailyPlan


def _parse_reference_date(date_str):
    if not date_str:
        return date.today()
    try:
        return date.fromisoformat(str(date_str))
    except ValueError:
        return date.today()


def _budget_midpoint(preferences):
    if preferences.budget_min is not None and preferences.budget_max is not None:
        return (float(preferences.budget_min) + float(preferences.budget_max)) / 2.0
    if preferences.budget_min is not None:
        return float(preferences.budget_min)
    if preferences.budget_max is not None:
        return float(preferences.budget_max)
    return None


def _recent_event_ids(user, reference_date):
    start = reference_date - timedelta(days=7)
    recent_plans = DailyPlan.objects.filter(
        user=user,
        date__gte=start,
        date__lt=reference_date,
    ).prefetch_related("events")

    ids = set()
    for plan in recent_plans:
        ids.update(plan.events.values_list("id", flat=True))
    return ids


def _haversine_km(lat1, lng1, lat2, lng2):
    """Distance in km between two lat/lng points using the Haversine formula."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _centroid(events):
    """Return (lat, lng) centroid of events that have coordinates."""
    lats, lngs = [], []
    for e in events:
        if e.latitude is not None and e.longitude is not None:
            lats.append(e.latitude)
            lngs.append(e.longitude)
    if not lats:
        return None, None
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


def _score_event(event, budget_midpoint, recent_event_ids):
    """Base score: budget fit + recency penalty (no distance yet)."""
    score = 0.0

    # Budget fit score: values closer to midpoint rank higher.
    if event.price is None:
        score += 0.5
    elif budget_midpoint is not None:
        price = float(event.price)
        distance = abs(price - budget_midpoint)
        scale = max(budget_midpoint, 1.0)
        score += max(0.0, 1.0 - (distance / scale))

    # Recency penalty: avoid repeating events from last 7 days.
    if event.id in recent_event_ids:
        score -= 2.0

    return score


def _distance_penalty(event, centroid_lat, centroid_lng):
    """
    Penalise events far from the current cluster centroid.
    Riyadh is ~60 km across; anything within 10 km gets no penalty,
    beyond that the penalty scales linearly.
    """
    if centroid_lat is None or centroid_lng is None:
        return 0.0
    if event.latitude is None or event.longitude is None:
        return -0.3  # slight penalty for places with no coordinates

    km = _haversine_km(centroid_lat, centroid_lng, event.latitude, event.longitude)

    # No penalty within 10 km, then -0.1 per extra km, capped at -3.0
    if km <= 10:
        return 0.0
    return max(-3.0, -0.1 * (km - 10))


def _order_by_route(selected):
    """
    Reorder selected events into a shortest-distance route using
    a nearest-neighbour heuristic so the plan reads as a logical path.
    """
    if len(selected) <= 1:
        return selected

    # Separate events with and without coordinates
    with_coords = [e for e in selected if e.latitude is not None and e.longitude is not None]
    without_coords = [e for e in selected if e.latitude is None or e.longitude is None]

    if not with_coords:
        return selected

    # Nearest-neighbour starting from the first event
    ordered = [with_coords.pop(0)]
    while with_coords:
        last = ordered[-1]
        nearest = min(
            with_coords,
            key=lambda e: _haversine_km(last.latitude, last.longitude, e.latitude, e.longitude),
        )
        with_coords.remove(nearest)
        ordered.append(nearest)

    return ordered + without_coords


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

    if preferences.min_rating is not None:
        queryset = queryset.filter(
            Q(rating__gte=preferences.min_rating) | Q(rating__isnull=True)
        )

    candidates = list(queryset)
    if not candidates:
        return []

    reference_date = _parse_reference_date(date_str)
    budget_midpoint = _budget_midpoint(preferences)
    recent_event_ids = _recent_event_ids(user, reference_date)

    # Base scores (budget + recency)
    base_scores = {
        event.id: _score_event(event, budget_midpoint, recent_event_ids)
        for event in candidates
    }

    selected = []
    selected_ids = set()

    # Phase 1: pick the top-scored event from each interest category (diversity)
    ranked_by_base = sorted(candidates, key=lambda e: (base_scores[e.id], e.id), reverse=True)
    for category in interests:
        best = next(
            (e for e in ranked_by_base if e.category == category and e.id not in selected_ids),
            None,
        )
        if best:
            selected.append(best)
            selected_ids.add(best.id)
            if len(selected) >= 5:
                break

    # Phase 2: fill remaining slots considering distance to the current cluster
    if len(selected) < 5:
        remaining = [e for e in candidates if e.id not in selected_ids]
        clat, clng = _centroid(selected)

        # Score remaining candidates with distance penalty
        combined_scores = {}
        for event in remaining:
            combined_scores[event.id] = (
                base_scores[event.id] + _distance_penalty(event, clat, clng)
            )

        remaining.sort(key=lambda e: (combined_scores[e.id], e.id), reverse=True)

        for event in remaining:
            selected.append(event)
            selected_ids.add(event.id)
            if len(selected) >= 5:
                break
            # Recalculate centroid as we add more places
            clat, clng = _centroid(selected)

    # Phase 3: reorder into a logical route (nearest-neighbour)
    selected = _order_by_route(selected[:5])

    return selected
