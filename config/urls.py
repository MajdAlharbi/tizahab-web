from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from django.views.generic import TemplateView
from django.contrib.auth.decorators import login_required, user_passes_test
from accounts.views import admin_panel_view, logout_view


protected_template = lambda template_name: login_required(  # noqa: E731
    TemplateView.as_view(template_name=template_name),
    login_url="/login/",
)
staff_required = user_passes_test(
    lambda user: user.is_authenticated and user.is_staff,
    login_url="/login/",
)

urlpatterns = [
    path("i18n/", include("django.conf.urls.i18n")),

    # Public index page
    path("", TemplateView.as_view(template_name="index.html"), name="index"),
    path("", TemplateView.as_view(template_name="index.html"), name="root"),
    path("home/", protected_template("home.html"), name="home"),
    path("dashboard/", protected_template("home.html"), name="dashboard"),

    path("admin/", admin.site.urls),

    # Auth Pages
    path("login/", TemplateView.as_view(template_name="login.html"), name="login"),
    path("signup/", TemplateView.as_view(template_name="signup.html"), name="signup"),
    path("logout/", logout_view, name="logout"),

    # Auth APIs
    path("api/auth/", include("accounts.urls")),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # Events
    path("api/events/", include("events.api_urls")),
    path("events/", include("events.page_urls")),

    # Daily Plan
    path("api/daily-plan/", include("daily_plan.urls")),
    path("daily-plan/", protected_template("daily_plan.html"), name="daily_plan"),

    # Dashboard Pages
    path("booking/", protected_template("booking.html"), name="booking"),
    path("map/", protected_template("map.html"), name="map"),
    path("car-rental/", protected_template("car_rental.html"), name="car_rental"),
    path("profile/", protected_template("profile.html"), name="profile"),
    path("settings/", protected_template("settings.html"), name="settings"),
    path("admin-panel/", staff_required(admin_panel_view), name="admin_panel"),
    path("onboarding/", protected_template("preferences.html"), name="onboarding"),
]
