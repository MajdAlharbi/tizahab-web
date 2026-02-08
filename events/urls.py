from django.urls import path
from .views import FilteredEventsAPIView

urlpatterns = [
    path("events/", FilteredEventsAPIView.as_view(), name="filtered-events"),
from .views import EventListAPIView

urlpatterns = [
    path('events/', EventListAPIView.as_view(), name='events-list'),
]
