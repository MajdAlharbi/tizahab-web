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
        validated = super().to_internal_value(data)
        events_data = data.get("events", None)

        if events_data is None:
            return validated

        events_field = serializers.PrimaryKeyRelatedField(
            queryset=Event.objects.all(),
            many=True,
            required=False,
        )
        validated["events"] = events_field.to_internal_value(events_data)
        return validated
