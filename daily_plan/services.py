import math
import random
from datetime import date, timedelta

from django.db.models import Q

from events.models import Event
from accounts.models import UserPreferences
from daily_plan.models import DailyPlan
from events.categories import normalize_category


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


def _available_for_date(queryset, reference_date):
    explicit_window = (
        Q(start_date__date__lte=reference_date)
        & (Q(end_date__isnull=True) | Q(end_date__date__gte=reference_date))
    ) | (
        Q(start_date__isnull=True)
        & Q(end_date__date__gte=reference_date)
    )
    legacy_day_event = (
        Q(category="events")
        & Q(start_date__isnull=True)
        & Q(end_date__isnull=True)
        & Q(date__date=reference_date)
    )
    evergreen_places = (
        ~Q(category="events")
        & Q(start_date__isnull=True)
        & Q(end_date__isnull=True)
    )
    return queryset.filter(explicit_window | legacy_day_event | evergreen_places)


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


def _date_relevance_score(event, reference_date):
    if event.start_date and event.end_date and event.occurs_on(reference_date):
        return 2.5
    if event.start_date and not event.end_date and event.occurs_on(reference_date):
        return 2.0
    if event.category == "events" and event.date.date() == reference_date:
        return 1.8
    if event.category == "events":
        return -5.0
    return 0.9


def _category_match_score(event, interests):
    return 2.0 if event.category in interests else 0.4


def _budget_fit_score(event, budget_midpoint):
    if event.price is None:
        return 0.4
    if budget_midpoint is None:
        return 0.8
    price = float(event.price)
    distance = abs(price - budget_midpoint)
    scale = max(budget_midpoint, 1.0)
    return max(0.0, 1.2 - (distance / scale))


def _score_event(event, budget_midpoint, recent_event_ids, interests, reference_date):
    """Readable ranking score for tourism recommendations."""
    score = 0.0

    score += _category_match_score(event, interests)
    score += _date_relevance_score(event, reference_date)
    score += _budget_fit_score(event, budget_midpoint)
    score += float(event.tourism_relevance or 3) * 0.6
    if event.rating is not None:
        score += float(event.rating) * 0.2
    if event.source_url:
        score += 0.15

    if event.id in recent_event_ids:
        score -= 2.0

    return score


def _distance_penalty(event, centroid_lat, centroid_lng):
    """
    Penalise events far from the current cluster centroid.
    Anything within 5 km gets no penalty; beyond that the penalty scales
    linearly at -0.3 per km, capped at -6.0.  This keeps the daily plan
    tightly geographically clustered.
    """
    if centroid_lat is None or centroid_lng is None:
        return 0.0
    if event.latitude is None or event.longitude is None:
        return -0.5  # stronger penalty for places with no coordinates

    km = _haversine_km(centroid_lat, centroid_lng, event.latitude, event.longitude)

    # No penalty within 5 km, then -0.3 per extra km, capped at -6.0
    if km <= 5:
        return 0.0
    return max(-6.0, -0.3 * (km - 5))


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


def generate_recommendations(user, date_str=None, seed=None, exclude_ids=None):
    """
    Generate a list of up to 5 recommended events for a user on a given date.

    The `seed` parameter makes generation non-deterministic between calls so
    different days in a multi-day trip produce different selections.  When
    `seed` is None we fall back to `date_str` so the same day re-generates
    reproducibly.
    """

    preferences = UserPreferences.objects.filter(user=user).first()
    exclude_ids = set(exclude_ids or [])

    if preferences is None:
        return None

    interests = [normalize_category(i) for i in (preferences.interests or [])]
    if not interests:
        return None

    reference_date = _parse_reference_date(date_str)
    active_queryset = _available_for_date(
        Event.objects.filter(is_active=True),
        reference_date,
    )
    base_queryset = active_queryset.filter(category__in=interests)
    queryset = base_queryset
    used_fallback = False

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

    if exclude_ids:
        queryset = queryset.exclude(id__in=exclude_ids)

    candidates = list(queryset)
    has_strict_filters = any(
        value is not None
        for value in (
            preferences.budget_min,
            preferences.budget_max,
            preferences.min_rating,
        )
    )
    if not candidates and base_queryset.exists() and has_strict_filters:
        fallback_queryset = Event.objects.all()
        fallback_queryset = _available_for_date(
            fallback_queryset.filter(is_active=True),
            reference_date,
        )
        if preferences.budget_max is not None:
            fallback_queryset = fallback_queryset.filter(
                Q(price__lte=preferences.budget_max) | Q(price__isnull=True)
            )
        if preferences.budget_min is not None:
            fallback_queryset = fallback_queryset.filter(
                Q(price__gte=preferences.budget_min) | Q(price__isnull=True)
            )
        if preferences.min_rating is not None:
            fallback_queryset = fallback_queryset.filter(
                Q(rating__gte=preferences.min_rating) | Q(rating__isnull=True)
            )
        if exclude_ids:
            fallback_queryset = fallback_queryset.exclude(id__in=exclude_ids)

        candidates = list(fallback_queryset)
        used_fallback = bool(candidates)

    if not candidates:
        return []

    budget_midpoint = _budget_midpoint(preferences)
    recent_event_ids = _recent_event_ids(user, reference_date)

    # Seeded randomness — different seeds produce different selections while
    # the same seed stays reproducible.
    rng_key = seed if seed is not None else f"{user.id}-{date_str or reference_date.isoformat()}"
    rng = random.Random(rng_key)

    # Shuffle candidates up front so stable sorts naturally break ties in a
    # seed-dependent order (instead of always by `e.id`).
    rng.shuffle(candidates)

    # Base scores (budget + recency) + small seeded jitter so the top-N
    # selection varies between days even when scores are very close.
    base_scores = {
        event.id: _score_event(
            event,
            budget_midpoint,
            recent_event_ids,
            interests,
            reference_date,
        )
                  + rng.uniform(-0.25, 0.25)
        for event in candidates
    }

    selected = []
    selected_ids = set()
    selected_category_counts = {}
    limit = 7 if used_fallback else 5
    clat, clng = None, None

    while len(selected) < limit:
        remaining = [event for event in candidates if event.id not in selected_ids]
        if not remaining:
            break

        def combined_score(event):
            category_count = selected_category_counts.get(event.category, 0)
            diversity_bonus = 0.6 if category_count == 0 else 0.0
            diversity_penalty = 0.75 * category_count
            return (
                base_scores[event.id]
                + diversity_bonus
                - diversity_penalty
                + _distance_penalty(event, clat, clng)
            )

        best = max(remaining, key=combined_score)
        selected.append(best)
        selected_ids.add(best.id)
        selected_category_counts[best.category] = (
            selected_category_counts.get(best.category, 0) + 1
        )
        clat, clng = _centroid(selected)

    limit = 7 if used_fallback else 5
    selected = _order_by_route(selected[:limit])

    return selected


def generate_multiday_plan(user, start_date_str, trip_duration=None, end_date_str=None):
    """Generate recommendations for N consecutive days based on trip_duration or end_date."""
    preferences = UserPreferences.objects.filter(user=user).first()
    if preferences is None:
        return None

    interests = [normalize_category(i) for i in (preferences.interests or [])]
    if not interests:
        return None

    start_date = date.fromisoformat(str(start_date_str))
    if end_date_str:
        end_date = date.fromisoformat(str(end_date_str))
        if end_date < start_date:
            raise ValueError("end_date must be on or after start_date.")
        derived_duration = (end_date - start_date).days + 1
        if trip_duration is not None and int(trip_duration) != derived_duration:
            raise ValueError(
                "trip_duration must match the provided start_date and end_date range."
            )
        trip_duration = derived_duration
    else:
        resolved_duration = (
            trip_duration if trip_duration is not None else preferences.trip_duration
        )
        try:
            trip_duration = int(resolved_duration or 1)
        except (TypeError, ValueError) as exc:
            raise ValueError("trip_duration must be an integer between 1 and 30.") from exc
        if trip_duration < 1 or trip_duration > 30:
            raise ValueError("trip_duration must be an integer between 1 and 30.")

    multiday_recommendations = []
    exclude_ids = set()

    for day_index in range(trip_duration):
        plan_date = start_date + timedelta(days=day_index)
        date_str = plan_date.isoformat()
        day_seed = f"{user.id}-{date_str}-{day_index}"

        events = generate_recommendations(
            user,
            date_str=date_str,
            seed=day_seed,
            exclude_ids=exclude_ids,
        )
        if events is None:
            return None

        events = events or []
        multiday_recommendations.append((date_str, events))
        exclude_ids.update(event.id for event in events)

    return multiday_recommendations
