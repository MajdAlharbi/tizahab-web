from django.db import models
from django.core.validators import MaxValueValidator, MinValueValidator
from django.contrib.auth import get_user_model
from django.utils import timezone

from .categories import TOURISM_CATEGORY_CHOICES, TOURISM_CATEGORY_VALUES, normalize_category


User = get_user_model()


class Event(models.Model):
    CATEGORY_CHOICES = TOURISM_CATEGORY_CHOICES
    CATEGORY_VALUES = TOURISM_CATEGORY_VALUES
    CATEGORY_MAP = {
        "fast_food": "food",
        "restaurant": "food",
        "dessert": "food",
        "juice": "food",
        "bakery": "food",
        "shopping": "shopping",
        "other": "other",
    }

    title = models.CharField(max_length=255, db_index=True)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, db_index=True)
    description = models.TextField()
    date = models.DateTimeField(db_index=True)
    start_date = models.DateTimeField(null=True, blank=True, db_index=True)
    end_date = models.DateTimeField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    location = models.CharField(max_length=255)
    price_range = models.CharField(max_length=100, null=True, blank=True)
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )

    rating = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    source = models.CharField(max_length=255, blank=True, default="")
    source_url = models.URLField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    tourism_relevance = models.PositiveSmallIntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Simple tourism relevance score from 1 to 5.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["category", "date"]),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.category = normalize_category(
            self.category,
            title=self.title,
            description=self.description,
        )
        super().save(*args, **kwargs)

    @property
    def primary_date(self):
        return timezone.localtime(self.start_date).date() if self.start_date else timezone.localtime(self.date).date()

    def availability_window(self):
        start = timezone.localtime(self.start_date).date() if self.start_date else timezone.localtime(self.date).date()
        end = timezone.localtime(self.end_date).date() if self.end_date else start
        return start, end

    def occurs_on(self, target_date):
        if not self.is_active:
            return False
        if not self.start_date and not self.end_date and self.category != "events":
            return True
        start, end = self.availability_window()
        return start <= target_date <= end

    def is_available_on(self, target_date):
        return self.occurs_on(target_date)


class Favorite(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="favorites")
    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="favorited_by"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["user", "event"]]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_id}:{self.event_id}"
