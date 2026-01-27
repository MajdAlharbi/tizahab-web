from django.db import models
from django.contrib.auth.models import User
from events.models import Event

class DailyPlan(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateField()
    events = models.ManyToManyField(Event)

    def __str__(self):
        return f"{self.user.username} - {self.date}"
