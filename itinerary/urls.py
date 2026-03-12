"""
DEPRECATED: Use daily_plan.urls instead.

This file is kept for backward compatibility but all URLs should use /daily_plan/ endpoints.
"""

from django.urls import path, include

# Redirect to daily_plan instead
urlpatterns = [
    # Forward all requests to daily_plan.urls
    path('', include('daily_plan.urls')),
]
