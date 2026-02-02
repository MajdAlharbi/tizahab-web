from django.urls import path
from .views import SignupAPIView, LoginAPIView
from .views import UserPreferencesView

urlpatterns = [
    path("signup/", SignupAPIView.as_view(), name="signup"),
    path("login/", LoginAPIView.as_view(), name="login"),
    path("preferences/", UserPreferencesView.as_view(), name="preferences"),
]

