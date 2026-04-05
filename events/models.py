from django.db import models
from django.core.validators import MinValueValidator
from django.contrib.auth import get_user_model


User = get_user_model()


class Event(models.Model):
    CATEGORY_CHOICES = [
        ("restaurant", "Restaurants"),
        ("cafe", "Cafes & Coffee"),
        ("fast_food", "Fast Food"),
        ("dessert", "Desserts & Sweets"),
        ("bakery", "Bakery"),
        ("juice", "Juice & Smoothies"),
        ("food_truck", "Food Trucks"),
        ("culture", "Culture"),
        ("outdoor", "Outdoor"),
        ("shopping", "Shopping"),
        ("other", "Other"),
    ]

    title = models.CharField(max_length=255, db_index=True)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, db_index=True)
    description = models.TextField()
    date = models.DateTimeField(db_index=True)
    start_date = models.DateTimeField(null=True, blank=True, db_index=True)
    end_date = models.DateTimeField(null=True, blank=True)
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

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["category", "date"]),
        ]

    def __str__(self):
        return self.title


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
