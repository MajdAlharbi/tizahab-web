from datetime import date

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import DailyPlan
from .serializers import DailyPlanSerializer
from .services import generate_recommendations
from events.serializers import EventSerializer
import logging

logger = logging.getLogger(__name__)


class DailyPlanListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = DailyPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            DailyPlan.objects.filter(user=self.request.user)
            .select_related("user")
            .prefetch_related("events")
            .order_by("-date")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DailyPlanRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DailyPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DailyPlan.objects.filter(user=self.request.user).prefetch_related(
            "events"
        )


class GenerateDailyPlanAPIView(APIView):
    """
    Generate a personalized daily plan based on user preferences.

    Request body:
        { "date": "2026-03-15" }

    Response:
        { "id": 1, "date": "2026-03-15", "events": [...], "count": 3 }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        date_str = request.data.get("date")

        if not date_str:
            return Response(
                {"detail": "Date is required. Format: YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            plan_date = date.fromisoformat(date_str)
            if plan_date < date.today():
                return Response(
                    {"detail": "Cannot create plans for past dates."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except ValueError:
            logger.warning("Invalid date format from user %s: %s", user.id, date_str)
            return Response(
                {"detail": "Invalid date format. Expected YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            recommended_events = generate_recommendations(user, date_str)
        except Exception as e:
            logger.error(
                "Unexpected error generating plan for user %s: %s",
                user.id,
                e,
                exc_info=True,
            )
            return Response(
                {"detail": "Unexpected error while generating plan."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if recommended_events is None:
            return Response(
                {
                    "detail": "Please set your interests in preferences before generating a plan."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not recommended_events:
            return Response(
                {"detail": "No recommendations found for your interests and budget."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            daily_plan, created = DailyPlan.objects.get_or_create(
                user=user,
                date=plan_date,
            )
            daily_plan.events.set(recommended_events)

            action = "created" if created else "updated"
            logger.info("Daily plan %s for user %s on %s", action, user.id, plan_date)

            events_data = EventSerializer(recommended_events, many=True).data
            return Response(
                {
                    "id": daily_plan.id,
                    "date": date_str,
                    "events": events_data,
                    "count": len(events_data),
                },
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )
        except Exception as e:
            logger.error(
                "Error saving daily plan for user %s: %s", user.id, e, exc_info=True
            )
            return Response(
                {"detail": "Error saving daily plan."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
