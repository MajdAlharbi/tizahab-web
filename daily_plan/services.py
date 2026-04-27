import math
import logging
import random
from collections import Counter
from hashlib import sha1
from datetime import date, timedelta

from django.db.models import Q

from events.models import Event
from accounts.models import UserPreferences
from daily_plan.models import DailyPlan, DailyPlanItem
from events.categories import normalize_category

logger = logging.getLogger(__name__)

DATE_RELEVANCE_WEIGHT = 0.25
MIN_RECOMMENDATION_SCORE = 0.0
MIN_DATASET_RATING = 0.0
TITLE_LENGTH_LIMIT = 60
CATEGORY_MATCH_WEIGHT = 3.0
RATING_WEIGHT = 0.5
TOURISM_PRIORITY_WEIGHT = 2.0
DATE_MATCH_WEIGHT = 2.0
REPEAT_CATEGORY_PENALTY = 1.5
SHOPPING_WHITELIST = {
    "riyadh front",
    "via riyadh",
    "souq al zal",
    "kafd",
}
KNOWN_LANDMARK_NAMES = {
    "boulevard city",
    "kingdom centre tower",
    "al faisaliah tower",
    "kafd",
}
GENERIC_NAME_TERMS = {
    "mall",
    "park",
    "restaurant",
    "cafe",
    "café",
    "shopping center",
    "shopping centre",
    "tower",
    "city",
    "place",
}
TOURISM_BOOST_CATEGORIES = {"nature", "entertainment", "heritage", "events"}
NOISY_SUBCATEGORIES = {"themed land", "lobby", "walkway", "plaza"}
MACRO_ATTRACTION_SUBCATEGORIES = {
    "public park",
    "landmark",
    "historic site",
    "world heritage site",
    "unesco world heritage site",
    "museum",
    "historical palace",
    "religious landmark",
    "wildlife reserve",
    "zoo",
    "theme park",
    "amusement park",
    "sports arena",
    "performance arts",
    "cinema",
    "cultural center",
    "art gallery",
    "natural landmark",
    "lookout point",
    "viewpoint",
}
BREAKFAST_KEYWORDS = {"breakfast", "brunch", "cafe", "coffee", "bakery"}
LUNCH_KEYWORDS = {"restaurant", "bistro", "grill", "dining", "kitchen", "eatery"}
EVENING_KEYWORDS = {"cinema", "show", "theatre", "theater", "concert", "performance", "festival"}
MAIN_ATTRACTION_CATEGORIES = {"culture", "heritage", "nature", "entertainment", "events"}
INTEREST_CATEGORY_EXPANSION = {
    "family": {"family", "entertainment", "nature"},
    "events": {"events", "entertainment", "culture"},
}
TRIP_TYPE_CATEGORY_BOOSTS = {
    "family": {"family": 2.5, "nature": 2.0, "entertainment": 2.0},
    "friends": {"entertainment": 2.5, "food": 2.0, "shopping": 1.5},
    "solo": {"culture": 2.5, "nature": 2.0},
    "luxury": {"food": 2.0, "shopping": 2.0},
}


def _parse_reference_date(date_str):
    if not date_str:
        return date.today()
    try:
        return date.fromisoformat(str(date_str))
    except ValueError:
        return date.today()


def _resolve_selected_dates(date_str=None, start_date_str=None, end_date_str=None):
    reference_date = _parse_reference_date(date_str or start_date_str)
    range_start = _parse_reference_date(start_date_str) if start_date_str else reference_date
    range_end = _parse_reference_date(end_date_str) if end_date_str else None
    return reference_date, range_start, range_end


def _has_explicit_selected_date(date_str=None, start_date_str=None, end_date_str=None):
    return any(value not in (None, "") for value in (date_str, start_date_str, end_date_str))


def _budget_midpoint(preferences):
    if preferences.budget_min is not None and preferences.budget_max is not None:
        return (float(preferences.budget_min) + float(preferences.budget_max)) / 2.0
    if preferences.budget_min is not None:
        return float(preferences.budget_min)
    if preferences.budget_max is not None:
        return float(preferences.budget_max)
    return None


def _normalized_title(title):
    return " ".join(str(title or "").strip().lower().split())


def _normalized_subcategory(subcategory):
    return " ".join(str(subcategory or "").strip().lower().split())


def _event_subcategory_text(event):
    raw_subcategory = getattr(event, "subcategory", None)
    if raw_subcategory:
        return _normalized_subcategory(raw_subcategory)
    return _normalized_subcategory(getattr(event, "description", ""))


def _dataset_priority(event):
    tourism_priority = getattr(event, "tourism_priority", None)
    if tourism_priority is not None:
        return tourism_priority
    return getattr(event, "tourism_relevance", None)


def _is_suspicious_name(event):
    title = _normalized_title(event.title)
    if not title:
        return True
    compact = title.replace(" ", "")
    if compact.isdigit():
        return True
    if title in KNOWN_LANDMARK_NAMES:
        return False
    if "tower" in title and title not in KNOWN_LANDMARK_NAMES:
        return True
    if "city" in title and "boulevard city" not in title:
        return True
    if title in GENERIC_NAME_TERMS:
        return True
    return False


def _passes_dataset_quality(event):
    title = _normalized_title(event.title)
    if event.latitude is None or event.longitude is None:
        return False
    if not title:
        return False
    if event.rating is not None and float(event.rating) < MIN_DATASET_RATING:
        return False
    return True


def _filter_dataset_quality(events):
    return [event for event in events if _passes_dataset_quality(event)]


def _passes_food_fallback_quality(event):
    if event.category != "food":
        return False
    title = _normalized_title(event.title)
    subcategory = _event_subcategory_text(event)
    priority = _dataset_priority(event)
    if event.latitude is None or event.longitude is None:
        return False
    if priority is not None and int(priority) < 3:
        return False
    if event.rating is None or float(event.rating) < MIN_DATASET_RATING:
        return False
    if "-" in str(event.title or ""):
        return False
    if len(str(event.title or "").strip()) > TITLE_LENGTH_LIMIT:
        return False
    if subcategory in NOISY_SUBCATEGORIES:
        return False
    if _is_suspicious_name(event):
        return False
    return True


def _filter_food_fallback_quality(events):
    return [event for event in events if _passes_food_fallback_quality(event)]


def _dedupe_by_normalized_title(events):
    best_by_title = {}
    for event in events:
        title = _normalized_title(event.title)
        if not title:
            continue
        current = best_by_title.get(title)
        if current is None:
            best_by_title[title] = event
            continue
        current_key = (
            _dataset_priority(current) or 0,
            float(current.rating or 0),
            float(current.tourism_relevance or 0),
            current.id,
        )
        candidate_key = (
            _dataset_priority(event) or 0,
            float(event.rating or 0),
            float(event.tourism_relevance or 0),
            event.id,
        )
        if candidate_key > current_key:
            best_by_title[title] = event
    return list(best_by_title.values())


def _tourism_category_boost(event):
    return 0.9 if event.category in TOURISM_BOOST_CATEGORIES else 0.0


def _macro_attraction_boost(event):
    subcategory = _event_subcategory_text(event)
    if event.category in {"heritage", "events"}:
        return 0.9
    if subcategory in MACRO_ATTRACTION_SUBCATEGORIES:
        return 0.6
    if event.category in {"nature", "entertainment", "culture"}:
        return 0.25
    return 0.0


def _date_window_q(window_start, window_end=None):
    effective_end = window_end or window_start
    return (
        (
            (Q(start_date__isnull=True) | Q(start_date__date__lte=effective_end))
            & (Q(end_date__isnull=True) | Q(end_date__date__gte=window_start))
        )
        | (
            Q(start_date__isnull=True)
            & Q(end_date__isnull=True)
            & Q(date__date__gte=window_start)
            & Q(date__date__lte=effective_end)
        )
    )


def _available_for_date(queryset, reference_date, end_date=None):
    return queryset.filter(_date_window_q(reference_date, end_date))


def _event_overlaps_selected_window(event, selected_date, end_date=None):
    effective_end = end_date or selected_date
    event_start, event_end = event.availability_window()
    return event_start <= effective_end and event_end >= selected_date


def _stable_date_affinity(event, selected_date, end_date=None):
    """
    Deterministic date-aware tie-breaker so evergreen places do not keep the
    exact same ranking whenever the user changes the selected date.
    """
    effective_end = end_date or selected_date
    window_key = f"{selected_date.isoformat()}:{effective_end.isoformat()}"
    digest = sha1(f"{event.id}:{event.category}:{window_key}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _dated_event_q(window_start, window_end=None):
    effective_end = window_end or window_start
    return (
        (Q(start_date__isnull=False) & Q(start_date__date__lte=effective_end))
        & (Q(end_date__isnull=True) | Q(end_date__date__gte=window_start))
    ) | (
        Q(start_date__isnull=True)
        & Q(end_date__isnull=False)
        & Q(end_date__date__gte=window_start)
    ) | (
        Q(start_date__isnull=True)
        & Q(end_date__isnull=True)
        & Q(date__date__gte=window_start)
        & Q(date__date__lte=effective_end)
    )


def _evergreen_place_q():
    return (
        Q(start_date__isnull=True)
        & Q(end_date__isnull=True)
    )


def is_event_available_for_selection(event, selected_date, end_date=None):
    effective_end = end_date or selected_date

    if not event.is_active:
        return False
    if event.start_date or event.end_date:
        return _event_overlaps_selected_window(event, selected_date, effective_end)
    if event.category == "events":
        return selected_date <= event.date.date() <= effective_end
    return True


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


def _date_match_score(event, reference_date, end_date=None, has_selected_date=False):
    if not has_selected_date:
        return 0.0
    if event.start_date and event.end_date and _event_overlaps_selected_window(
        event, reference_date, end_date
    ):
        return 1.0
    if event.start_date and not event.end_date and _event_overlaps_selected_window(
        event, reference_date, end_date
    ):
        return 0.9
    if (
        event.category == "events"
        and reference_date <= event.date.date() <= (end_date or reference_date)
    ):
        return 0.95
    if event.category == "events":
        return -2.0
    return -1.5 + (_stable_date_affinity(event, reference_date, end_date) * 0.1)


def _category_match_score(event, interests):
    return CATEGORY_MATCH_WEIGHT if event.category in interests else 0.0


def _expand_interest_categories(interests):
    expanded = set()
    for interest in interests:
        normalized_interest = normalize_category(interest)
        if not normalized_interest:
            continue
        expanded.add(normalized_interest)
        expanded.update(
            INTEREST_CATEGORY_EXPANSION.get(normalized_interest, {normalized_interest})
        )
    return expanded


def _budget_fit_score(event, budget_midpoint):
    if event.price is None:
        return 0.4
    if budget_midpoint is None:
        return 0.8
    price = float(event.price)
    distance = abs(price - budget_midpoint)
    scale = max(budget_midpoint, 1.0)
    return max(0.0, 1.2 - (distance / scale))


def _trip_type_score(event, preferences):
    trip_type = str(getattr(preferences, "trip_type", "") or "").strip().lower()
    if not trip_type:
        return 0.0

    category = str(getattr(event, "category", "") or "").lower()
    score = TRIP_TYPE_CATEGORY_BOOSTS.get(trip_type, {}).get(category, 0.0)

    if trip_type == "luxury":
        rating = float(getattr(event, "rating", 0) or 0)
        if rating >= 4.7:
            score += 2.5
        else:
            score -= 1.5

    return score


def _score_event(
    event,
    budget_midpoint,
    recent_event_ids,
    interests,
    preferences,
    reference_date,
    has_selected_date=False,
    end_date=None,
):
    """Readable ranking score for tourism recommendations."""
    if event.latitude is None or event.longitude is None:
        return float("-inf")

    score = 0.0
    date_match = _date_match_score(
        event,
        reference_date,
        end_date=end_date,
        has_selected_date=has_selected_date,
    )

    score += _category_match_score(event, interests)
    if date_match > 0:
        score += DATE_MATCH_WEIGHT
    score += _budget_fit_score(event, budget_midpoint)
    score += _trip_type_score(event, preferences)
    score += _tourism_category_boost(event)
    score += _macro_attraction_boost(event)
    score += float(event.tourism_relevance or 3) * TOURISM_PRIORITY_WEIGHT
    if event.rating is not None:
        score += float(event.rating) * RATING_WEIGHT
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


def _proximity_score(event, previous_event):
    """Reward candidates that are geographically close to the last selected stop."""
    if previous_event is None:
        return 0.0
    if (
        previous_event.latitude is None
        or previous_event.longitude is None
        or event.latitude is None
        or event.longitude is None
    ):
        return 0.0

    km = _haversine_km(
        previous_event.latitude,
        previous_event.longitude,
        event.latitude,
        event.longitude,
    )
    if km <= 3:
        return 2.0
    if km <= 8:
        return 1.0
    return max(-4.0, -0.25 * (km - 8))


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


def pick_first_by_category(available, category):
    for index, event in enumerate(available):
        if event.category == category:
            return available.pop(index)
    return None


def pick_next_available(available):
    if not available:
        return None
    return available.pop(0)


def slot_type_for_ordered_event(index, total):
    if total <= 0:
        return "activity"
    if total == 1:
        return "breakfast"
    if total == 2:
        return "breakfast" if index == 0 else "evening"
    if total == 3:
        if index == 0:
            return "breakfast"
        if index == 1:
            return "activity"
        return "evening"

    last_index = total - 1
    lunch_index = min(3, last_index - 1)
    if index == 0:
        return "breakfast"
    if index == lunch_index:
        return "lunch"
    if index == last_index:
        return "evening"
    return "activity"


def build_plan_items_from_ordered_events(events, source="generated", locked=False):
    ordered_events = list(events or [])
    total = len(ordered_events)
    items = []
    for index, event in enumerate(ordered_events):
        items.append(
            {
                "event": event,
                "event_id": getattr(event, "id", None),
                "slot_type": slot_type_for_ordered_event(index, total),
                "order": index,
                "source": source,
                "locked": locked,
            }
        )
    return items


def _event_text_blob(event):
    return " ".join(
        [
            _normalized_title(getattr(event, "title", "")),
            _event_subcategory_text(event),
            _normalized_title(getattr(event, "description", "")),
        ]
    )


def _slot_fit_score(event, slot_key):
    category = str(getattr(event, "category", "") or "").lower()
    text_blob = _event_text_blob(event)
    score = float(getattr(event, "rating", 0) or 0)
    is_food = category == "food"

    if slot_key in {"breakfast", "lunch"}:
        if not is_food:
            return float("-inf")
        if slot_key == "breakfast":
            if any(keyword in text_blob for keyword in BREAKFAST_KEYWORDS):
                score += 3.0
            elif "restaurant" in text_blob:
                score += 0.8
        if slot_key == "lunch":
            if any(keyword in text_blob for keyword in LUNCH_KEYWORDS):
                score += 3.0
            elif any(keyword in text_blob for keyword in BREAKFAST_KEYWORDS):
                score += 0.2
        return score

    if slot_key == "activity":
        if category not in {"culture", "nature"}:
            return float("-inf")
        score += 1.5
        return score

    if slot_key == "evening":
        if category != "entertainment":
            return float("-inf")
        score += 3.0
        return score

    return score


def _pick_best_for_slot(
    available,
    slot_key,
    *,
    prefer_non_duplicate_subcategory=False,
    used_subcategories=None,
    minimum_rating=None,
    allow_non_food_fallback=False,
):
    if not available:
        return None

    used_subcategories = used_subcategories or set()
    candidates = []
    fallback_candidates = []

    for index, event in enumerate(available):
        rating = float(event.rating or 0)
        if minimum_rating is not None and rating < minimum_rating:
            continue

        fit_score = _slot_fit_score(event, slot_key)
        if fit_score == float("-inf"):
            if allow_non_food_fallback and slot_key in {"breakfast", "lunch"}:
                fallback_candidates.append((fit_score, rating, index, event))
            continue

        subcategory = _event_subcategory_text(event)
        bucket = fallback_candidates if (
            prefer_non_duplicate_subcategory and subcategory and subcategory in used_subcategories
        ) else candidates
        bucket.append((fit_score, rating, index, event))

    ranked = candidates or fallback_candidates
    if not ranked:
        return None

    _, _, chosen_index, chosen_event = max(ranked, key=lambda item: (item[0], item[1], -item[2]))
    available.pop(chosen_index)
    return chosen_event


def _pick_fallback_food(food_candidates, used_ids):
    for event in food_candidates:
        if event.id in used_ids:
            continue
        if float(event.rating or 0) >= 3.5:
            return event
    return None


def _derive_discouraged_categories(previous_day_events):
    if not previous_day_events:
        return set()
    counts = Counter(str(event.category or "").lower() for event in previous_day_events if getattr(event, "category", None))
    if not counts:
        return set()
    max_count = max(counts.values())
    if max_count < 2:
        return set()
    return {
        category for category, count in counts.items()
        if count == max_count
    }


def _build_structured_daily_slots(events, food_fallback_candidates=None):
    """
    Build a stable slot-based itinerary while returning the same flat list
    shape expected by the existing API/frontend.
    """
    available = list(events)
    plan = {
        "breakfast": None,
        "activity": None,
        "lunch": None,
        "evening": None,
    }
    used_ids = set()
    used_subcategories = set()

    def register(event):
        if event is None:
            return
        used_ids.add(event.id)
        subcategory = _normalized_subcategory(getattr(event, "subcategory", ""))
        if subcategory:
            used_subcategories.add(subcategory)

    plan["breakfast"] = _pick_best_for_slot(
        available,
        "breakfast",
        prefer_non_duplicate_subcategory=True,
        used_subcategories=used_subcategories,
    )
    if plan["breakfast"] is None:
        plan["breakfast"] = _pick_fallback_food(food_fallback_candidates or [], used_ids)
        if plan["breakfast"] is not None:
            logger.warning("food slot fallback used")
        else:
            plan["breakfast"] = pick_next_available(available)
        if plan["breakfast"] is not None:
            logger.warning("food slot fallback used")
    register(plan["breakfast"])

    plan["activity"] = _pick_best_for_slot(
        available,
        "activity",
        prefer_non_duplicate_subcategory=True,
        used_subcategories=used_subcategories,
    )
    if plan["activity"] is None:
        plan["activity"] = pick_next_available(available)
        if plan["activity"] is not None:
            logger.info(
                "Daily plan activity fallback used because no non-food item was available."
            )
    register(plan["activity"])

    plan["lunch"] = _pick_best_for_slot(
        available,
        "lunch",
        prefer_non_duplicate_subcategory=True,
        used_subcategories=used_subcategories,
    )
    if plan["lunch"] is None:
        plan["lunch"] = _pick_fallback_food(food_fallback_candidates or [], used_ids)
        if plan["lunch"] is not None:
            logger.warning("food slot fallback used")
        else:
            plan["lunch"] = pick_next_available(available)
        if plan["lunch"] is not None:
            logger.warning("food slot fallback used")
    register(plan["lunch"])

    plan["evening"] = _pick_best_for_slot(
        available,
        "evening",
        prefer_non_duplicate_subcategory=True,
        used_subcategories=used_subcategories,
    )
    if plan["evening"] is None:
        plan["evening"] = pick_next_available(available)
        if plan["evening"] is not None:
            logger.info(
                "Daily plan evening fallback used because no non-food item was available."
            )

    final_list = [
        plan["breakfast"],
        plan["activity"],
        plan["lunch"],
        plan["evening"],
    ]
    final_list = [event for event in final_list if event is not None]
    final_list.extend(available)
    return final_list


def _apply_quality_filters_with_logging(events, label):
    quality_filtered_events = _filter_dataset_quality(events)
    deduped_events = _dedupe_by_normalized_title(quality_filtered_events)
    removed_count = len(events) - len(deduped_events)
    if removed_count:
        logger.info("Filtered %s low-quality tourism entries from %s", removed_count, label)
    return deduped_events


def _apply_relaxed_quality_filters_with_logging(events, label):
    relaxed_events = []
    for event in events:
        if not event.is_active:
            continue
        priority = _dataset_priority(event)
        if priority is not None and int(priority) < 2:
            continue
        if event.rating is not None and float(event.rating) < 4.0:
            continue
        relaxed_events.append(event)

    deduped_events = _dedupe_by_normalized_title(relaxed_events)
    removed_count = len(events) - len(deduped_events)
    if removed_count:
        logger.info("Relaxed filters kept %s of %s entries for %s", len(deduped_events), len(events), label)
    return deduped_events


def _ensure_non_food_activity(selected, fallback_candidates, base_scores):
    if not selected:
        return selected
    if any(event.category != "food" for event in selected):
        return selected

    replacement_pool = [
        event
        for event in fallback_candidates
        if event.category != "food" and event.id not in {selected_event.id for selected_event in selected}
    ]
    if not replacement_pool:
        return selected

    best_non_food = max(
        replacement_pool,
        key=lambda event: base_scores.get(event.id, float("-inf")),
    )
    food_indices = [
        index for index, event in enumerate(selected) if event.category == "food"
    ]
    if not food_indices:
        return selected

    weakest_food_index = min(
        food_indices,
        key=lambda index: base_scores.get(selected[index].id, float("-inf")),
    )
    updated = list(selected)
    updated[weakest_food_index] = best_non_food
    return updated


def _ensure_main_attraction(selected, fallback_candidates, base_scores):
    if not selected:
        return selected
    if any(str(event.category or "").lower() in MAIN_ATTRACTION_CATEGORIES for event in selected):
        return selected

    replacement_pool = [
        event
        for event in fallback_candidates
        if str(event.category or "").lower() in MAIN_ATTRACTION_CATEGORIES
        and event.id not in {selected_event.id for selected_event in selected}
    ]
    if not replacement_pool:
        return selected

    best_attraction = max(
        replacement_pool,
        key=lambda event: base_scores.get(event.id, float("-inf")),
    )
    weakest_index = min(
        range(len(selected)),
        key=lambda index: base_scores.get(selected[index].id, float("-inf")),
    )
    updated = list(selected)
    updated[weakest_index] = best_attraction
    return updated


def _enforce_subcategory_diversity(selected, fallback_candidates, base_scores):
    if not selected:
        return selected

    used_titles = {_normalized_title(event.title) for event in selected}
    used_subcategories = set()
    updated = []

    replacement_pool = [
        event
        for event in fallback_candidates
        if _normalized_title(event.title) not in used_titles
    ]

    for event in selected:
        subcategory = _normalized_subcategory(getattr(event, "subcategory", ""))
        if not subcategory or subcategory not in used_subcategories:
            updated.append(event)
            if subcategory:
                used_subcategories.add(subcategory)
            continue

        replacement = next(
            (
                candidate
                for candidate in sorted(
                    replacement_pool,
                    key=lambda item: base_scores.get(item.id, float("-inf")),
                    reverse=True,
                )
                if _event_subcategory_text(candidate) not in used_subcategories
            ),
            None,
        )
        if replacement is None:
            continue

        replacement_pool = [
            candidate for candidate in replacement_pool if candidate.id != replacement.id
        ]
        used_titles.add(_normalized_title(replacement.title))
        replacement_subcategory = _event_subcategory_text(replacement)
        if replacement_subcategory:
            used_subcategories.add(replacement_subcategory)
        updated.append(replacement)

    return updated


def generate_recommendations(
    user,
    date_str=None,
    start_date_str=None,
    end_date_str=None,
    seed=None,
    exclude_ids=None,
    discouraged_categories=None,
):
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
        expanded_interests = set()
    else:
        expanded_interests = _expand_interest_categories(interests)

    has_selected_date = _has_explicit_selected_date(
        date_str=date_str,
        start_date_str=start_date_str,
        end_date_str=end_date_str,
    )
    reference_date, selected_start_date, selected_end_date = _resolve_selected_dates(
        date_str=date_str,
        start_date_str=start_date_str,
        end_date_str=end_date_str,
    )
    active_queryset = _available_for_date(
        Event.objects.filter(is_active=True),
        selected_start_date,
        end_date=selected_end_date,
    )
    print(f"DEBUG active_queryset count: {active_queryset.count()}")
    filtered_queryset = active_queryset
    print(f"DEBUG filtered_queryset count: {filtered_queryset.count()}")
    if expanded_interests:
        base_queryset = filtered_queryset.filter(category__in=expanded_interests)
    else:
        base_queryset = filtered_queryset
    print(f"DEBUG base_queryset count: {base_queryset.count()}")
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
    print(f"DEBUG queryset count after budget/rating/exclude: {queryset.count()}")

    support_queryset = filtered_queryset
    if preferences.budget_max is not None:
        support_queryset = support_queryset.filter(
            Q(price__lte=preferences.budget_max) | Q(price__isnull=True)
        )
    if preferences.budget_min is not None:
        support_queryset = support_queryset.filter(
            Q(price__gte=preferences.budget_min) | Q(price__isnull=True)
        )
    if preferences.min_rating is not None:
        support_queryset = support_queryset.filter(
            Q(rating__gte=preferences.min_rating) | Q(rating__isnull=True)
        )
    if exclude_ids:
        support_queryset = support_queryset.exclude(id__in=exclude_ids)
    print(f"DEBUG support_queryset count: {support_queryset.count()}")

    if has_selected_date:
        dated_queryset = queryset.filter(
            _dated_event_q(selected_start_date, selected_end_date)
        )
        evergreen_queryset = queryset.filter(_evergreen_place_q())

        candidates = _apply_quality_filters_with_logging(
            list(dated_queryset),
            "dated_queryset",
        )
        if candidates:
            logger.info(
                "Using date-specific candidates for user=%s start=%s end=%s count=%s",
                user.id,
                selected_start_date,
                selected_end_date or selected_start_date,
                len(candidates),
            )
        else:
            candidates = _apply_quality_filters_with_logging(
                list(evergreen_queryset),
                "evergreen_queryset",
            )
            logger.info(
                "Falling back to evergreen candidates for user=%s start=%s end=%s count=%s",
                user.id,
                selected_start_date,
                selected_end_date or selected_start_date,
                len(candidates),
            )
    else:
        candidates = _apply_quality_filters_with_logging(
            list(queryset),
            "default_queryset",
        )
    print(f"DEBUG candidates count after initial selection: {len(candidates)}")

    if has_selected_date:
        dated_support_queryset = support_queryset.filter(
            _dated_event_q(selected_start_date, selected_end_date)
        )
        evergreen_support_queryset = support_queryset.filter(_evergreen_place_q())
        support_candidates = _apply_quality_filters_with_logging(
            list(dated_support_queryset),
            "dated_support_queryset",
        )
        if not support_candidates:
            support_candidates = _apply_quality_filters_with_logging(
                list(evergreen_support_queryset),
                "evergreen_support_queryset",
            )
    else:
        support_candidates = _apply_quality_filters_with_logging(
            list(support_queryset),
            "support_queryset",
        )
    print(f"DEBUG support_candidates count: {len(support_candidates)}")

    if not candidates:
        fallback_results = active_queryset
        if exclude_ids:
            fallback_results = fallback_results.exclude(id__in=exclude_ids)
        print(f"DEBUG fallback count after initial empty candidates: {fallback_results.count()}")
        return list(fallback_results.order_by("-rating")[:20])

    food_fallback_queryset = active_queryset.filter(category="food")
    if preferences.budget_max is not None:
        food_fallback_queryset = food_fallback_queryset.filter(
            Q(price__lte=preferences.budget_max) | Q(price__isnull=True)
        )
    if preferences.budget_min is not None:
        food_fallback_queryset = food_fallback_queryset.filter(
            Q(price__gte=preferences.budget_min) | Q(price__isnull=True)
        )
    minimum_food_rating = max(
        3.5,
        float(preferences.min_rating or 0),
    )
    food_fallback_queryset = food_fallback_queryset.filter(
        Q(rating__gte=minimum_food_rating)
    )
    if exclude_ids:
        food_fallback_queryset = food_fallback_queryset.exclude(id__in=exclude_ids)
    food_fallback_support = _dedupe_by_normalized_title(
        _filter_food_fallback_quality(list(food_fallback_queryset))
    )

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
            selected_start_date,
            end_date=selected_end_date,
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

        if has_selected_date:
            dated_fallback_queryset = fallback_queryset.filter(
                _dated_event_q(selected_start_date, selected_end_date)
            )
            evergreen_fallback_queryset = fallback_queryset.filter(_evergreen_place_q())
            candidates = _apply_quality_filters_with_logging(
                list(dated_fallback_queryset),
                "dated_fallback_queryset",
            )
            if not candidates:
                candidates = _apply_quality_filters_with_logging(
                    list(evergreen_fallback_queryset),
                    "evergreen_fallback_queryset",
                )
        else:
            candidates = _apply_quality_filters_with_logging(
                list(fallback_queryset),
                "fallback_queryset",
            )
        used_fallback = bool(candidates)
        print(f"DEBUG candidates count after strict fallback branch: {len(candidates)}")

    if not candidates:
        fallback_results = active_queryset
        if exclude_ids:
            fallback_results = fallback_results.exclude(id__in=exclude_ids)
        print(f"DEBUG fallback count before score stage: {fallback_results.count()}")
        return list(fallback_results.order_by("-rating")[:20])

    budget_midpoint = _budget_midpoint(preferences)
    recent_event_ids = _recent_event_ids(user, reference_date)
    discouraged_categories = {
        str(category or "").lower()
        for category in (discouraged_categories or set())
        if str(category or "").strip()
    }

    # Seeded randomness — different seeds produce different selections while
    # the same seed stays reproducible.
    rng_key = seed if seed is not None else f"{user.id}-{date_str or reference_date.isoformat()}"
    rng = random.Random(rng_key)

    # Shuffle candidates up front so stable sorts naturally break ties in a
    # seed-dependent order (instead of always by `e.id`).
    rng.shuffle(candidates)

    # Base scores remain deterministic. Seeded shuffling above only affects
    # candidate tie order, not the score itself.
    base_scores = {
        event.id: _score_event(
            event,
            budget_midpoint,
            recent_event_ids,
            interests,
            preferences,
            reference_date,
            has_selected_date=has_selected_date,
            end_date=selected_end_date,
        )
        for event in candidates
    }
    candidates = [
        event
        for event in candidates
        if base_scores.get(event.id, float("-inf")) >= MIN_RECOMMENDATION_SCORE
    ]
    print(f"DEBUG candidates count after scoring threshold: {len(candidates)}")
    if not candidates:
        fallback_results = active_queryset
        if exclude_ids:
            fallback_results = fallback_results.exclude(id__in=exclude_ids)
        print(f"DEBUG fallback count after scoring empty candidates: {fallback_results.count()}")
        return list(fallback_results.order_by("-rating")[:20])
    if has_selected_date:
        date_scores = {
            event.id: _date_match_score(
                event,
                reference_date,
                end_date=selected_end_date,
                has_selected_date=True,
            )
            for event in candidates
        }
        unique_date_scores = {round(value, 4) for value in date_scores.values()}
        if len(unique_date_scores) <= 1:
            logger.warning(
                "Selected date window produced no ranking variance for user=%s start=%s end=%s",
                user.id,
                selected_start_date,
                selected_end_date or selected_start_date,
            )
        else:
            logger.info(
                "Applying date-aware ranking for user=%s start=%s end=%s candidates=%s",
                user.id,
                selected_start_date,
                selected_end_date or selected_start_date,
                len(candidates),
            )

    selected = []
    selected_ids = set()
    selected_category_counts = {}
    limit = 7 if used_fallback else 5
    clat, clng = None, None

    while len(selected) < limit:
        remaining = [event for event in candidates if event.id not in selected_ids]
        if not remaining:
            break

        previous_event = selected[-1] if selected else None

        def combined_score(event):
            category_count = selected_category_counts.get(event.category, 0)
            diversity_bonus = 0.6 if category_count == 0 else 0.0
            diversity_penalty = 0.75 * category_count
            repeat_penalty = (
                REPEAT_CATEGORY_PENALTY
                if str(event.category or "").lower() in discouraged_categories
                else 0.0
            )
            extra_food_penalty = (
                2.5
                if str(event.category or "").lower() == "food" and category_count >= 2
                else 0.0
            )
            return (
                base_scores[event.id]
                + diversity_bonus
                - diversity_penalty
                - repeat_penalty
                - extra_food_penalty
                + _proximity_score(event, previous_event)
                + _distance_penalty(event, clat, clng)
            )

        best = max(remaining, key=combined_score)
        selected.append(best)
        selected_ids.add(best.id)
        selected_category_counts[best.category] = (
            selected_category_counts.get(best.category, 0) + 1
        )
        clat, clng = _centroid(selected)

    selected = _ensure_non_food_activity(selected, support_candidates, base_scores)
    selected = _ensure_main_attraction(selected, support_candidates, base_scores)
    selected = _enforce_subcategory_diversity(selected, support_candidates, base_scores)
    limit = 7 if used_fallback else 5
    selected = _order_by_route(selected[:limit])
    food_fallback_candidates = sorted(
        [
            event
            for event in (food_fallback_support or support_candidates)
            if event.category == "food" and event.id not in {chosen.id for chosen in selected}
        ],
        key=lambda event: (
            _slot_fit_score(event, "breakfast"),
            float(event.rating or 0),
            base_scores.get(event.id, float("-inf")),
        ),
        reverse=True,
    )
    if has_selected_date or len(selected) >= 4:
        selected = _build_structured_daily_slots(
            selected,
            food_fallback_candidates=food_fallback_candidates,
        )
    else:
        selected = sorted(
            selected,
            key=lambda event: (
                base_scores.get(event.id, float("-inf")),
                _tourism_category_boost(event),
                _macro_attraction_boost(event),
                float(event.rating or 0),
            ),
            reverse=True,
        )

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
    previous_day_events = []

    for day_index in range(trip_duration):
        plan_date = start_date + timedelta(days=day_index)
        date_str = plan_date.isoformat()
        day_seed = f"{user.id}-{date_str}-{day_index}"

        events = generate_recommendations(
            user,
            date_str=date_str,
            start_date_str=start_date_str,
            end_date_str=end_date_str,
            seed=day_seed,
            exclude_ids=exclude_ids,
            discouraged_categories=_derive_discouraged_categories(previous_day_events),
        )
        if events is None:
            return None

        events = events or []
        multiday_recommendations.append((date_str, events))
        exclude_ids.update(event.id for event in events)
        previous_day_events = list(events)

    return multiday_recommendations
