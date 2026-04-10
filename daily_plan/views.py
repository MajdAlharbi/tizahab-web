from datetime import date

from django.db import transaction
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import DailyPlan
from .serializers import DailyPlanSerializer
from .services import generate_multiday_plan, generate_recommendations
from events.serializers import EventSerializer
import logging

logger = logging.getLogger(__name__)


class DailyPlanListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = DailyPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            DailyPlan.objects.filter(user=self.request.user)
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
        seed = request.data.get("seed")
        exclude_plan_dates = request.data.get("exclude_plan_dates")

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

        exclude_ids = set()
        if isinstance(exclude_plan_dates, list) and exclude_plan_dates:
            valid_exclude_dates = []
            for day_str in exclude_plan_dates:
                try:
                    valid_exclude_dates.append(date.fromisoformat(str(day_str)))
                except (TypeError, ValueError):
                    continue

            if valid_exclude_dates:
                sibling_plans = DailyPlan.objects.filter(
                    user=user,
                    date__in=valid_exclude_dates,
                ).prefetch_related("events")
                for plan in sibling_plans:
                    exclude_ids.update(plan.events.values_list("id", flat=True))

        try:
            recommended_events = generate_recommendations(
                user,
                date_str,
                seed=seed,
                exclude_ids=exclude_ids,
            )
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


class GenerateMultiDayPlanAPIView(APIView):
    """Generate and persist a full multi-day itinerary in one request."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        start_date_str = request.data.get("start_date")

        if not start_date_str:
            return Response(
                {"detail": "start_date is required. Format: YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            start_date = date.fromisoformat(start_date_str)
            if start_date < date.today():
                return Response(
                    {"detail": "Cannot create plans for past dates."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except ValueError:
            logger.warning(
                "Invalid start_date format from user %s: %s", user.id, start_date_str
            )
            return Response(
                {"detail": "Invalid date format. Expected YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            generated_days = generate_multiday_plan(user, start_date_str)
        except Exception as e:
            logger.error(
                "Unexpected error generating multi-day plan for user %s: %s",
                user.id,
                e,
                exc_info=True,
            )
            return Response(
                {"detail": "Unexpected error while generating plan."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if generated_days is None:
            return Response(
                {
                    "detail": "Please set your interests in preferences before generating a plan."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_events = sum(len(events or []) for _, events in generated_days)
        if total_events == 0:
            return Response(
                {"detail": "No recommendations found for your interests and budget."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            with transaction.atomic():
                existing_qs = DailyPlan.objects.filter(user=user, date__gte=start_date)
                had_existing = existing_qs.exists()
                existing_qs.delete()

                plans_payload = []
                for day_date_str, events in generated_days:
                    day_date = date.fromisoformat(day_date_str)
                    daily_plan = DailyPlan.objects.create(user=user, date=day_date)
                    daily_plan.events.set(events)

                    events_data = EventSerializer(events, many=True).data
                    plans_payload.append(
                        {
                            "id": daily_plan.id,
                            "date": day_date_str,
                            "events": events_data,
                            "count": len(events_data),
                        }
                    )

            return Response(
                {
                    "trip_duration": len(generated_days),
                    "start_date": start_date_str,
                    "plans": plans_payload,
                    "total_events": total_events,
                },
                status=status.HTTP_200_OK if had_existing else status.HTTP_201_CREATED,
            )
        except Exception as e:
            logger.error(
                "Error saving multi-day plan for user %s: %s", user.id, e, exc_info=True
            )
            return Response(
                {"detail": "Error saving daily plan."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
