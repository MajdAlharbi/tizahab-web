from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from django.views.generic import TemplateView
from django.contrib.auth import views as auth_views
from accounts.views import admin_panel_view

# هذا فقط لتغيير اللغة من الزر
urlpatterns = [
    path("i18n/", include("django.conf.urls.i18n")),

    # Public landing page
    path("", TemplateView.as_view(template_name="landing.html"), name="root"),
    path("home/", TemplateView.as_view(template_name="home.html"), name="home"),
    path("dashboard/", TemplateView.as_view(template_name="home.html"), name="dashboard"),

    path("admin/", admin.site.urls),

    # Auth Pages
    path("login/", TemplateView.as_view(template_name="login.html"), name="login"),
    path("signup/", TemplateView.as_view(template_name="signup.html"), name="signup"),
    path("logout/", auth_views.LogoutView.as_view(next_page="/login/"), name="logout"),

    # Auth APIs
    path("api/auth/", include("accounts.urls")),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # Events
    path("api/events/", include("events.api_urls")),
    path("events/", include("events.page_urls")),

    # Daily Plan
    path("api/daily-plan/", include("daily_plan.urls")),
    path("daily-plan/", TemplateView.as_view(template_name="daily_plan.html"), name="daily_plan"),

    # Dashboard Pages
    path("map/", TemplateView.as_view(template_name="map.html"), name="map"),
    path("profile/", TemplateView.as_view(template_name="profile.html"), name="profile"),
    path("settings/", TemplateView.as_view(template_name="settings.html"), name="settings"),
    path("admin-panel/", admin_panel_view, name="admin_panel"),
    path("onboarding/", TemplateView.as_view(template_name="preferences.html"), name="onboarding"),
]
USE_I18N = True

LANGUAGES = [
    ('en', 'English'),
    ('ar', 'Arabic'),
]

LANGUAGE_CODE = 'en'