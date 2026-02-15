from django.urls import path
from .views import (
    DailyPlanListCreateAPIView,
    DailyPlanRetrieveUpdateAPIView,
    GenerateDailyPlanAPIView
)

urlpatterns = [
    path("", DailyPlanListCreateAPIView.as_view(), name="daily-plan"),
    path("generate/", GenerateDailyPlanAPIView.as_view(), name="daily-plan-generate"),
    path("<int:pk>/", DailyPlanRetrieveUpdateAPIView.as_view(), name="daily-plan-detail"),
]
