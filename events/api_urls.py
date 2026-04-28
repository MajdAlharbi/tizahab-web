from django.urls import path
from .views import (
    EventListAPIView,
    EventRetrieveAPIView,
    FilteredEventsAPIView,
    FavoriteListCreateAPIView,
    FavoriteBulkCreateAPIView,
    FavoriteDeleteAPIView,
    AdminEventListCreateAPIView,
    AdminEventRetrieveUpdateDestroyAPIView,
    AdminDashboardStatsAPIView,
)

urlpatterns = [
    path("", EventListAPIView.as_view(), name="event-list"),
    path("filtered/", FilteredEventsAPIView.as_view(), name="event-filtered"),
    path(
        "favorites/", FavoriteListCreateAPIView.as_view(), name="favorites-list-create"
    ),
    path(
        "favorites/bulk/",
        FavoriteBulkCreateAPIView.as_view(),
        name="favorites-bulk-create",
    ),
    path(
        "favorites/<int:event_id>/",
        FavoriteDeleteAPIView.as_view(),
        name="favorites-delete",
    ),
    path("<int:pk>/", EventRetrieveAPIView.as_view(), name="event-detail"),
    # Admin event management
    path("admin/events/", AdminEventListCreateAPIView.as_view(), name="admin-event-list"),
    path("admin/events/<int:pk>/", AdminEventRetrieveUpdateDestroyAPIView.as_view(), name="admin-event-detail"),
    path("admin/stats/", AdminDashboardStatsAPIView.as_view(), name="admin-stats"),
]
