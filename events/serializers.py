from rest_framework import serializers
from .models import Event, Favorite


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


class FavoriteSerializer(serializers.ModelSerializer):
    event = EventSerializer(read_only=True)

    class Meta:
        model = Favorite
        fields = ["id", "event", "created_at"]
