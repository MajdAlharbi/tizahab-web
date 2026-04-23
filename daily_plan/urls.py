from django.urls import path
from .views import (
    DailyPlanListCreateAPIView,
    DailyPlanRetrieveUpdateDestroyAPIView,
    DailyPlanEventRemoveAPIView,
    GenerateDailyPlanAPIView,
    GenerateMultiDayPlanAPIView,
)

app_name = "daily_plan"

urlpatterns = [
    path("", DailyPlanListCreateAPIView.as_view(), name="daily-plan"),
    path("generate/", GenerateDailyPlanAPIView.as_view(), name="daily-plan-generate"),
    path(
        "generate-multiday/",
        GenerateMultiDayPlanAPIView.as_view(),
        name="daily-plan-generate-multiday",
    ),
    path(
        "<int:pk>/",
        DailyPlanRetrieveUpdateDestroyAPIView.as_view(),
        name="daily-plan-detail",
    ),
    path(
        "<int:pk>/events/<int:event_id>/",
        DailyPlanEventRemoveAPIView.as_view(),
        name="daily-plan-event-remove",
    ),
]
