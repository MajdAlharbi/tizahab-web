from django.urls import path
from . import views

urlpatterns = [
    path("", views.events_list, name="events_list"),
    path("<int:event_id>/", views.event_details, name="event_details"),
from .views import FilteredEventsAPIView

urlpatterns = [
    path("events/", FilteredEventsAPIView.as_view(), name="filtered-events"),
from .views import EventListAPIView

urlpatterns = [
    path('events/', EventListAPIView.as_view(), name='events-list'),
]
