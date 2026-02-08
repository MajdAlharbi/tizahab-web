from django.urls import path
from .views import (
    DailyPlanListCreateAPIView,
    DailyPlanRetrieveUpdateAPIView
)

urlpatterns = [
    path("", DailyPlanListCreateAPIView.as_view(), name="daily-plan-list-create"),
    path("", DailyPlanListCreateAPIView.as_view(), name="daily-plan"),
    path("<int:pk>/", DailyPlanRetrieveUpdateAPIView.as_view(), name="daily-plan-detail"),
]
