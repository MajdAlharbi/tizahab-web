from datetime import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

# Create your views here.
from django.shortcuts import render

# Events list page
def events_list(request):
    return render(request, "events_list.html")


# Event details page
def event_details(request, event_id):
    return render(request, "event_details.html", {
        "event_id": event_id
    })
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from .models import Event
from .serializers import EventSerializer


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        return None


class FilteredEventsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prefs = getattr(request.user, "preferences", None)
        interests = []
        if prefs and prefs.interests:
            interests = [str(x).strip().lower() for x in prefs.interests if str(x).strip()]

        qs = Event.objects.all()

        if interests:
            filtered = []
            for ev in qs:
                if (ev.category or "").strip().lower() in interests:
                    filtered.append(ev)
            qs = filtered

        date_from = _parse_date(request.query_params.get("date_from"))
        date_to = _parse_date(request.query_params.get("date_to"))

        if date_from or date_to:
            if not isinstance(qs, list):
                qs = list(qs)

            date_filtered = []
            for ev in qs:
                ev_start = ev.start_date
                ev_end = ev.end_date

                if date_from and ev_end and ev_end < date_from:
                    continue
                if date_to and ev_start and ev_start > date_to:
                    continue

                date_filtered.append(ev)

            qs = date_filtered

        serializer = EventSerializer(qs, many=True)
        return Response(serializer.data)
class EventListAPIView(ListAPIView):
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Event.objects.all()

        category = self.request.query_params.get('category')
        date = self.request.query_params.get('date')

        if category:
            queryset = queryset.filter(category=category)

        if date:
            queryset = queryset.filter(date__date=date)

        return queryset
