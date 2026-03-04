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
            "location",
            "price_range",
            "latitude",
            "longitude",
        ]