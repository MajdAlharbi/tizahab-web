from django.db import models
from django.contrib.auth import get_user_model
from events.models import Event

User = get_user_model()


class DailyPlan(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='daily_plans'
    )
    date = models.DateField()
    events = models.ManyToManyField(
        Event,
        related_name='daily_plans',
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} - {self.date}"
