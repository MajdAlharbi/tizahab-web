from django.urls import path
from .views import FilteredEventsAPIView

urlpatterns = [
    path("events/", FilteredEventsAPIView.as_view(), name="filtered-events"),
]
