from django.contrib import admin
from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "category",
        "is_active",
        "tourism_relevance",
        "start_date",
        "end_date",
        "location",
        "source",
    )
    list_filter = ("category", "is_active", "tourism_relevance")
    search_fields = ("title", "description", "location", "source")
