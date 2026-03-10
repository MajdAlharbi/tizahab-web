from django.urls import path
from .views import generate_daily_plan

urlpatterns = [
    # Route for generating the daily plan
    path('generate/', generate_daily_plan, name='generate_daily_plan'),
]