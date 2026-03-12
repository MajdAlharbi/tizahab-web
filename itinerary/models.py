"""
DEPRECATED: This model is deprecated.

The canonical DailyPlan model is in daily_plan.models.
This module is kept for backward compatibility with migrations.

Do not import from here - use daily_plan.models.DailyPlan instead.
"""

from daily_plan.models import DailyPlan

__all__ = ['DailyPlan']

