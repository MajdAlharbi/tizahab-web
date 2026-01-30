from rest_framework import serializers
from .models import UserPreference


class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = ['budget', 'interests', 'age_group', 'language']
