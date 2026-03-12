"""
DEPRECATED: Use daily_plan.services.generate_recommendations() instead.

This module is kept for backward compatibility only.
All recommendation logic has been consolidated into daily_plan.services.
"""

import warnings


def recommend_events(user_categories: list, max_events: int = 4) -> list:
    """
    DEPRECATED: Do not use. Use daily_plan.services.generate_recommendations() instead.
    """
    warnings.warn(
        "recommend_events() is deprecated. Use daily_plan.services.generate_recommendations()",
        DeprecationWarning,
        stacklevel=2
    )
    return []
