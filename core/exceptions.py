"""
Custom exception classes for Tizahab application.

Used for structured error handling across all modules.
"""

from rest_framework.exceptions import APIException
from rest_framework import status


class TizahahAPIException(APIException):
    """Base exception for all Tizahab API errors."""
    default_detail = "An error occurred."
    default_code = "error"


class ResourceNotFound(TizahahAPIException):
    """Raised when a resource is not found."""
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "Resource not found."
    default_code = "not_found"


class InvalidInputError(TizahahAPIException):
    """Raised when user input is invalid."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Invalid input provided."
    default_code = "invalid_input"


class BudgetError(TizahahAPIException):
    """Raised when budget constraints are violated."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Invalid budget parameters."
    default_code = "budget_error"


class NoPreferencesError(TizahahAPIException):
    """Raised when user has no preferences set."""
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "User preferences not configured."
    default_code = "no_preferences"


class NoRecommendationsError(TizahahAPIException):
    """Raised when no events match user preferences."""
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "No recommendations found for your preferences."
    default_code = "no_recommendations"


class ExternalAPIError(TizahahAPIException):
    """Raised when external API (e.g., Google Places) fails."""
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "External service temporarily unavailable."
    default_code = "external_api_error"


class AuthenticationError(TizahahAPIException):
    """Raised when authentication fails."""
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = "Authentication failed."
    default_code = "authentication_error"


class PermissionError(TizahahAPIException):
    """Raised when user lacks required permissions."""
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "You do not have permission to perform this action."
    default_code = "permission_error"
