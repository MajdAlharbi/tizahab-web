from django.urls import path

from .views import (
    EventListAPIView,
    FilteredEventsAPIView,
    EventRetrieveAPIView,
    AdminEventListCreateAPIView,
    AdminEventRetrieveUpdateDestroyAPIView,
    AdminDashboardStatsAPIView
)
urlpatterns = [
    # HTML pages
    path("page/", views.events_list, name="events-page"),
    path("page/<int:event_id>/", views.event_details, name="event-details-page"),
    path("admin/stats/", AdminDashboardStatsAPIView.as_view(), name="admin-stats"),
    path("admin/events/", AdminEventListCreateAPIView.as_view(), name="admin-event-list-create"),
    path("admin/events/<int:pk>/", AdminEventRetrieveUpdateDestroyAPIView.as_view(), name="admin-event-detail"),
    # APIs
    path("", EventListAPIView.as_view(), name="events-api"),
    path("filtered/", FilteredEventsAPIView.as_view(), name="events-filtered-api"),
    path("<int:pk>/", EventRetrieveAPIView.as_view(), name="event-detail-api"),
]
