from django.db import models
from django.core.validators import MinValueValidator

class Event(models.Model):
    CATEGORY_CHOICES = [
        ('food', 'Food'),
        ('culture', 'Culture'),
        ('outdoor', 'Outdoor'),
        ('shopping', 'Shopping'),
        ('other', 'Other'),
    ]

    title = models.CharField(max_length=255, db_index=True)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, db_index=True)
    description = models.TextField()
    date = models.DateTimeField(db_index=True)
    start_date = models.DateTimeField(null=True, blank=True, db_index=True)
    end_date = models.DateTimeField(null=True, blank=True)
    location = models.CharField(max_length=255)
    price_range = models.CharField(max_length=100, null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])

    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        indexes = [
            models.Index(fields=['category', 'date']),
            models.Index(fields=['user_id', 'date']) if hasattr(models, 'user_id') else None,
        ]

    def __str__(self):
        return self.title
