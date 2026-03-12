"""
DEPRECATED: This module is deprecated.

All functionality has been moved to daily_plan.views:
- Use GenerateDailyPlanAPIView from daily_plan.views instead
- Use DailyPlanListCreateAPIView from daily_plan.views instead
- Use DailyPlanRetrieveUpdateAPIView from daily_plan.views instead

This file is kept for reference only. All endpoints now point to daily_plan app.
"""

import warnings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated


class DeprecatedView(APIView):
    """Deprecated view that returns migration notice."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        warnings.warn(
            "The itinerary app views are deprecated. Please use daily_plan app instead.",
            DeprecationWarning,
            stacklevel=2
        )
        return Response(
            {
                "detail": "This endpoint is deprecated. Please use /api/daily-plan/ instead.",
                "migration_guide": "See daily_plan.views for updated endpoints"
            },
            status=status.HTTP_410_GONE
        )
    
    def post(self, request):
        return self.get(request)
