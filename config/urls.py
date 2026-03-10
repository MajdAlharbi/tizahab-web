from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from django.views.generic import TemplateView

urlpatterns = [
    # Home Page
    path("", TemplateView.as_view(template_name="home.html"), name="home"),
    path("admin/", admin.site.urls),

    # Auth Pages (This is the fix!)
    path("login/", TemplateView.as_view(template_name="login.html"), name="login"),
    path("signup/", TemplateView.as_view(template_name="signup.html"), name="signup"),

    # Auth APIs
    path("api/auth/", include("accounts.urls")),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # Events APIs & Pages
    path("api/events/", include("events.urls")),
    path("events/", include("events.urls")),

    # Daily Plan APIs & Pages
    path("api/daily-plan/", include("itinerary.urls")),
    path("daily-plan/", TemplateView.as_view(template_name="daily_plan.html"), name="daily_plan"),
]