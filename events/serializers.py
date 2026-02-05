from rest_framework import serializers
from .models import Event


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = [
            "id",
            "title",
            "category",
            "location",
            "price",
            "start_date",
            "end_date",
            "external_booking_url",
        ]
