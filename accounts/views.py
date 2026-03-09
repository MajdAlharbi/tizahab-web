from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.shortcuts import render

from .models import UserPreferences
from .serializers import (
    UserPreferencesSerializer,
    SignupSerializer,
    LoginSerializer,
)


def login_page(request):
    return render(request, "login.html")

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.shortcuts import redirect

User = get_user_model()


def forgot_password_page(request):
    if request.method == "POST":
        email = request.POST.get("email")

        try:
            user = User.objects.get(email=email)

            # نرسل المستخدم لصفحة تغيير كلمة المرور
            return redirect(f"/api/auth/ui/reset-password/{user.id}/")

        except User.DoesNotExist:
            return render(
                request,
                "forgot_password.html",
                {"error": "No account found with this email"},
            )

    return render(request, "forgot_password.html")


def reset_password_page(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return redirect("/api/auth/ui/login/")

    if request.method == "POST":
        password1 = request.POST.get("password1")
        password2 = request.POST.get("password2")

        if password1 == password2:
            user.password = make_password(password1)
            user.save()

            return redirect("/api/auth/ui/login/")

    return render(request, "reset_password.html")

def signup_page(request):
    return render(request, "signup.html")

def preferences_page(request):
    return render(request, "preferences.html")


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
