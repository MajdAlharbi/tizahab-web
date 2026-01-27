from django.contrib import admin
from .models import Event

@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'price', 'start_date', 'end_date')
    search_fields = ('title', 'category')
