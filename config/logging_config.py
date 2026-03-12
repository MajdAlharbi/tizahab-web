"""
Centralized logging configuration for Tizahab project.

- Logs to console (development) and file (production)
- Separate loggers for different modules
- Sensitive data filtering
"""

import logging
import logging.handlers
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)


class SensitiveDataFilter(logging.Filter):
    """Filter to mask sensitive data in logs."""
    
    def filter(self, record):
        """Remove sensitive fields from log messages."""
        sensitive_fields = ['password', 'token', 'secret', 'api_key', 'email']
        
        if hasattr(record, 'msg') and isinstance(record.msg, str):
            for field in sensitive_fields:
                if field.lower() in record.msg.lower():
                    record.msg = record.msg.replace(record.msg, "***REDACTED***")
        
        return True


LOGGING_CONFIG = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
        'simple': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'filters': {
        'sensitive_data': {
            '()': SensitiveDataFilter,
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'level': 'INFO',
            'formatter': 'simple',
            'filters': ['sensitive_data'],
        },
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'level': 'DEBUG',
            'filename': LOGS_DIR / 'tizahab.log',
            'maxBytes': 10485760,  # 10MB
            'backupCount': 5,
            'formatter': 'verbose',
            'filters': ['sensitive_data'],
        },
        'error_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'level': 'ERROR',
            'filename': LOGS_DIR / 'errors.log',
            'maxBytes': 10485760,  # 10MB
            'backupCount': 5,
            'formatter': 'verbose',
            'filters': ['sensitive_data'],
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'INFO',
            'propagate': False,
        },
        'tizahab': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'accounts': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'events': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'daily_plan': {
            'handlers': ['console', 'file', 'error_file'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
    'root': {
        'handlers': ['console', 'file', 'error_file'],
        'level': 'DEBUG',
    },
}
