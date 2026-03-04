from datetime import date

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response

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

        try:
            plan_date = date.fromisoformat(date_str)
            recommended_events = generate_recommendations(user, date_str)

        except ValueError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

        except Exception:
            return Response(
                {"detail": "Unexpected error while generating plan."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        if not recommended_events:
            return Response(
                {"detail": "No recommendations found."},
                status=status.HTTP_404_NOT_FOUND
            )

        daily_plan, created = DailyPlan.objects.get_or_create(
            user=user,
            date=plan_date
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