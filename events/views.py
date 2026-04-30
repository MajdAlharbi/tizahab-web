from datetime import date

from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.generics import (
    ListAPIView,
    RetrieveAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView
)
from rest_framework.pagination import PageNumberPagination

from django.shortcuts import render, get_object_or_404
from django.db.models import Q, Count
from django.contrib.auth import get_user_model

from .models import Event, Favorite
from .serializers import EventSerializer, FavoriteSerializer
from .categories import TOURISM_CATEGORY_VALUES, normalize_category_input
from daily_plan.models import DailyPlan

VALID_EVENT_CATEGORIES = set(TOURISM_CATEGORY_VALUES)


class EventListPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


def events_list_page(request):
    return render(request, "events_list.html")


def event_detail_page(request, event_id):
    return render(request, "event_details.html", {"event_id": event_id})


def _parse_date(value):
    """Parse ISO date string safely. Returns None on invalid input."""
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def _parse_required_query_date(value, field_name):
    parsed = _parse_date(value)
    if parsed is None:
        raise ValidationError(
            {"detail": f"Invalid {field_name} format. Use YYYY-MM-DD."}
        )
    return parsed


def _validate_category(value):
    if value is None:
        return None
    raw_value = str(value).strip().lower()
    if not raw_value:
        return None
    normalized = normalize_category_input(raw_value)
    if normalized not in VALID_EVENT_CATEGORIES:
        raise ValidationError(
            {
                "detail": (
                    "Invalid category. "
                    f"Valid options: {sorted(VALID_EVENT_CATEGORIES)}"
                )
            }
        )
    return normalized


def _apply_date_range_filter(queryset, date_from, date_to):
    """Apply date range filter covering both date and start_date/end_date patterns."""
    if not date_from and not date_to:
        return queryset

    date_query = Q()

    if date_from and date_to:
        date_query = (
            Q(start_date__date__lte=date_to) & Q(end_date__date__gte=date_from)
        ) | (
            Q(start_date__isnull=True)
            & Q(end_date__isnull=True)
            & Q(date__date__gte=date_from)
            & Q(date__date__lte=date_to)
        )
    elif date_from:
        date_query = (Q(end_date__date__gte=date_from)) | (
            Q(end_date__isnull=True) & Q(date__date__gte=date_from)
        )
    elif date_to:
        date_query = (Q(start_date__date__lte=date_to)) | (
            Q(start_date__isnull=True) & Q(date__date__lte=date_to)
        )

    return queryset.filter(date_query)


class FilteredEventsAPIView(ListAPIView):
    """
    Filter events by user interests, budget, and date range.
    Query params: date_from, date_to (YYYY-MM-DD)
    """

    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        prefs = getattr(self.request.user, "preferences", None)
        queryset = Event.objects.filter(is_active=True)

        if prefs and prefs.interests:
            interests = [
                normalize_category_input(x) for x in prefs.interests if str(x).strip()
            ]
            if interests:
                queryset = queryset.filter(category__in=interests)

        date_from_raw = self.request.query_params.get("date_from")
        date_to_raw = self.request.query_params.get("date_to")

        date_from = (
            _parse_required_query_date(date_from_raw, "date_from")
            if date_from_raw
            else None
        )
        date_to = (
            _parse_required_query_date(date_to_raw, "date_to")
            if date_to_raw
            else None
        )
        if date_from and date_to and date_from > date_to:
            raise ValidationError(
                {"detail": "date_from cannot be later than date_to."}
            )

        queryset = _apply_date_range_filter(queryset, date_from, date_to)

        if prefs and prefs.budget_max is not None:
            queryset = queryset.filter(
                Q(price__lte=prefs.budget_max) | Q(price__isnull=True)
            )
        if prefs and prefs.budget_min is not None:
            queryset = queryset.filter(
                Q(price__gte=prefs.budget_min) | Q(price__isnull=True)
            )
        if prefs and prefs.min_rating is not None:
            queryset = queryset.filter(rating__gte=prefs.min_rating)

        return queryset


class EventListAPIView(ListAPIView):
    """
    List events with optional filtering.
    Query params: category, date (YYYY-MM-DD), search
    """

    serializer_class = EventSerializer
    permission_classes = [AllowAny]
    pagination_class = EventListPagination

    def get_queryset(self):
        queryset = Event.objects.filter(is_active=True)

        category = self.request.query_params.get("category", "").strip()
        if category and category.lower() != "all":
            queryset = queryset.filter(category__iexact=category)

        search = self.request.query_params.get("search", "").strip()

        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(category__icontains=search)
            )

        date = self.request.query_params.get("date")

        if date:
            queryset = queryset.filter(
                Q(date__date=date) |
                Q(start_date__date__lte=date, end_date__date__gte=date)
            )

        return queryset


class EventRetrieveAPIView(RetrieveAPIView):
    """Return a single event by primary key."""

    serializer_class = EventSerializer
    permission_classes = [AllowAny]
    queryset = Event.objects.filter(is_active=True)


class FavoriteListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        favorites = Favorite.objects.filter(user=request.user).select_related("event")
        serializer = FavoriteSerializer(favorites, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        event_id = request.data.get("event_id")
        if event_id is None:
            return Response(
                {"detail": "event_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        event = get_object_or_404(Event, pk=event_id)
        favorite, created = Favorite.objects.get_or_create(
            user=request.user, event=event
        )
        if not created:
            return Response(
                {"detail": "Event already in favorites."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = FavoriteSerializer(favorite)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FavoriteBulkCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        event_ids = request.data.get("event_ids", [])
        if not isinstance(event_ids, list):
            return Response(
                {"detail": "event_ids must be an array."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        migrated = 0
        skipped = 0

        for raw_id in event_ids:
            try:
                event_id = int(raw_id)
            except (TypeError, ValueError):
                skipped += 1
                continue

            event = Event.objects.filter(pk=event_id).first()
            if event is None:
                skipped += 1
                continue

            _, created = Favorite.objects.get_or_create(user=request.user, event=event)
            if created:
                migrated += 1
            else:
                skipped += 1

        return Response(
            {"migrated": migrated, "skipped": skipped},
            status=status.HTTP_201_CREATED,
        )


class FavoriteDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, event_id):
        deleted, _ = Favorite.objects.filter(
            user=request.user,
            event_id=event_id,
        ).delete()

        if not deleted:
            return Response(
                {"detail": "Favorite not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)

User = get_user_model()


class AdminEventListCreateAPIView(ListCreateAPIView):
    serializer_class = EventSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        queryset = Event.objects.all().order_by("-id")

        search = self.request.query_params.get("search", "").strip()
        category = _validate_category(self.request.query_params.get("category"))

        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) |
                Q(description__icontains=search) |
                Q(location__icontains=search)
            )

        if category:
            queryset = queryset.filter(category=category)

        return queryset


class AdminEventRetrieveUpdateDestroyAPIView(RetrieveUpdateDestroyAPIView):
    serializer_class = EventSerializer
    permission_classes = [IsAdminUser]
    queryset = Event.objects.all()


class AdminDashboardStatsAPIView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        total_events = Event.objects.count()
        total_users = User.objects.count()
        total_plans = DailyPlan.objects.count()

        return Response(
            {
                "total_events": total_events,
                "total_users": total_users,
                "total_plans": total_plans,
            },
            status=status.HTTP_200_OK,
        )
