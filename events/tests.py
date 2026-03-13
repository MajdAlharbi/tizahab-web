from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from events.models import Event
from events.views import _parse_date, _apply_date_range_filter
from accounts.models import UserPreferences


def make_user(email="ev@test.com", password="StrongPass1!"):
    return User.objects.create_user(username=email, email=email, password=password)


def make_event(title="Test Event", category="food", price=50.00, **kwargs):
    defaults = {
        "description": "A test event",
        "date": timezone.now(),
        "location": "Riyadh",
        "price": price,
        "price_range": "",
    }
    defaults.update(kwargs)
    return Event.objects.create(title=title, category=category, **defaults)


def auth_client(user, password="StrongPass1!"):
    client = APIClient()
    response = client.post("/api/auth/login/", {"email": user.email, "password": password})
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return client


class ParseDateTests(TestCase):
    def test_valid_date(self):
        result = _parse_date("2026-06-15")
        self.assertEqual(str(result), "2026-06-15")

    def test_invalid_date_returns_none(self):
        self.assertIsNone(_parse_date("not-a-date"))
        self.assertIsNone(_parse_date(""))
        self.assertIsNone(_parse_date(None))


class EventListAPITests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.client = auth_client(self.user)
        make_event("Food Place", category="food", price=50)
        make_event("Culture Spot", category="culture", price=0)
        make_event("Outdoor Park", category="outdoor", price=0)

    def test_list_returns_all_events(self):
        response = self.client.get("/api/events/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Pagination: check 'results' key exists
        data = response.data
        results = data.get("results", data)
        self.assertGreaterEqual(len(results), 3)

    def test_filter_by_category(self):
        response = self.client.get("/api/events/?category=food")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        for event in results:
            self.assertEqual(event["category"], "food")

    def test_search_by_title(self):
        response = self.client.get("/api/events/?search=Culture")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        titles = [e["title"] for e in results]
        self.assertTrue(any("Culture" in t for t in titles))

    def test_invalid_date_returns_400(self):
        response = self.client.get("/api/events/filtered/?date_from=baddate")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_events_require_auth(self):
        client = APIClient()
        response = client.get("/api/events/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_serializer_includes_price_and_dates(self):
        response = self.client.get("/api/events/")
        results = response.data.get("results", response.data)
        self.assertTrue(len(results) > 0)
        first = results[0]
        self.assertIn("price", first)
        self.assertIn("start_date", first)
        self.assertIn("end_date", first)


class FilteredEventsAPITests(TestCase):
    def setUp(self):
        self.user = make_user("filt@test.com")
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.interests = ["food", "culture"]
        pref.budget_max = 100
        pref.save()
        self.client = auth_client(self.user)

        make_event("Cheap Food", category="food", price=30)
        make_event("Expensive Food", category="food", price=200)
        make_event("Free Culture", category="culture", price=0)
        make_event("Outdoor Park", category="outdoor", price=0)

    def test_filters_by_user_interests(self):
        # FilteredEventsAPIView returns a plain list (not paginated)
        response = self.client.get("/api/events/filtered/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data
        categories = {e["category"] for e in results}
        self.assertNotIn("outdoor", categories)

    def test_budget_filter_excludes_expensive(self):
        response = self.client.get("/api/events/filtered/")
        results = response.data
        for event in results:
            price = event.get("price")
            if price is not None:
                self.assertLessEqual(float(price), 100)

    def test_null_price_events_included_with_budget(self):
        make_event("No Price Food", category="food", price=None)
        response = self.client.get("/api/events/filtered/")
        results = response.data
        titles = [e["title"] for e in results]
        self.assertIn("No Price Food", titles)


class EventModelTests(TestCase):
    def test_event_str(self):
        event = make_event("My Event")
        self.assertEqual(str(event), "My Event")

    def test_event_price_nullable(self):
        event = make_event("Free Event", price=None)
        self.assertIsNone(event.price)

    def test_event_start_end_date_nullable(self):
        event = make_event("Always Open")
        self.assertIsNone(event.start_date)
        self.assertIsNone(event.end_date)
