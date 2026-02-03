from django.urls import path
from .views import SignupAPIView, LoginAPIView, UserPreferencesView
from .views import login_page, signup_page

urlpatterns = [
    # API endpoints
    path("signup/", SignupAPIView.as_view(), name="signup"),
    path("login/", LoginAPIView.as_view(), name="login"),
    path("preferences/", UserPreferencesView.as_view(), name="user-preferences"),

    # UI pages (Django templates)
    path("ui/login/", login_page, name="login-page"),
    path("ui/signup/", signup_page, name="signup-page"),
]

