from datetime import date, timedelta
import subprocess
import textwrap
from unittest.mock import patch

from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from events.models import Event
from daily_plan.models import DailyPlan
from daily_plan.services import generate_multiday_plan, generate_recommendations
from accounts.models import UserPreferences


def make_user(email="dp@test.com", password="StrongPass1!"):
    return User.objects.create_user(username=email, email=email, password=password)


def make_event(title="Place", category="food", price=50.0, **kwargs):
    defaults = {
        "title": title,
        "category": category,
        "description": "desc",
        "date": timezone.now(),
        "location": "Riyadh",
        "price": price,
        "price_range": "",
    }
    defaults.update(kwargs)
    return Event.objects.create(**defaults)


def auth_client(user, password="StrongPass1!"):
    client = APIClient()
    r = client.post("/api/auth/login/", {"email": user.email, "password": password})
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    return client


TOMORROW = (date.today() + timedelta(days=1)).isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()


# ---------------------------------------------------------------------------
# Recommendation service
# ---------------------------------------------------------------------------


class RecommendationServiceTests(TestCase):
    def setUp(self):
        self.user = make_user("rec@test.com")
        for i in range(7):
            make_event(f"Food Place {i}", category="food", price=30 + i * 10)
        make_event("Culture Spot", category="culture", price=20)

    def test_returns_none_without_preferences(self):
        result = generate_recommendations(self.user)
        self.assertIsNone(result)

    def test_returns_none_with_empty_interests(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = []
        pref.save()
        result = generate_recommendations(self.user)
        self.assertIsNone(result)

    def test_returns_list_with_valid_preferences(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.save()
        result = generate_recommendations(self.user)
        self.assertIsInstance(result, list)
        self.assertGreater(len(result), 0)

    def test_caps_at_five_results(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.save()
        result = generate_recommendations(self.user)
        self.assertLessEqual(len(result), 5)

    def test_filters_by_interest_category(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["culture"]
        pref.save()
        result = generate_recommendations(self.user)
        self.assertIsInstance(result, list)
        for event in result:
            self.assertEqual(event.category, "culture")

    def test_budget_max_excludes_expensive_events(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.budget_max = 35
        pref.save()
        result = generate_recommendations(self.user)
        self.assertIsInstance(result, list)
        for event in result:
            if event.price is not None:
                self.assertLessEqual(event.price, 35)

    def test_null_price_events_included_when_budget_set(self):
        make_event("Free Food", category="food", price=None)
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.budget_max = 10
        pref.save()
        result = generate_recommendations(self.user)
        self.assertIsInstance(result, list)
        titles = [e.title for e in result]
        self.assertIn("Free Food", titles)

    def test_no_matching_events_returns_empty_list_not_none(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["shopping"]  # no shopping events exist
        pref.save()
        result = generate_recommendations(self.user)
        self.assertIsInstance(result, list)
        self.assertEqual(result, [])

    def test_date_str_arg_is_accepted(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.save()
        result = generate_recommendations(self.user, date_str="2026-01-01")
        self.assertIsInstance(result, list)

    def test_date_relevance_filters_events_by_selected_date(self):
        Event.objects.all().delete()
        tomorrow = date.today() + timedelta(days=1)

        matching = make_event(
            "Tomorrow Festival",
            category="events",
            start_date=timezone.now() + timedelta(days=1),
            end_date=timezone.now() + timedelta(days=1),
        )
        future_event = make_event(
            "Next Week Festival",
            category="events",
            start_date=timezone.now() + timedelta(days=7),
            end_date=timezone.now() + timedelta(days=7),
        )
        make_event("Evergreen Food", category="food", price=40)

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["events", "food"]
        pref.save()

        result = generate_recommendations(self.user, date_str=tomorrow.isoformat())
        result_ids = {event.id for event in result}
        self.assertIn(matching.id, result_ids)
        self.assertNotIn(future_event.id, result_ids)

    def test_date_range_includes_events_that_overlap_any_day_in_range(self):
        Event.objects.all().delete()
        start_day = date.today() + timedelta(days=3)
        end_day = start_day + timedelta(days=2)

        overlapping = make_event(
            "Range Festival",
            category="events",
            start_date=timezone.now() + timedelta(days=4),
            end_date=timezone.now() + timedelta(days=6),
        )
        outside = make_event(
            "Later Festival",
            category="events",
            start_date=timezone.now() + timedelta(days=10),
            end_date=timezone.now() + timedelta(days=11),
        )
        make_event("Evergreen Food", category="food", price=30)

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["events", "food"]
        pref.save()

        result = generate_recommendations(
            self.user,
            date_str=start_day.isoformat(),
            start_date_str=start_day.isoformat(),
            end_date_str=end_day.isoformat(),
        )
        result_ids = {event.id for event in result}
        self.assertIn(overlapping.id, result_ids)
        self.assertNotIn(outside.id, result_ids)

    def test_inactive_events_are_excluded(self):
        Event.objects.all().delete()
        make_event("Closed Event", category="events", is_active=False)
        make_event("Open Food", category="food")

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["events", "food"]
        pref.save()

        result = generate_recommendations(self.user, date_str=TOMORROW)
        titles = [event.title for event in result]
        self.assertIn("Open Food", titles)
        self.assertNotIn("Closed Event", titles)

    def test_recommendations_are_ordered_for_food_and_activity_slots(self):
        Event.objects.all().delete()
        breakfast = make_event("Breakfast Cafe", category="food", rating=4.8)
        lunch = make_event("Lunch Bistro", category="food", rating=4.7)
        activity = make_event("Museum Visit", category="culture", rating=4.9)
        evening = make_event("Evening Walk", category="nature", rating=4.6)

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food", "culture", "nature"]
        pref.save()

        result = generate_recommendations(self.user, date_str=TOMORROW)

        self.assertGreaterEqual(len(result), 4)
        self.assertEqual(result[0].category, "food")
        self.assertNotEqual(result[1].category, "food")
        self.assertEqual(result[2].category, "food")
        self.assertNotEqual(result[3].category, "food")
        self.assertCountEqual([event.id for event in result[:4]], [breakfast.id, lunch.id, activity.id, evening.id])
        self.assertEqual(len({event.id for event in result[:4]}), 4)

    def test_food_slots_fall_back_and_log_when_no_food_exists(self):
        Event.objects.all().delete()
        make_event("Museum Visit", category="culture", rating=4.9)
        make_event("Park Walk", category="nature", rating=4.7)
        make_event("Show Night", category="events", rating=4.8)

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["culture", "nature", "events"]
        pref.save()

        with self.assertLogs("daily_plan.services", level="INFO") as captured:
            result = generate_recommendations(self.user, date_str=TOMORROW)

        self.assertTrue(result)
        self.assertNotEqual(result[1].category, "food")
        self.assertTrue(
            any("breakfast fallback used because no food item was available" in line for line in captured.output)
        )

    def test_structured_slots_do_not_duplicate_items(self):
        Event.objects.all().delete()
        for title, category in [
            ("Breakfast Cafe", "food"),
            ("Lunch Spot", "food"),
            ("Museum", "culture"),
            ("Evening Park", "nature"),
            ("Extra Activity", "events"),
        ]:
            make_event(title, category=category, rating=4.8)

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food", "culture", "nature", "events"]
        pref.save()

        result = generate_recommendations(self.user, date_str=TOMORROW)
        self.assertGreaterEqual(len(result), 4)
        self.assertEqual(len({event.id for event in result[:4]}), len(result[:4]))

    def test_quality_filter_excludes_weak_and_suspicious_places(self):
        Event.objects.all().delete()
        whitelisted_shopping = make_event(
            "Riyadh Front",
            category="shopping",
            price=40,
            rating=4.8,
            tourism_relevance=5,
        )
        make_event(
            "Random Mall",
            category="shopping",
            price=35,
            rating=4.9,
            tourism_relevance=5,
        )
        known_landmark = make_event(
            "Kingdom Centre Tower",
            category="heritage",
            price=30,
            rating=4.7,
            tourism_relevance=5,
        )
        make_event(
            "Mystery Tower",
            category="entertainment",
            price=25,
            rating=4.8,
            tourism_relevance=5,
        )
        make_event(
            "Low Priority Heritage",
            category="heritage",
            price=20,
            rating=4.7,
            tourism_relevance=2,
        )
        make_event(
            "Low Rating Event",
            category="events",
            price=20,
            rating=4.1,
            tourism_relevance=5,
        )

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["shopping", "heritage", "entertainment", "events"]
        pref.save()

        result = generate_recommendations(self.user, date_str=TOMORROW)
        result_ids = {event.id for event in result}

        self.assertIn(whitelisted_shopping.id, result_ids)
        self.assertIn(known_landmark.id, result_ids)
        self.assertNotIn(
            Event.objects.get(title="Random Mall").id,
            result_ids,
        )
        self.assertNotIn(
            Event.objects.get(title="Mystery Tower").id,
            result_ids,
        )

    def test_boosted_tourism_categories_rank_above_food(self):
        Event.objects.all().delete()
        food = make_event(
            "Food Favorite",
            category="food",
            price=40,
            rating=4.8,
            tourism_relevance=5,
        )
        nature = make_event(
            "Nature Escape",
            category="nature",
            price=40,
            rating=4.8,
            tourism_relevance=5,
        )

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food", "nature"]
        pref.budget_min = 0
        pref.budget_max = 100
        pref.save()

        result = generate_recommendations(self.user, seed="tourism-boost")

        self.assertGreaterEqual(len(result), 2)
        self.assertEqual(result[0].id, nature.id)
        self.assertIn(food.id, [event.id for event in result])

    def test_plan_includes_non_food_activity_when_available(self):
        Event.objects.all().delete()
        for i in range(4):
            make_event(
                f"Food Spot {i}",
                category="food",
                price=35 + i,
                rating=4.8,
                tourism_relevance=5,
            )
        make_event(
            "Nature Walk",
            category="nature",
            price=35,
            rating=4.8,
            tourism_relevance=5,
        )

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.budget_min = 0
        pref.budget_max = 100
        pref.save()

        result = generate_recommendations(self.user, seed="require-non-food")

        self.assertTrue(any(event.category != "food" for event in result))

    def test_category_diversity_prefers_multiple_interest_categories(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food", "culture"]
        pref.save()

        result = generate_recommendations(self.user)
        categories = {event.category for event in result}

        self.assertIn("food", categories)
        self.assertIn("culture", categories)

    def test_budget_midpoint_ranks_closest_price_first(self):
        Event.objects.all().delete()
        low = make_event("Low", category="food", price=20)
        mid = make_event("Mid", category="food", price=40)
        high = make_event("High", category="food", price=75)

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.budget_min = 0
        pref.budget_max = 80
        pref.save()

        result = generate_recommendations(self.user)
        self.assertGreaterEqual(len(result), 1)
        self.assertEqual(result[0].id, mid.id)
        self.assertCountEqual([e.id for e in result], [low.id, mid.id, high.id])

    def test_recently_recommended_events_are_penalized(self):
        Event.objects.all().delete()
        repeated = make_event("Repeated", category="food", price=50)
        fresh = make_event("Fresh", category="food", price=50)

        yesterday = date.today() - timedelta(days=1)
        plan = DailyPlan.objects.create(user=self.user, date=yesterday)
        plan.events.add(repeated)

        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.budget_min = 0
        pref.budget_max = 100
        pref.save()

        result = generate_recommendations(self.user)
        self.assertEqual(result[0].id, fresh.id)
        self.assertIn(repeated.id, [e.id for e in result])

    def test_excluded_events_never_appear_in_results(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.save()

        baseline = generate_recommendations(self.user, seed="exclude-target")
        self.assertGreater(len(baseline), 0)
        excluded_id = baseline[0].id

        result = generate_recommendations(
            self.user,
            seed="exclude-target",
            exclude_ids={excluded_id},
        )
        self.assertNotIn(excluded_id, [event.id for event in result])

    def test_none_or_empty_exclusions_preserve_existing_behavior(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.save()

        seed = "exclude-empty-equivalence"
        baseline_ids = [e.id for e in generate_recommendations(self.user, seed=seed)]
        none_ids = [
            e.id
            for e in generate_recommendations(
                self.user,
                seed=seed,
                exclude_ids=None,
            )
        ]
        empty_ids = [
            e.id
            for e in generate_recommendations(
                self.user,
                seed=seed,
                exclude_ids=set(),
            )
        ]

        self.assertEqual(baseline_ids, none_ids)
        self.assertEqual(baseline_ids, empty_ids)

    def test_all_candidates_excluded_returns_empty_list(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.save()

        excluded_ids = set(
            Event.objects.filter(category="food").values_list("id", flat=True)
        )
        result = generate_recommendations(self.user, exclude_ids=excluded_ids)
        self.assertEqual(result, [])


class MultiDayRecommendationServiceTests(TestCase):
    def setUp(self):
        self.user = make_user("multiday-service@test.com")
        for i in range(8):
            make_event(f"MD Food {i}", category="food", price=40 + i)
        for i in range(5):
            make_event(f"MD Culture {i}", category="culture", price=10 + i)

    def _set_prefs(self, interests=None, trip_duration=None):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = interests or ["food", "culture"]
        if trip_duration is not None:
            pref.trip_duration = trip_duration
        pref.save()

    def test_multiday_service_happy_path_returns_n_day_tuples(self):
        self._set_prefs(trip_duration=3)
        start_date = TOMORROW

        result = generate_multiday_plan(self.user, start_date)

        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 3)
        self.assertTrue(all(isinstance(day[0], str) for day in result))
        self.assertTrue(all(isinstance(day[1], list) for day in result))

    def test_multiday_service_enforces_cross_day_uniqueness(self):
        self._set_prefs(trip_duration=3)

        result = generate_multiday_plan(self.user, TOMORROW)
        all_ids = [event.id for _, events in result for event in events]

        self.assertEqual(len(all_ids), len(set(all_ids)))

    def test_multiday_service_defaults_to_single_day(self):
        self._set_prefs()

        result = generate_multiday_plan(self.user, TOMORROW)

        self.assertEqual(len(result), 1)

    def test_multiday_service_returns_none_without_preferences(self):
        result = generate_multiday_plan(self.user, TOMORROW)
        self.assertIsNone(result)

    def test_multiday_service_distributes_when_events_are_limited(self):
        Event.objects.all().delete()
        for i in range(4):
            make_event(f"Limited Food {i}", category="food", price=30 + i)

        self._set_prefs(interests=["food"], trip_duration=6)
        result = generate_multiday_plan(self.user, TOMORROW)

        self.assertEqual(len(result), 6)
        flattened_ids = [event.id for _, events in result for event in events]
        self.assertEqual(len(flattened_ids), len(set(flattened_ids)))
        self.assertLessEqual(len(flattened_ids), 4)


# ---------------------------------------------------------------------------
# DailyPlan model
# ---------------------------------------------------------------------------


class DailyPlanModelTests(TestCase):
    def test_unique_together_user_date(self):
        from django.db import IntegrityError

        user = make_user("unique@test.com")
        DailyPlan.objects.create(user=user, date=date.today())
        with self.assertRaises(IntegrityError):
            DailyPlan.objects.create(user=user, date=date.today())

    def test_different_users_same_date_allowed(self):
        u1 = make_user("u1@test.com")
        u2 = make_user("u2@test.com")
        DailyPlan.objects.create(user=u1, date=date.today())
        DailyPlan.objects.create(user=u2, date=date.today())
        self.assertEqual(DailyPlan.objects.count(), 2)


# ---------------------------------------------------------------------------
# Generate endpoint
# ---------------------------------------------------------------------------


class GenerateDailyPlanAPITests(TestCase):
    def setUp(self):
        self.user = make_user("gen@test.com")
        self.client = auth_client(self.user)
        for i in range(3):
            make_event(f"Food {i}", category="food", price=50)

    def _set_prefs(self, interests=None, budget_max=None):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = interests or ["food"]
        pref.budget_max = budget_max
        pref.save()

    def test_generate_returns_plan_with_events(self):
        self._set_prefs()
        response = self.client.post("/api/daily-plan/generate/", {"date": TOMORROW})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("events", response.data)
        self.assertGreater(response.data["count"], 0)
        self.assertIsInstance(response.data["events"][0], dict)
        self.assertIn("title", response.data["events"][0])
        self.assertIn("location", response.data["events"][0])
        self.assertIn("latitude", response.data["events"][0])
        self.assertIn("longitude", response.data["events"][0])

    def test_generate_missing_date_returns_400(self):
        self._set_prefs()
        response = self.client.post("/api/daily-plan/generate/", {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_past_date_returns_400(self):
        self._set_prefs()
        response = self.client.post("/api/daily-plan/generate/", {"date": YESTERDAY})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_past_start_date_returns_400(self):
        self._set_prefs()
        response = self.client.post(
            "/api/daily-plan/generate/",
            {"date": TOMORROW, "start_date": YESTERDAY},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_invalid_date_format_returns_400(self):
        self._set_prefs()
        response = self.client.post("/api/daily-plan/generate/", {"date": "15/06/2026"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_without_preferences_returns_400(self):
        response = self.client.post("/api/daily-plan/generate/", {"date": TOMORROW})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_no_matching_events_returns_404(self):
        self._set_prefs(interests=["shopping"])  # no shopping events
        response = self.client.post("/api/daily-plan/generate/", {"date": TOMORROW})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_generate_second_time_same_date_returns_200_and_updates(self):
        self._set_prefs()
        self.client.post("/api/daily-plan/generate/", {"date": TOMORROW})
        response = self.client.post("/api/daily-plan/generate/", {"date": TOMORROW})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(DailyPlan.objects.filter(user=self.user).count(), 1)

    def test_generate_requires_auth(self):
        client = APIClient()
        response = client.post("/api/daily-plan/generate/", {"date": TOMORROW})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_generate_with_exclude_plan_dates_excludes_sibling_events(self):
        self._set_prefs()
        for i in range(4, 8):
            make_event(f"Food {i}", category="food", price=45 + i)

        target_date = date.today() + timedelta(days=2)
        day_before = target_date - timedelta(days=1)
        day_after = target_date + timedelta(days=1)

        excluded_a = Event.objects.get(title="Food 0")
        excluded_b = Event.objects.get(title="Food 1")

        before_plan = DailyPlan.objects.create(user=self.user, date=day_before)
        before_plan.events.add(excluded_a)
        after_plan = DailyPlan.objects.create(user=self.user, date=day_after)
        after_plan.events.add(excluded_b)

        response = self.client.post(
            "/api/daily-plan/generate/",
            {
                "date": target_date.isoformat(),
                "seed": "regen-day-2",
                "exclude_plan_dates": [day_before.isoformat(), day_after.isoformat()],
            },
        )

        self.assertIn(response.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))
        returned_ids = {event["id"] for event in response.data.get("events", [])}
        self.assertNotIn(excluded_a.id, returned_ids)
        self.assertNotIn(excluded_b.id, returned_ids)

    def test_generate_with_invalid_exclude_plan_dates_returns_400(self):
        self._set_prefs()
        response = self.client.post(
            "/api/daily-plan/generate/",
            {
                "date": TOMORROW,
                "exclude_plan_dates": ["bad-date"],
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_regeneration_one_day_does_not_change_other_plans(self):
        self._set_prefs()
        for i in range(4, 8):
            make_event(f"Food {i}", category="food", price=55 + i)

        day_1 = date.today() + timedelta(days=1)
        day_2 = date.today() + timedelta(days=2)
        day_3 = date.today() + timedelta(days=3)

        event_a = Event.objects.get(title="Food 0")
        event_b = Event.objects.get(title="Food 1")
        event_c = Event.objects.get(title="Food 2")

        plan_1 = DailyPlan.objects.create(user=self.user, date=day_1)
        plan_1.events.add(event_a)
        plan_2 = DailyPlan.objects.create(user=self.user, date=day_2)
        plan_2.events.add(event_b)
        plan_3 = DailyPlan.objects.create(user=self.user, date=day_3)
        plan_3.events.add(event_c)

        response = self.client.post(
            "/api/daily-plan/generate/",
            {
                "date": day_2.isoformat(),
                "seed": "regen-mid-day",
                "exclude_plan_dates": [day_1.isoformat(), day_3.isoformat()],
            },
        )
        self.assertIn(response.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        plan_1.refresh_from_db()
        plan_3.refresh_from_db()
        self.assertEqual(list(plan_1.events.values_list("id", flat=True)), [event_a.id])
        self.assertEqual(list(plan_3.events.values_list("id", flat=True)), [event_c.id])

    def test_generate_without_exclude_plan_dates_preserves_behavior(self):
        self._set_prefs()
        target_date = date.today() + timedelta(days=2)

        response_a = self.client.post(
            "/api/daily-plan/generate/",
            {"date": target_date.isoformat(), "seed": "same-seed"},
        )
        self.assertIn(response_a.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        response_b = self.client.post(
            "/api/daily-plan/generate/",
            {"date": target_date.isoformat(), "seed": "same-seed", "exclude_plan_dates": []},
        )
        self.assertIn(response_b.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

        ids_a = [event["id"] for event in response_a.data.get("events", [])]
        ids_b = [event["id"] for event in response_b.data.get("events", [])]
        self.assertEqual(ids_a, ids_b)

    def test_generate_falls_back_to_preference_dates_when_request_omits_them(self):
        Event.objects.all().delete()
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["events"]
        pref.start_date = date.today() + timedelta(days=5)
        pref.end_date = pref.start_date
        pref.save()

        matching = make_event(
            "Preferred Date Event",
            category="events",
            start_date=timezone.now() + timedelta(days=5),
            end_date=timezone.now() + timedelta(days=5),
        )
        make_event(
            "Other Date Event",
            category="events",
            start_date=timezone.now() + timedelta(days=8),
            end_date=timezone.now() + timedelta(days=8),
        )

        response = self.client.post("/api/daily-plan/generate/", {})

        self.assertIn(response.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))
        self.assertEqual(response.data["date"], pref.start_date.isoformat())
        returned_ids = {event["id"] for event in response.data.get("events", [])}
        self.assertIn(matching.id, returned_ids)

    def test_generate_uses_date_range_for_recommendations(self):
        Event.objects.all().delete()
        start_day = date.today() + timedelta(days=4)
        end_day = start_day + timedelta(days=2)
        overlapping = make_event(
            "Window Event",
            category="events",
            start_date=timezone.now() + timedelta(days=5),
            end_date=timezone.now() + timedelta(days=6),
        )
        make_event(
            "Outside Window Event",
            category="events",
            start_date=timezone.now() + timedelta(days=10),
            end_date=timezone.now() + timedelta(days=11),
        )
        make_event("Always Open Food", category="food", price=25)
        self._set_prefs(interests=["events", "food"])

        response = self.client.post(
            "/api/daily-plan/generate/",
            {
                "date": start_day.isoformat(),
                "start_date": start_day.isoformat(),
                "end_date": end_day.isoformat(),
                "seed": "range-generate-test",
            },
        )

        self.assertIn(response.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))
        returned_ids = {event["id"] for event in response.data.get("events", [])}
        self.assertIn(overlapping.id, returned_ids)

    def test_generate_rejects_end_date_before_start_date(self):
        self._set_prefs()
        start_day = date.today() + timedelta(days=3)
        response = self.client.post(
            "/api/daily-plan/generate/",
            {
                "date": start_day.isoformat(),
                "start_date": start_day.isoformat(),
                "end_date": (start_day - timedelta(days=1)).isoformat(),
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class GenerateMultiDayPlanAPITests(TestCase):
    def setUp(self):
        self.user = make_user("multiday-api@test.com")
        self.client = auth_client(self.user)
        self.start_date = TOMORROW

        for i in range(8):
            make_event(f"API Food {i}", category="food", price=45 + i)
        for i in range(5):
            make_event(f"API Culture {i}", category="culture", price=10 + i)

    def _set_prefs(self, interests=None, trip_duration=3):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = interests or ["food", "culture"]
        pref.trip_duration = trip_duration
        pref.save()

    def test_generate_multiday_success_returns_201_with_expected_shape(self):
        self._set_prefs(trip_duration=3)

        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["trip_duration"], 3)
        self.assertEqual(response.data["start_date"], self.start_date)
        self.assertEqual(len(response.data["plans"]), 3)
        self.assertIn("total_events", response.data)
        self.assertIn("date", response.data["plans"][0])
        self.assertIn("events", response.data["plans"][0])
        self.assertIn("count", response.data["plans"][0])

    def test_generate_multiday_accepts_end_date_range(self):
        self._set_prefs(trip_duration=1)
        end_date = (date.fromisoformat(self.start_date) + timedelta(days=2)).isoformat()

        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date, "end_date": end_date},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["trip_duration"], 3)
        self.assertEqual(response.data["end_date"], end_date)
        self.assertEqual(len(response.data["plans"]), 3)

    def test_generate_multiday_rejects_mismatched_end_date_and_trip_duration(self):
        self._set_prefs(trip_duration=1)
        end_date = (date.fromisoformat(self.start_date) + timedelta(days=2)).isoformat()

        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {
                "start_date": self.start_date,
                "end_date": end_date,
                "trip_duration": 2,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_multiday_seven_days_creates_and_returns_seven_plans(self):
        self._set_prefs(trip_duration=7)

        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["trip_duration"], 7)
        self.assertEqual(len(response.data["plans"]), 7)

        start_dt = date.fromisoformat(self.start_date)
        expected_dates = [start_dt + timedelta(days=i) for i in range(7)]
        response_dates = [
            date.fromisoformat(plan["date"]) for plan in response.data["plans"]
        ]
        db_dates = list(
            DailyPlan.objects.filter(user=self.user)
            .order_by("date")
            .values_list("date", flat=True)
        )

        self.assertEqual(response_dates, expected_dates)
        self.assertEqual(db_dates, expected_dates)

    def test_generate_multiday_request_trip_duration_overrides_default_preference(self):
        self._set_prefs(trip_duration=1)

        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date, "trip_duration": 7},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["trip_duration"], 7)
        self.assertEqual(len(response.data["plans"]), 7)

        start_dt = date.fromisoformat(self.start_date)
        expected_dates = [start_dt + timedelta(days=i) for i in range(7)]
        db_dates = list(
            DailyPlan.objects.filter(user=self.user)
            .order_by("date")
            .values_list("date", flat=True)
        )

        self.assertEqual(db_dates, expected_dates)

    def test_generate_multiday_missing_start_date_returns_400(self):
        self._set_prefs()
        response = self.client.post("/api/daily-plan/generate-multiday/", {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_multiday_falls_back_to_preference_start_date(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food", "culture"]
        pref.trip_duration = 2
        pref.start_date = date.today() + timedelta(days=2)
        pref.end_date = pref.start_date + timedelta(days=1)
        pref.save()

        response = self.client.post("/api/daily-plan/generate-multiday/", {})

        self.assertIn(response.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))
        self.assertEqual(response.data["start_date"], pref.start_date.isoformat())
        self.assertEqual(response.data["end_date"], pref.end_date.isoformat())

    def test_generate_multiday_past_date_returns_400(self):
        self._set_prefs()
        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": YESTERDAY},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_multiday_invalid_date_format_returns_400(self):
        self._set_prefs()
        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": "15/06/2026"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_multiday_invalid_trip_duration_returns_400(self):
        self._set_prefs()
        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date, "trip_duration": 0},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date, "trip_duration": "bad"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_multiday_without_preferences_returns_400(self):
        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_multiday_requires_auth(self):
        client = APIClient()
        response = client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date},
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_generate_multiday_existing_plans_are_replaced_within_requested_range(self):
        self._set_prefs(trip_duration=2)

        start_dt = date.fromisoformat(self.start_date)
        stale_plan = DailyPlan.objects.create(user=self.user, date=start_dt)
        far_stale = DailyPlan.objects.create(
            user=self.user,
            date=start_dt + timedelta(days=10),
        )

        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(DailyPlan.objects.filter(id=stale_plan.id).exists())
        self.assertTrue(DailyPlan.objects.filter(id=far_stale.id).exists())

        regenerated_dates = set(
            DailyPlan.objects.filter(user=self.user).values_list("date", flat=True)
        )
        self.assertEqual(
            regenerated_dates,
            {start_dt, start_dt + timedelta(days=1), start_dt + timedelta(days=10)},
        )

    def test_generate_multiday_only_replaces_plans_within_requested_range(self):
        self._set_prefs(interests=["food", "culture"], trip_duration=3)

        start_dt = date.fromisoformat(self.start_date)
        before_dt = start_dt - timedelta(days=2)
        inside_dates = [start_dt, start_dt + timedelta(days=1), start_dt + timedelta(days=2)]
        after_dt = start_dt + timedelta(days=5)

        before_event = Event.objects.get(title="API Food 0")
        inside_events = [
            Event.objects.get(title="API Food 1"),
            Event.objects.get(title="API Food 2"),
            Event.objects.get(title="API Food 3"),
        ]
        after_event = Event.objects.get(title="API Culture 0")

        before_plan = DailyPlan.objects.create(user=self.user, date=before_dt)
        before_plan.events.add(before_event)

        inside_plan_ids = []
        for plan_date, event in zip(inside_dates, inside_events):
            plan = DailyPlan.objects.create(user=self.user, date=plan_date)
            plan.events.add(event)
            inside_plan_ids.append(plan.id)

        after_plan = DailyPlan.objects.create(user=self.user, date=after_dt)
        after_plan.events.add(after_event)

        other_user = make_user("range-other@test.com")
        other_plan = DailyPlan.objects.create(user=other_user, date=start_dt)
        other_plan.events.add(before_event)

        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        before_plan.refresh_from_db()
        after_plan.refresh_from_db()
        other_plan.refresh_from_db()

        self.assertEqual(list(before_plan.events.values_list("id", flat=True)), [before_event.id])
        self.assertEqual(list(after_plan.events.values_list("id", flat=True)), [after_event.id])
        self.assertEqual(list(other_plan.events.values_list("id", flat=True)), [before_event.id])

        self.assertFalse(DailyPlan.objects.filter(id__in=inside_plan_ids).exists())

        regenerated_dates = set(
            DailyPlan.objects.filter(user=self.user, date__in=inside_dates)
            .values_list("date", flat=True)
        )
        self.assertEqual(regenerated_dates, set(inside_dates))

    def test_generate_multiday_atomicity_rolls_back_all_plans_on_error(self):
        self._set_prefs(trip_duration=2)
        start_dt = date.fromisoformat(self.start_date)
        original_create = DailyPlan.objects.create
        call_count = {"count": 0}

        def flaky_create(*args, **kwargs):
            call_count["count"] += 1
            if call_count["count"] == 2:
                raise RuntimeError("forced failure")
            return original_create(*args, **kwargs)

        with patch("daily_plan.views.DailyPlan.objects.create", side_effect=flaky_create):
            response = self.client.post(
                "/api/daily-plan/generate-multiday/",
                {"start_date": self.start_date},
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(
            DailyPlan.objects.filter(user=self.user, date__gte=start_dt).count(),
            0,
        )

    def test_generate_multiday_cleanup_excess_plans_when_duration_is_shortened(self):
        self._set_prefs(trip_duration=5)
        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self._set_prefs(trip_duration=3)
        response = self.client.post(
            "/api/daily-plan/generate-multiday/",
            {"start_date": self.start_date},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        start_dt = date.fromisoformat(self.start_date)
        remaining_dates = list(
            DailyPlan.objects.filter(user=self.user)
            .order_by("date")
            .values_list("date", flat=True)
        )
        self.assertEqual(
            remaining_dates,
            [
                start_dt,
                start_dt + timedelta(days=1),
                start_dt + timedelta(days=2),
                start_dt + timedelta(days=3),
                start_dt + timedelta(days=4),
            ],
        )


# ---------------------------------------------------------------------------
# DailyPlan CRUD endpoints
# ---------------------------------------------------------------------------


class DailyPlanCRUDTests(TestCase):
    def setUp(self):
        self.user = make_user("crud@test.com")
        self.other_user = make_user("other@test.com")
        self.client = auth_client(self.user)
        self.event = make_event()

    def test_list_returns_only_own_plans(self):
        own_plan = DailyPlan.objects.create(user=self.user, date=date.today())
        own_plan.events.add(self.event)
        DailyPlan.objects.create(user=self.other_user, date=date.today())
        response = self.client.get("/api/daily-plan/")
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(len(results[0]["events"]), 1)
        self.assertIsInstance(results[0]["events"][0], dict)
        self.assertEqual(results[0]["events"][0]["id"], self.event.id)
        self.assertEqual(results[0]["events"][0]["title"], self.event.title)

    def test_create_plan(self):
        response = self.client.post(
            "/api/daily-plan/", {"date": TOMORROW, "events": [self.event.id]}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["events"]), 1)
        self.assertIsInstance(response.data["events"][0], dict)
        self.assertEqual(response.data["events"][0]["id"], self.event.id)

    def test_retrieve_own_plan(self):
        plan = DailyPlan.objects.create(user=self.user, date=date.today())
        plan.events.add(self.event)
        response = self.client.get(f"/api/daily-plan/{plan.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["events"]), 1)
        self.assertIsInstance(response.data["events"][0], dict)
        self.assertEqual(response.data["events"][0]["id"], self.event.id)

    def test_cannot_retrieve_other_users_plan(self):
        plan = DailyPlan.objects.create(user=self.other_user, date=date.today())
        response = self.client.get(f"/api/daily-plan/{plan.pk}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_own_plan(self):
        plan = DailyPlan.objects.create(user=self.user, date=date.today())
        response = self.client.delete(f"/api/daily-plan/{plan.pk}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DailyPlan.objects.filter(pk=plan.pk).exists())

    def test_remove_event_from_persisted_plan(self):
        second_event = make_event(title="Second Place")
        plan = DailyPlan.objects.create(user=self.user, date=date.today())
        plan.events.add(self.event, second_event)

        response = self.client.delete(
            f"/api/daily-plan/{plan.pk}/events/{self.event.id}/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plan.refresh_from_db()
        self.assertEqual(list(plan.events.values_list("id", flat=True)), [second_event.id])
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["events"][0]["id"], second_event.id)

    def test_cannot_delete_other_users_plan(self):
        plan = DailyPlan.objects.create(user=self.other_user, date=date.today())
        response = self.client.delete(f"/api/daily-plan/{plan.pk}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(DailyPlan.objects.filter(pk=plan.pk).exists())

    def test_daily_plan_list_requires_auth(self):
        client = APIClient()
        response = client.get("/api/daily-plan/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_add_activity_uses_selected_date_not_today(self):
        script = textwrap.dedent(
            r"""
            const fs = require("fs");
            const vm = require("vm");

            const code = fs.readFileSync("static/js/daily_plan_integration.js", "utf8");
            const storage = new Map();
            const context = {
              console: { log() {}, error() {}, warn() {} },
              window: {},
              document: {
                addEventListener() {},
                getElementById() { return null; },
              },
              localStorage: {
                getItem(key) { return storage.has(key) ? storage.get(key) : null; },
                setItem(key, value) { storage.set(key, String(value)); },
              },
              setTimeout,
              clearTimeout,
            };

            vm.createContext(context);
            vm.runInContext(
              code + "\nthis.__test__ = { getSelectedPlanDate, setSelectedPlanDate };",
              context,
            );
            vm.runInContext('setSelectedPlanDate(\"2099-12-31\"); currentDayIndex = 0;', context);
            process.stdout.write(context.__test__.getSelectedPlanDate());
            """
        )

        result = subprocess.run(
            ["node", "-e", script],
            capture_output=True,
            text=True,
            cwd=".",
            check=False,
        )

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertEqual(result.stdout, "2099-12-31")

    def test_generate_request_includes_start_and_end_dates(self):
        script = textwrap.dedent(
            r"""
            const fs = require("fs");
            const vm = require("vm");

            const code = fs.readFileSync("static/js/daily_plan_integration.js", "utf8");
            const storage = new Map();
            const startInput = {
              value: "2099-04-10",
              addEventListener() {},
            };
            const endInput = {
              value: "2099-04-12",
              addEventListener() {},
            };
            const elements = {
              "plan-start-date": startInput,
              "plan-end-date": endInput,
              "trip-length-label": { textContent: "" },
            };
            let capturedPayload = null;
            const context = {
              console: { log() {}, error() {}, warn() {} },
              window: {},
              document: {
                addEventListener() {},
                getElementById(id) { return elements[id] || null; },
              },
              localStorage: {
                getItem(key) { return storage.has(key) ? storage.get(key) : null; },
                setItem(key, value) { storage.set(key, String(value)); },
                removeItem(key) { storage.delete(key); },
              },
              setTimeout,
              clearTimeout,
              apiPost: async (_url, payload) => {
                capturedPayload = payload;
                return { events: [] };
              },
              apiGet: async () => ({ trip_duration: 3 }),
              setLoading() {},
              renderDaysBar() {},
              renderPlanForDay() {},
              sortEventsByProximity(events) { return events; },
            };

            vm.createContext(context);
            vm.runInContext(
              code + "\nthis.__test__ = { requestPlanForSelectedDate, setSelectedPlanDate };",
              context,
            );
            vm.runInContext(
              'currentDayIndex = 0; setSelectedPlanDate(\"2099-04-10\");',
              context,
            );

            context.__test__.requestPlanForSelectedDate(null).then(() => {
              process.stdout.write(JSON.stringify(capturedPayload));
            });
            """
        )

        result = subprocess.run(
            ["node", "-e", script],
            capture_output=True,
            text=True,
            cwd=".",
            check=False,
        )

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn('"start_date":"2099-04-10"', result.stdout)
        self.assertIn('"end_date":"2099-04-12"', result.stdout)

