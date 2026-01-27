from django.contrib import admin
from .models import DailyPlan

@admin.register(DailyPlan)
class DailyPlanAdmin(admin.ModelAdmin):
    list_display = ('user', 'date')
