from django.db import models

class Event(models.Model):
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=100)
    location = models.CharField(max_length=200)
    price = models.DecimalField(max_digits=8, decimal_places=2)
    start_date = models.DateField()
    end_date = models.DateField()
    external_booking_url = models.URLField()

    def __str__(self):
        return self.title
