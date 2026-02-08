from rest_framework import serializers
from .models import DailyPlan
from events.models import Event


class DailyPlanSerializer(serializers.ModelSerializer):
    events = serializers.PrimaryKeyRelatedField(
        queryset=Event.objects.all(),
        many=True,
        required=False
    )

    class Meta:
        model = DailyPlan
        fields = ['id', 'user', 'date', 'events', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']
