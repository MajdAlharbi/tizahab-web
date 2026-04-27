from django.db import models
from django.contrib.auth import get_user_model
from events.models import Event

User = get_user_model()


class DailyPlan(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="daily_plans")
    date = models.DateField()
    events = models.ManyToManyField(Event, related_name="daily_plans", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["user", "date"]]

    def __str__(self):
        return f"{self.user} - {self.date}"


class DailyPlanItem(models.Model):
    SLOT_CHOICES = [
        ("breakfast", "Breakfast"),
        ("activity", "Activity"),
        ("lunch", "Lunch"),
        ("evening", "Evening"),
    ]

    SOURCE_CHOICES = [
        ("generated", "Generated"),
        ("manual", "Manual"),
        ("replacement", "Replacement"),
    ]

    plan = models.ForeignKey(
        DailyPlan,
        related_name="items",
        on_delete=models.CASCADE,
    )
    event = models.ForeignKey(Event, on_delete=models.CASCADE)
    slot_type = models.CharField(max_length=20, choices=SLOT_CHOICES)
    order = models.PositiveIntegerField(default=0)
    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default="generated",
    )
    locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["plan", "event"],
                name="unique_event_per_daily_plan_item",
            )
        ]

    def __str__(self):
        return f"{self.plan_id}:{self.slot_type}:{self.event_id}"
