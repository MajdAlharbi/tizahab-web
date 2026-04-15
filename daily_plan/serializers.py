from rest_framework import serializers
from .models import DailyPlan
from events.models import Event
from events.serializers import EventSerializer


class DailyPlanSerializer(serializers.ModelSerializer):
    # Read full event objects while still accepting event IDs in request payloads.
    events = EventSerializer(many=True, read_only=True)

    class Meta:
        model = DailyPlan
        fields = ["id", "date", "events", "created_at"]
        read_only_fields = ["id", "created_at"]

    def to_internal_value(self, data):
        events_data = data.get("events")

        data_copy = data.copy()
        data_copy.pop("events", None)

        validated = super().to_internal_value(data_copy)

        if events_data and isinstance(events_data, list):
            validated["events"] = Event.objects.filter(id__in=events_data)

        return validated

    def create(self, validated_data):
        events = validated_data.pop("events", [])
        instance = super().create(validated_data)
        if events:
            instance.events.set(events)
        return instance

    def update(self, instance, validated_data):
        events = validated_data.pop("events", None)
        instance = super().update(instance, validated_data)
        if events is not None:
            instance.events.set(events)
        return instance
