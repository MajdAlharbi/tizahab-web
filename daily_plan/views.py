from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone

from .models import DailyPlan
from .serializers import DailyPlanSerializer
from .services import generate_recommendations
from events.serializers import EventSerializer

class DailyPlanListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = DailyPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DailyPlan.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DailyPlanRetrieveUpdateAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = DailyPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DailyPlan.objects.filter(user=self.request.user)


class GenerateDailyPlanAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        date_str = request.data.get("date")
        if not date_str:
            return Response(
                {"detail": "Date is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        recommended_events = generate_recommendations(user, date_str)

        if not recommended_events:
            return Response(
                {"detail": "No recommendations found."},
                status=status.HTTP_404_NOT_FOUND
            )

        daily_plan = DailyPlan.objects.create(
            user=user,
            date=date_str
        )

        daily_plan.events.set(recommended_events)

        events_data = EventSerializer(recommended_events, many=True).data

        return Response(
            {
                "id": daily_plan.id,
                "date": date_str,
                "events": events_data,
            },
            status=status.HTTP_201_CREATED
        )