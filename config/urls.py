from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from django.views.generic import TemplateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/events/", include("events.urls")),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("events/", include("events.urls")),
    path("api/daily-plan/", include("daily_plan.urls")),
    path("api/", include("events.urls")),
    path("daily-plan/", TemplateView.as_view(template_name="daily_plan.html"), name="daily_plan"),

]
