from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.shortcuts import render, redirect
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.admin.views.decorators import staff_member_required
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.signing import TimestampSigner, SignatureExpired, BadSignature
from django.conf import settings
from django_ratelimit.decorators import ratelimit

from .models import UserPreferences
from .serializers import (
    UserPreferencesSerializer,
    SignupSerializer,
    LoginSerializer,
)

User = get_user_model()

_RESET_SALT = "tizahab-password-reset"
_RESET_MAX_AGE = 3600  # 1 hour


def _make_reset_token(user_pk):
    signer = TimestampSigner(salt=_RESET_SALT)
    return signer.sign(str(user_pk))


def _read_reset_token(token):
    """Return user_pk string or raise SignatureExpired / BadSignature."""
    signer = TimestampSigner(salt=_RESET_SALT)
    return signer.unsign(token, max_age=_RESET_MAX_AGE)


@ratelimit(key="ip", rate="5/m", block=True)
def login_page(request):
    return render(request, "login.html")


@ratelimit(key="ip", rate="5/m", block=True)
def signup_page(request):
    return render(request, "signup.html")


def preferences_page(request):
    return render(request, "preferences.html")


@ratelimit(key="ip", rate="3/m", block=True)
def forgot_password_page(request):
    if request.method == "POST":
        email = request.POST.get("email", "").strip()
        try:
            user = User.objects.get(email=email)
            token = _make_reset_token(user.pk)
            from urllib.parse import quote

            safe_token = quote(token, safe="")
            reset_url = request.build_absolute_uri(
                f"/api/auth/ui/reset-password/{safe_token}/"
            )
            send_mail(
                subject="Reset your Tizahab password",
                message=f"Click to reset your password: {reset_url}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
            )
        except User.DoesNotExist:
            pass

        return render(
            request,
            "forgot_password.html",
            {"info": "If that email is registered you will receive a reset link."},
        )

    return render(request, "forgot_password.html")


def reset_password_page(request, token):
    from urllib.parse import unquote

    safe_token = unquote(token)

    try:
        user_pk = _read_reset_token(safe_token)
        user = User.objects.get(pk=user_pk)
    except (SignatureExpired, BadSignature, User.DoesNotExist, ValueError):
        return render(
            request,
            "reset_password.html",
            {"error": "This reset link is invalid or has expired."},
        )

    if request.method == "POST":
        password1 = request.POST.get("password1", "")
        password2 = request.POST.get("password2", "")

        if not password1:
            return render(
                request,
                "reset_password.html",
                {"token": token, "error": "Password cannot be empty."},
            )

        if password1 != password2:
            return render(
                request,
                "reset_password.html",
                {"token": token, "error": "Passwords do not match."},
            )

        try:
            validate_password(password1, user=user)
        except ValidationError as e:
            return render(
                request,
                "reset_password.html",
                {"token": token, "error": e.messages[0]},
            )

        user.set_password(password1)
        user.save()
        return redirect("/login/")

    return render(request, "reset_password.html", {"token": token})


class SignupAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED,
        )


class LoginAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class UserPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preferences, _ = UserPreferences.objects.get_or_create(user=request.user)
        serializer = UserPreferencesSerializer(preferences)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        preferences, created = UserPreferences.objects.get_or_create(user=request.user)
        serializer = UserPreferencesSerializer(
            preferences, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def put(self, request):
        return self.post(request)


class CurrentUserView(APIView):
    """GET /api/auth/me/ — returns the authenticated user's profile data."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        preferences, _ = UserPreferences.objects.get_or_create(user=user)
        return Response(
            {
                "email": user.email,
                "username": user.username,
                "interests": preferences.interests or [],
                "budget_min": preferences.budget_min,
                "budget_max": preferences.budget_max,
                "preferred_language": preferences.preferred_language,
            },
            status=status.HTTP_200_OK,
        )


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ — change password for authenticated user."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        current_password = request.data.get("current_password", "")
        new_password = request.data.get("new_password", "")

        if not current_password or not new_password:
            return Response(
                {"detail": "Both current_password and new_password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        if not user.check_password(current_password):
            return Response(
                {"detail": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_password(new_password, user=user)
        except ValidationError as e:
            return Response(
                {"detail": e.messages[0]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save()
        return Response(
            {"detail": "Password updated successfully."},
            status=status.HTTP_200_OK,
        )


@staff_member_required(login_url="/login/")
def admin_panel_view(request):
    return render(request, "admin.html")
