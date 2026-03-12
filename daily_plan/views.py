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
        return DailyPlan.objects.filter(user=self.request.user).select_related().prefetch_related('events')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DailyPlanRetrieveUpdateAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = DailyPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DailyPlan.objects.filter(user=self.request.user).prefetch_related('events')


class GenerateDailyPlanAPIView(APIView):
    """
    Generate a personalized daily plan based on user preferences.
    
    Request body:
        {
            "date": "2026-03-15"  # ISO format YYYY-MM-DD
        }
    
    Response:
        {
            "id": 123,
            "date": "2026-03-15",
            "events": [...]
        }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        date_str = request.data.get("date")

        # Validate date input
        if not date_str:
            return Response(
                {"detail": "Date is required. Format: YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate date format and value
        try:
            plan_date = date.fromisoformat(date_str)
            
            # Prevent booking in the past
            if plan_date < date.today():
                return Response(
                    {"detail": "Cannot create plans for past dates."},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except ValueError as e:
            logger.warning(f"Invalid date format from user {user.id}: {date_str}")
            return Response(
                {"detail": f"Invalid date format. Expected YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generate recommendations based on user preferences
        try:
            recommended_events = generate_recommendations(user, date_str)
        except ValueError as e:
            logger.warning(f"Recommendation generation error for user {user.id}: {e}")
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Unexpected error generating plan for user {user.id}: {e}", exc_info=True)
            return Response(
                {"detail": "Unexpected error while generating plan."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Check if events were found
        if not recommended_events:
            logger.info(f"No events found for user {user.id} with interests matching date {date_str}")
            return Response(
                {"detail": "No recommendations found for your interests and budget on this date."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Create or get existing daily plan
        try:
            daily_plan, created = DailyPlan.objects.get_or_create(
                user=user,
                date=plan_date
            )

            daily_plan.events.set(recommended_events)
            
            action = "created" if created else "updated"
            logger.info(f"Daily plan {action} for user {user.id} on {plan_date}")

            events_data = EventSerializer(recommended_events, many=True).data

            return Response(
                {
                    "id": daily_plan.id,
                    "date": date_str,
                    "events": events_data,
                    "count": len(events_data),
                },
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
            )
            
        except Exception as e:
            logger.error(f"Error saving daily plan for user {user.id}: {e}", exc_info=True)
            return Response(
                {"detail": "Error saving daily plan."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )