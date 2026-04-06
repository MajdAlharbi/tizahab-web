from django.urls import path
from .views import (
    DailyPlanListCreateAPIView,
    DailyPlanRetrieveUpdateDestroyAPIView,
    GenerateDailyPlanAPIView,
)

app_name = "daily_plan"

urlpatterns = [
    path("", DailyPlanListCreateAPIView.as_view(), name="daily-plan"),
    path("generate/", GenerateDailyPlanAPIView.as_view(), name="daily-plan-generate"),
    path(
        "<int:pk>/",
        DailyPlanRetrieveUpdateDestroyAPIView.as_view(),
        name="daily-plan-detail",
    ),
]
