from django.db import models

class Event(models.Model):
    CATEGORY_CHOICES = [
        ('food', 'Food'),
        ('culture', 'Culture'),
        ('outdoor', 'Outdoor'),
        ('shopping', 'Shopping'),
        ('other', 'Other'),
    ]

    title = models.CharField(max_length=255)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    description = models.TextField()
    date = models.DateTimeField()
    location = models.CharField(max_length=255)
    price_range = models.CharField(max_length=100)

    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    def __str__(self):
        return self.title
