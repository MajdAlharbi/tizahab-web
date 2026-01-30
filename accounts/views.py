from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from .models import UserPreference
from .serializers import UserPreferenceSerializer


class UserPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preference, created = UserPreference.objects.get_or_create(
            user=request.user
        )
        serializer = UserPreferenceSerializer(preference)
        return Response(serializer.data)

    def post(self, request):
        preference, created = UserPreference.objects.get_or_create(
            user=request.user
        )
        serializer = UserPreferenceSerializer(
            preference, data=request.data
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request):
        preference = UserPreference.objects.get(user=request.user)
        serializer = UserPreferenceSerializer(
            preference, data=request.data
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

