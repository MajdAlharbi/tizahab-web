"""
DEPRECATED: Do not use.

All daily plan generation logic is now in daily_plan.services.generate_recommendations()
and daily_plan.views.GenerateDailyPlanAPIView

This is kept for backward compatibility but should not be called directly.
"""

import warnings


def generate_daily_plan(user_preferences, events):
    """
    DEPRECATED: Use daily_plan.views.GenerateDailyPlanAPIView instead.
    """
    warnings.warn(
        "generate_daily_plan() is deprecated. Use GenerateDailyPlanAPIView from daily_plan.views",
        DeprecationWarning,
        stacklevel=2
    )
    return {
        "morning": [],
        "afternoon": [],
        "evening": [],
    }

