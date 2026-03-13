from datetime import date, timedelta

from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from events.models import Event
from daily_plan.models import DailyPlan
from daily_plan.services import generate_recommendations
from accounts.models import UserPreferences


def make_user(email="dp@test.com", password="StrongPass1!"):
    return User.objects.create_user(username=email, email=email, password=password)


def make_event(title="Place", category="food", price=50.0):
    return Event.objects.create(
        title=title,
        category=category,
        description="desc",
        date=timezone.now(),
        location="Riyadh",
        price=price,
        price_range="",
    )


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

    def test_date_str_arg_is_accepted_and_ignored(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food"]
        pref.save()
        result = generate_recommendations(self.user, date_str="2026-01-01")
        self.assertIsInstance(result, list)


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

    def test_generate_missing_date_returns_400(self):
        self._set_prefs()
        response = self.client.post("/api/daily-plan/generate/", {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_generate_past_date_returns_400(self):
        self._set_prefs()
        response = self.client.post("/api/daily-plan/generate/", {"date": YESTERDAY})
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
        DailyPlan.objects.create(user=self.user, date=date.today())
        DailyPlan.objects.create(user=self.other_user, date=date.today())
        response = self.client.get("/api/daily-plan/")
        results = response.data.get("results", response.data)
        self.assertEqual(len(results), 1)

    def test_create_plan(self):
        response = self.client.post("/api/daily-plan/", {"date": TOMORROW, "events": []})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_retrieve_own_plan(self):
        plan = DailyPlan.objects.create(user=self.user, date=date.today())
        response = self.client.get(f"/api/daily-plan/{plan.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_cannot_retrieve_other_users_plan(self):
        plan = DailyPlan.objects.create(user=self.other_user, date=date.today())
        response = self.client.get(f"/api/daily-plan/{plan.pk}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_own_plan(self):
        plan = DailyPlan.objects.create(user=self.user, date=date.today())
        response = self.client.delete(f"/api/daily-plan/{plan.pk}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DailyPlan.objects.filter(pk=plan.pk).exists())

    def test_cannot_delete_other_users_plan(self):
        plan = DailyPlan.objects.create(user=self.other_user, date=date.today())
        response = self.client.delete(f"/api/daily-plan/{plan.pk}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(DailyPlan.objects.filter(pk=plan.pk).exists())

    def test_daily_plan_list_requires_auth(self):
        client = APIClient()
        response = client.get("/api/daily-plan/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
