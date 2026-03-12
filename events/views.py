from datetime import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.generics import ListAPIView
from django.shortcuts import render
from django.db.models import Q
from .models import Event
from .serializers import EventSerializer


# Events list page
def events_list(request):
    return render(request, "events_list.html")


# Event details page
def event_details(request, event_id):
    return render(request, "event_details.html", {
        "event_id": event_id
    })


def _parse_date(value):
    """Parse ISO date string safely."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except (ValueError, TypeError):
        return None


class FilteredEventsAPIView(APIView):
    """
    Filter events by user interests and date range.
    Replaces manual list iteration with efficient ORM queries.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prefs = getattr(request.user, "preferences", None)
        
        # Start with all events
        queryset = Event.objects.all()

        # Filter by interests if user has preferences
        if prefs and prefs.interests:
            interests = [str(x).strip().lower() for x in prefs.interests if str(x).strip()]
            if interests:
                queryset = queryset.filter(category__in=interests)

        # Parse and filter by date range (ORM-based, not Python loops)
        date_from = _parse_date(request.query_params.get("date_from"))
        date_to = _parse_date(request.query_params.get("date_to"))

        if date_from or date_to:
            # Use Q objects for complex OR logic
            date_query = Q()
            
            if date_from and date_to:
                # Events that overlap with date range
                date_query = (
                    Q(start_date__date__lte=date_to) & Q(end_date__date__gte=date_from)
                ) | (
                    Q(start_date__isnull=True) & Q(end_date__isnull=True) & 
                    Q(date__date__gte=date_from) & Q(date__date__lte=date_to)
                )
            elif date_from:
                date_query = (
                    Q(end_date__date__gte=date_from)
                ) | (
                    Q(start_date__isnull=True) & Q(date__date__gte=date_from)
                )
            elif date_to:
                date_query = (
                    Q(start_date__date__lte=date_to)
                ) | (
                    Q(end_date__isnull=True) & Q(date__date__lte=date_to)
                )
            
            queryset = queryset.filter(date_query)

        # Apply budget filtering if user has budget constraints
        if prefs and prefs.budget_max:
            queryset = queryset.filter(price__lte=prefs.budget_max)
        if prefs and prefs.budget_min:
            queryset = queryset.filter(price__gte=prefs.budget_min)

        serializer = EventSerializer(queryset, many=True)
        return Response(serializer.data)


class EventListAPIView(ListAPIView):
    """
    List all events with filtering by category and date.
    """
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Event.objects.all()

        category = self.request.query_params.get('category')
        date = self.request.query_params.get('date')

        if category:
            queryset = queryset.filter(category=category)

        if date:
            parsed_date = _parse_date(date)
            if parsed_date:
                queryset = queryset.filter(date__date=parsed_date)

        return queryset
