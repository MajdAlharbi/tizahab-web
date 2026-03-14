from django.urls import path
from .views import EventListAPIView, EventRetrieveAPIView, FilteredEventsAPIView

urlpatterns = [
    path("", EventListAPIView.as_view(), name="event-list"),
    path("filtered/", FilteredEventsAPIView.as_view(), name="event-filtered"),
    path("<int:pk>/", EventRetrieveAPIView.as_view(), name="event-detail"),
]
