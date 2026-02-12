from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import DailyPlan
from .serializers import DailyPlanSerializer


class DailyPlanListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = DailyPlanSerializer
    permission_classes = [IsAuthenticated]
    

    def get_queryset(self):
        return DailyPlan.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
        
    def list(self, request, *args, **kwargs):
        print("DEBUG USER:", request.user)
        print("DEBUG AUTH:", request.auth)
        return super().list(request, *args, **kwargs)    


class DailyPlanRetrieveUpdateAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = DailyPlanSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DailyPlan.objects.filter(user=self.request.user)

