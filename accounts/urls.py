from django.urls import path
from .views import (
    SignupAPIView,
    LoginAPIView,
    UserPreferencesView,
    login_page,
    signup_page,
    preferences_page,
    forgot_password_page,
    reset_password_page,
)

urlpatterns = [
    # API endpoints
    path("signup/", SignupAPIView.as_view(), name="signup"),
    path("login/", LoginAPIView.as_view(), name="login"),
    path("preferences/", UserPreferencesView.as_view(), name="user-preferences"),

    # UI pages
    path("ui/login/", login_page, name="login-page"),
    path("ui/signup/", signup_page, name="signup-page"),
    path("ui/preferences/", preferences_page, name="preferences-page"),
    path("ui/forgot-password/", forgot_password_page, name="forgot-password"),
    path("ui/reset-password/<str:token>/", reset_password_page, name="reset-password"),
]
