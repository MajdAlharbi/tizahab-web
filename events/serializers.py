from rest_framework import serializers
from .models import Event


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = [
            "id",
            "title",
            "category",
            "description",
            "date",
            "start_date",
            "end_date",
            "location",
            "price",
            "price_range",
            "latitude",
            "longitude",
        ]