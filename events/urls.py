from django.urls import path
from . import views
from .views import EventListAPIView, FilteredEventsAPIView, EventRetrieveAPIView

urlpatterns = [
    # HTML pages
    path("page/", views.events_list, name="events-page"),
    path("page/<int:event_id>/", views.event_details, name="event-details-page"),

    # APIs
    path("", EventListAPIView.as_view(), name="events-api"),
    path("filtered/", FilteredEventsAPIView.as_view(), name="events-filtered-api"),
    path("<int:pk>/", EventRetrieveAPIView.as_view(), name="event-detail-api"),
]
