from datetime import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.generics import ListAPIView, RetrieveAPIView
from django.shortcuts import render
from django.db.models import Q
from django.conf import settings
from .models import Event
from .serializers import EventSerializer


def events_list(request):
    return render(request, "events_list.html")


def event_details(request, event_id):
    return render(request, "event_details.html", {"event_id": event_id})


def _parse_date(value):
    """Parse ISO date string safely. Returns None on invalid input."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except (ValueError, TypeError):
        return None


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
        date_query = (
            Q(end_date__date__gte=date_from)
        ) | (
            Q(end_date__isnull=True) & Q(date__date__gte=date_from)
        )
    elif date_to:
        date_query = (
            Q(start_date__date__lte=date_to)
        ) | (
            Q(start_date__isnull=True) & Q(date__date__lte=date_to)
        )

    return queryset.filter(date_query)


class FilteredEventsAPIView(APIView):
    """
    Filter events by user interests, budget, and date range.
    Query params: date_from, date_to (YYYY-MM-DD)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prefs = getattr(request.user, "preferences", None)
        queryset = Event.objects.all()

        if prefs and prefs.interests:
            interests = [str(x).strip().lower() for x in prefs.interests if str(x).strip()]
            if interests:
                queryset = queryset.filter(category__in=interests)

        date_from_raw = request.query_params.get("date_from")
        date_to_raw = request.query_params.get("date_to")

        if date_from_raw and _parse_date(date_from_raw) is None:
            return Response({"detail": "Invalid date_from format. Use YYYY-MM-DD."}, status=400)
        if date_to_raw and _parse_date(date_to_raw) is None:
            return Response({"detail": "Invalid date_to format. Use YYYY-MM-DD."}, status=400)

        date_from = _parse_date(date_from_raw)
        date_to = _parse_date(date_to_raw)
        queryset = _apply_date_range_filter(queryset, date_from, date_to)

        if prefs and prefs.budget_max is not None:
            queryset = queryset.filter(
                Q(price__lte=prefs.budget_max) | Q(price__isnull=True)
            )
        if prefs and prefs.budget_min is not None:
            queryset = queryset.filter(
                Q(price__gte=prefs.budget_min) | Q(price__isnull=True)
            )

        limit = getattr(settings, "MAX_EVENTS_PER_RESPONSE", 100)
        serializer = EventSerializer(queryset[:limit], many=True)
        return Response(serializer.data)


class EventListAPIView(ListAPIView):
    """
    List events with optional filtering.
    Query params: category, date (YYYY-MM-DD), search
    """
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Event.objects.all()

        category = self.request.query_params.get("category")
        date_raw = self.request.query_params.get("date")
        search = self.request.query_params.get("search", "").strip()

        if category:
            queryset = queryset.filter(category=category)

        if date_raw:
            parsed_date = _parse_date(date_raw)
            if parsed_date:
                queryset = _apply_date_range_filter(queryset, parsed_date, parsed_date)

        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(location__icontains=search)
            )

        limit = getattr(settings, "MAX_EVENTS_PER_RESPONSE", 100)
        return queryset[:limit]


class EventRetrieveAPIView(RetrieveAPIView):
    """Return a single event by primary key."""
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]
    queryset = Event.objects.all()
