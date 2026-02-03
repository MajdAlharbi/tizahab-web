from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class UserPreferences(models.Model):
    LANGUAGE_CHOICES = [
        ("ar", "Arabic"),
        ("en", "English"),
    ]

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="preferences"
    )

    preferred_language = models.CharField(
        max_length=2,
        choices=LANGUAGE_CHOICES,
        default="ar"
    )

    budget_min = models.PositiveIntegerField(
        null=True,
        blank=True
    )

    budget_max = models.PositiveIntegerField(
        null=True,
        blank=True
    )

    interests = models.JSONField(
        default=list,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferences for {self.user}"
