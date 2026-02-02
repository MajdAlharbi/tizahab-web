from django.db import models
from django.conf import settings

User = settings.AUTH_USER_MODEL

class UserPreferences(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="preferences"
    )

    preferred_language = models.CharField(
        max_length=10,
        choices=[("ar", "Arabic"), ("en", "English")],
        default="ar"
    )

    budget = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )

    interests = models.JSONField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferences for {self.user}"
