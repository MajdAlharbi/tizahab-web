from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.shortcuts import render, redirect
from django.contrib.auth import get_user_model
from django.core.signing import TimestampSigner, SignatureExpired, BadSignature

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


def login_page(request):
    return render(request, "login.html")


def signup_page(request):
    return render(request, "signup.html")


def preferences_page(request):
    return render(request, "preferences.html")


def forgot_password_page(request):
    if request.method == "POST":
        email = request.POST.get("email", "").strip()
        # Always show the same message to prevent user enumeration
        try:
            user = User.objects.get(email=email)
            token = _make_reset_token(user.pk)
            # URL-encode the token (TimestampSigner uses ':' as separator)
            from urllib.parse import quote

            safe_token = quote(token, safe="")
            return redirect(f"/api/auth/ui/reset-password/{safe_token}/")
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
