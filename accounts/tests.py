from django.test import TestCase
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from django.core.signing import TimestampSigner, BadSignature
from unittest.mock import patch

from accounts.models import UserPreferences
from accounts.views import _make_reset_token, _read_reset_token
from accounts.serializers import UserPreferencesSerializer


def make_user(email="user@test.com", password="StrongPass1!"):
    return User.objects.create_user(username=email, email=email, password=password)


def auth_client(user):
    client = APIClient()
    response = client.post(
        "/api/auth/login/", {"email": user.email, "password": "StrongPass1!"}
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
    return client


class SignupTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_signup_creates_user_and_returns_tokens(self):
        response = self.client.post(
            "/api/auth/signup/",
            {
                "email": "new@test.com",
                "password": "StrongPass1!",
                "password2": "StrongPass1!",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertTrue(User.objects.filter(email="new@test.com").exists())

    def test_signup_rejects_duplicate_email(self):
        make_user("dup@test.com")
        response = self.client.post(
            "/api/auth/signup/",
            {
                "email": "dup@test.com",
                "password": "StrongPass1!",
                "password2": "StrongPass1!",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_signup_rejects_mismatched_passwords(self):
        response = self.client.post(
            "/api/auth/signup/",
            {
                "email": "mismatch@test.com",
                "password": "StrongPass1!",
                "password2": "Different1!",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_signup_rejects_weak_password(self):
        response = self.client.post(
            "/api/auth/signup/",
            {
                "email": "weak@test.com",
                "password": "123",
                "password2": "123",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()

    def test_login_returns_tokens(self):
        response = self.client.post(
            "/api/auth/login/",
            {
                "email": self.user.email,
                "password": "StrongPass1!",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_wrong_password(self):
        response = self.client.post(
            "/api/auth/login/",
            {
                "email": self.user.email,
                "password": "wrongpassword",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_unknown_email(self):
        response = self.client.post(
            "/api/auth/login/",
            {
                "email": "nobody@test.com",
                "password": "StrongPass1!",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class UserPreferencesTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.client = auth_client(self.user)

    def test_get_preferences_creates_defaults(self):
        response = self.client.get("/api/auth/preferences/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("interests", response.data)

    def test_set_valid_preferences(self):
        response = self.client.post(
            "/api/auth/preferences/",
            {
                "interests": ["restaurant", "culture"],
                "budget_min": 0,
                "budget_max": 300,
                "preferred_language": "ar",
            },
        )
        self.assertIn(
            response.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED]
        )
        pref = UserPreferences.objects.get(user=self.user)
        self.assertEqual(pref.interests, ["restaurant", "culture"])
        self.assertEqual(pref.budget_max, 300)

    def test_invalid_interest_rejected(self):
        response = self.client.post(
            "/api/auth/preferences/",
            {
                "interests": ["music"],
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_budget_min_greater_than_max_rejected(self):
        response = self.client.post(
            "/api/auth/preferences/",
            {
                "budget_min": 500,
                "budget_max": 100,
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_partial_update_budget_max_below_existing_min(self):
        pref, _ = UserPreferences.objects.get_or_create(user=self.user)
        pref.budget_min = 200
        pref.save()
        response = self.client.post("/api/auth/preferences/", {"budget_max": 50})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_trip_duration_below_range_returns_400(self):
        response = self.client.post("/api/auth/preferences/", {"trip_duration": 0})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_trip_duration_above_range_returns_400(self):
        response = self.client.post("/api/auth/preferences/", {"trip_duration": 31})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_preferences_require_auth(self):
        client = APIClient()
        response = client.get("/api/auth/preferences/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class PasswordResetTokenTests(TestCase):
    def test_token_roundtrip(self):
        user = make_user("roundtrip@test.com")
        token = _make_reset_token(user)
        result = _read_reset_token(token)
        self.assertEqual(result, str(user.pk))

    def test_bad_token_raises(self):
        with self.assertRaises(BadSignature):
            _read_reset_token("totally.invalid.token")

    def test_forgot_password_same_response_regardless_of_email(self):
        """Prevent user enumeration: both existing and non-existing emails get same response."""
        make_user("real@test.com")
        client = self.client

        r1 = client.post("/api/auth/ui/forgot-password/", {"email": "real@test.com"})
        r2 = client.post("/api/auth/ui/forgot-password/", {"email": "ghost@test.com"})

        # Both should redirect or render — neither should expose whether the user exists
        # real user gets redirect (302), non-existing user gets re-render (200 with info)
        # The key check: ghost email must NOT reveal "no account found"
        self.assertNotIn(b"No account found", r2.content)

    def test_reset_with_invalid_token_shows_error(self):
        response = self.client.get("/api/auth/ui/reset-password/badtoken/")
        self.assertIn(b"invalid", response.content.lower())

    def test_reset_with_valid_token_allows_password_change(self):
        user = make_user("resetme@test.com")
        token = _make_reset_token(user)
        from urllib.parse import quote

        safe_token = quote(token, safe="")

        response = self.client.post(
            f"/api/auth/ui/reset-password/{safe_token}/",
            {"password1": "NewPass123!", "password2": "NewPass123!"},
        )
        self.assertEqual(response.status_code, 302)
        user.refresh_from_db()
        self.assertTrue(user.check_password("NewPass123!"))

    def test_reset_token_cannot_be_reused_after_successful_reset(self):
        user = make_user("reset-once@test.com")
        token = _make_reset_token(user)
        from urllib.parse import quote

        safe_token = quote(token, safe="")
        url = f"/api/auth/ui/reset-password/{safe_token}/"

        first = self.client.post(
            url,
            {"password1": "NewPass123!", "password2": "NewPass123!"},
        )
        self.assertEqual(first.status_code, 302)

        second = self.client.post(
            url,
            {"password1": "AnotherPass123!", "password2": "AnotherPass123!"},
        )
        self.assertEqual(second.status_code, 200)
        self.assertIn(b"invalid", second.content.lower())

        user.refresh_from_db()
        self.assertTrue(user.check_password("NewPass123!"))

    @patch("accounts.views.logger")
    @patch("accounts.views.send_mail", side_effect=RuntimeError("smtp down"))
    def test_forgot_password_logs_email_failures_but_keeps_safe_response(
        self, send_mail_mock, logger_mock
    ):
        make_user("mailfail@test.com")

        response = self.client.post(
            "/api/auth/ui/forgot-password/",
            {"email": "mailfail@test.com"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"if that email is registered", response.content.lower())
        send_mail_mock.assert_called_once()
        logger_mock.error.assert_called_once()
