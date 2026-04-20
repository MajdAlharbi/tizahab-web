from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework_simplejwt.tokens import RefreshToken
from .models import UserPreferences
from events.models import Event


class UserPreferencesSerializer(serializers.ModelSerializer):
    """
    Serializer for user preferences including language, budget, and interests.

    Validates:
    - budget_min <= budget_max
    - interests are valid event categories
    - budget values are non-negative
    """

    VALID_INTERESTS = Event.CATEGORY_VALUES

    class Meta:
        model = UserPreferences
        fields = [
            "preferred_language",
            "budget_min",
            "budget_max",
            "interests",
            "min_rating",
            "trip_duration",
        ]

    def validate_trip_duration(self, value):
        """Require trip_duration to stay within the supported range."""
        if value is None:
            return 1
        if value < 1 or value > 30:
            raise serializers.ValidationError(
                "trip_duration must be between 1 and 30."
            )
        return value

    def validate_interests(self, value):
        """Validate that interests only contain valid event categories."""
        if not isinstance(value, list):
            raise serializers.ValidationError("Interests must be a list.")

        normalized_interests = [str(i).strip().lower() for i in value if str(i).strip()]
        invalid_interests = [
            i for i in normalized_interests if i not in self.VALID_INTERESTS
        ]
        if invalid_interests:
            raise serializers.ValidationError(
                f"Invalid interests: {invalid_interests}. Valid options: {self.VALID_INTERESTS}"
            )

        return normalized_interests

    def validate_budget_min(self, value):
        """Validate budget_min is non-negative."""
        if value is not None and value < 0:
            raise serializers.ValidationError("Budget minimum cannot be negative.")
        return value

    def validate_budget_max(self, value):
        """Validate budget_max is non-negative."""
        if value is not None and value < 0:
            raise serializers.ValidationError("Budget maximum cannot be negative.")
        return value

    def validate(self, attrs):
        """Validate that budget_min <= budget_max, including against existing instance values."""
        instance = self.instance
        min_b = attrs.get(
            "budget_min", getattr(instance, "budget_min", None) if instance else None
        )
        max_b = attrs.get(
            "budget_max", getattr(instance, "budget_max", None) if instance else None
        )

        if min_b is not None and max_b is not None and min_b > max_b:
            raise serializers.ValidationError(
                "budget_min cannot be greater than budget_max"
            )

        return attrs


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ("email", "password", "password2")

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError("Passwords do not match.")
        return attrs

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already exists.")
        return value

    def create(self, validated_data):
        validated_data.pop("password2")
        email = validated_data["email"]

        user = User.objects.create_user(
            username=email,
            email=email,
            password=validated_data["password"],
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email = data.get("email")
        password = data.get("password")

        try:
            user_obj = User.objects.get(email=email)
            username = user_obj.username
        except User.DoesNotExist:
            username = email

        user = authenticate(username=username, password=password)

        if not user:
            raise serializers.ValidationError("Invalid email or password.")

        refresh = RefreshToken.for_user(user)

        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    email = serializers.EmailField()

    class Meta:
        model = User
        fields = ("username", "email", "is_active")

    def validate_email(self, value):
        queryset = User.objects.exclude(pk=getattr(self.instance, "pk", None))
        if queryset.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_username(self, value):
        queryset = User.objects.exclude(pk=getattr(self.instance, "pk", None))
        if queryset.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value
