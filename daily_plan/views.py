from datetime import date

from django.db import IntegrityError, transaction
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


def _parse_iso_date(value, field_name):
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {field_name} format. Expected YYYY-MM-DD") from exc


def _parse_trip_duration(raw_value):
    if raw_value is None or raw_value == "":
        return None
    try:
        trip_duration = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise ValueError("trip_duration must be an integer between 1 and 30.") from exc
    if trip_duration < 1 or trip_duration > 30:
        raise ValueError("trip_duration must be an integer between 1 and 30.")
    return trip_duration


def _resolve_date_range(start_date_str=None, end_date_str=None, trip_duration=None):
    if not start_date_str:
        raise ValueError("start_date is required. Format: YYYY-MM-DD")

    start_date = _parse_iso_date(start_date_str, "start_date")
    end_date = (
        _parse_iso_date(end_date_str, "end_date")
        if end_date_str not in (None, "")
        else None
    )

    if start_date < date.today():
        raise ValueError("Cannot create plans for past dates.")
    if end_date and end_date < start_date:
        raise ValueError("end_date must be on or after start_date.")

    resolved_trip_duration = _parse_trip_duration(trip_duration)
    if end_date:
        derived_duration = (end_date - start_date).days + 1
        if resolved_trip_duration is not None and resolved_trip_duration != derived_duration:
            raise ValueError(
                "trip_duration must match the provided start_date and end_date range."
            )
        resolved_trip_duration = derived_duration

    return start_date, end_date, resolved_trip_duration


def _parse_exclude_plan_dates(raw_value):
    if raw_value is None:
        return []
    if not isinstance(raw_value, list):
        raise ValueError("exclude_plan_dates must be a list of YYYY-MM-DD dates.")

    parsed_dates = []
    for day_str in raw_value:
        try:
            parsed_dates.append(_parse_iso_date(day_str, "exclude_plan_dates"))
        except ValueError as exc:
            raise ValueError(
                "exclude_plan_dates must only contain YYYY-MM-DD dates."
            ) from exc
    return parsed_dates


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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        plan_date = serializer.validated_data.get("date")
        if DailyPlan.objects.filter(user=request.user, date=plan_date).exists():
            return Response(
                {"date": "Plan already exists for this date"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            self.perform_create(serializer)
        except IntegrityError:
            return Response(
                {"date": "Plan already exists for this date"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )


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
            plan_date = _parse_iso_date(date_str, "date")
            if plan_date < date.today():
                return Response(
                    {"detail": "Cannot create plans for past dates."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            valid_exclude_dates = _parse_exclude_plan_dates(exclude_plan_dates)
        except ValueError as exc:
            logger.warning("Invalid date format from user %s: %s", user.id, date_str)
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exclude_ids = set()
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
        start_date_str = request.data.get("start_date") or request.data.get("date_from")
        end_date_str = request.data.get("end_date") or request.data.get("date_to")
        trip_duration = request.data.get("trip_duration")

        if not start_date_str:
            return Response(
                {"detail": "start_date is required. Format: YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            start_date, end_date, trip_duration = _resolve_date_range(
                start_date_str=start_date_str,
                end_date_str=end_date_str,
                trip_duration=trip_duration,
            )
        except ValueError as exc:
            logger.warning(
                "Invalid multi-day input from user %s: start_date=%s end_date=%s trip_duration=%s",
                user.id,
                start_date_str,
                end_date_str,
                request.data.get("trip_duration"),
            )
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            generated_days = generate_multiday_plan(
                user,
                start_date_str,
                trip_duration=trip_duration,
                end_date_str=end_date_str,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
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
            generated_dates = [
                date.fromisoformat(day_date_str) for day_date_str, _ in generated_days
            ]

            with transaction.atomic():
                existing_qs = DailyPlan.objects.filter(
                    user=user,
                    date__in=generated_dates,
                )
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
                    "end_date": generated_days[-1][0] if generated_days else start_date_str,
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
