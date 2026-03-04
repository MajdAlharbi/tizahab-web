from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from django.views.generic import TemplateView

urlpatterns = [
    path("", TemplateView.as_view(template_name="home.html"), name="home"),
    path("admin/", admin.site.urls),

    # Auth
    path("api/auth/", include("accounts.urls")),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # Events
    path("api/events/", include("events.urls")),
    path("events/", include("events.urls")),

    # Daily Plan API
    path("api/daily-plan/", include("daily_plan.urls")),

    # Daily Plan page
    path("daily_plan/", TemplateView.as_view(template_name="daily_plan.html"), name="daily_plan"),
]