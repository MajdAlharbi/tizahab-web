from django.db import models
from django.contrib.auth.models import User

class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    budget = models.CharField(max_length=50)
    interests = models.TextField()
    age_group = models.CharField(max_length=50)
    language = models.CharField(max_length=10, default='ar')

    def __str__(self):
        return self.user.username
