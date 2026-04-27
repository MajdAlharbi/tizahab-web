from rest_framework import serializers
from datetime import date

from .models import DailyPlan, DailyPlanItem
from events.models import Event
from events.serializers import EventSerializer
from .services import build_plan_items_from_ordered_events


def _ordered_items_queryset(plan):
    return plan.items.select_related("event").order_by("order", "id")


def _ordered_events_from_legacy_m2m(plan):
    through_model = plan.events.through
    ordered_event_ids = list(
        through_model.objects
        .filter(dailyplan_id=plan.id)
        .order_by("id")
        .values_list("event_id", flat=True)
    )
    if not ordered_event_ids:
        return []

    events_by_id = Event.objects.in_bulk(ordered_event_ids)
    return [
        events_by_id[event_id]
        for event_id in ordered_event_ids
        if event_id in events_by_id
    ]


class DailyPlanItemSerializer(serializers.ModelSerializer):
    event = EventSerializer(read_only=True)
    event_id = serializers.PrimaryKeyRelatedField(
        source="event",
        queryset=Event.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = DailyPlanItem
        fields = [
            "id",
            "event",
            "event_id",
            "slot_type",
            "order",
            "source",
            "locked",
        ]
        read_only_fields = ["id"]


class DailyPlanSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()
    events = serializers.SerializerMethodField()

    class Meta:
        model = DailyPlan
        fields = ["id", "date", "items", "events", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_date(self, value):
        if value < date.today():
            raise serializers.ValidationError("Cannot create plans for past dates.")
        return value

    def validate_events(self, events, plan_date):
        if not plan_date:
            return events
        for event in events:
            if not event.is_available_on(plan_date):
                raise serializers.ValidationError(
                    f"Event {event.id} is not available on {plan_date}"
                )
        return events

    def get_events(self, obj):
        ordered_items = list(_ordered_items_queryset(obj))
        if ordered_items:
            return EventSerializer(
                [item.event for item in ordered_items],
                many=True,
            ).data
        return EventSerializer(_ordered_events_from_legacy_m2m(obj), many=True).data

    def get_items(self, obj):
        ordered_items = list(_ordered_items_queryset(obj))
        if ordered_items:
            return DailyPlanItemSerializer(ordered_items, many=True).data

        synthesized_items = []
        for item in build_plan_items_from_ordered_events(_ordered_events_from_legacy_m2m(obj)):
            synthesized_items.append(
                {
                    "id": None,
                    "slot_type": item["slot_type"],
                    "order": item["order"],
                    "source": item["source"],
                    "locked": item["locked"],
                    "event": EventSerializer(item["event"]).data,
                }
            )
        return synthesized_items

    def to_internal_value(self, data):
        events_data = data.get("events")

        data_copy = data.copy()
        data_copy.pop("events", None)

        validated = super().to_internal_value(data_copy)

        if isinstance(events_data, list):
            ordered_ids = [int(event_id) for event_id in events_data]
            events_by_id = Event.objects.in_bulk(ordered_ids)
            validated["events"] = [
                events_by_id[event_id]
                for event_id in ordered_ids
                if event_id in events_by_id
            ]

        return validated

    def validate(self, attrs):
        attrs = super().validate(attrs)
        events = attrs.get("events")
        if events is None:
            return attrs

        plan_date = attrs.get(
            "date",
            getattr(self.instance, "date", None),
        )
        if plan_date is None:
            raw_date = self.initial_data.get("date") if hasattr(self, "initial_data") else None
            if raw_date:
                try:
                    plan_date = date.fromisoformat(str(raw_date))
                except (TypeError, ValueError):
                    plan_date = None

        attrs["events"] = self.validate_events(events, plan_date)
        return attrs

    def _sync_items_from_events(self, instance, events):
        instance.items.all().delete()
        item_specs = build_plan_items_from_ordered_events(events)
        if item_specs:
            DailyPlanItem.objects.bulk_create(
                [
                    DailyPlanItem(
                        plan=instance,
                        event=spec["event"],
                        slot_type=spec["slot_type"],
                        order=spec["order"],
                        source=spec["source"],
                        locked=spec["locked"],
                    )
                    for spec in item_specs
                ]
            )
        instance.events.set([spec["event"] for spec in item_specs])

    def create(self, validated_data):
        events = validated_data.pop("events", [])
        instance = super().create(validated_data)
        self._sync_items_from_events(instance, list(events))
        return instance

    def update(self, instance, validated_data):
        events = validated_data.pop("events", None)
        instance = super().update(instance, validated_data)
        if events is not None:
            self._sync_items_from_events(instance, list(events))
        return instance
