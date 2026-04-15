"""
Production settings for Tizahab.

Use this file for production deployments.
Override sensitive settings via environment variables.

Usage:
    export DJANGO_SETTINGS_MODULE=config.settings_production
    python manage.py runserver
"""

from .settings import *  # noqa

# ========================
# Security (Production)
# ========================

DEBUG = False

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")
if not ALLOWED_HOSTS or ALLOWED_HOSTS == [""]:
    raise ValueError("DJANGO_ALLOWED_HOSTS environment variable must be set")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY or SECRET_KEY == "unsafe-default-key":
    raise ValueError("DJANGO_SECRET_KEY must be set for production")

# HTTPS and Security Headers
SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "True") == "True"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_SECURITY_POLICY = {
    "default-src": ("'self'",),
    "script-src": ("'self'",),
    "style-src": ("'self'", "'unsafe-inline'"),
    "img-src": ("'self'", "data:", "https:"),
}

X_FRAME_OPTIONS = "DENY"
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# ========================
# Database (Production)
# ========================

# Must configure in environment for production database
DB_ENGINE = os.environ.get("DB_ENGINE", "")
if not DB_ENGINE:
    raise ValueError("DB_ENGINE environment variable must be set in production")
if DB_ENGINE == "django.db.backends.postgresql":
    DATABASES = {
        "default": {
            "ENGINE": DB_ENGINE,
            "NAME": os.environ.get("DB_NAME", "tizahab_db"),
            "USER": os.environ.get("DB_USER", "postgres"),
            "PASSWORD": os.environ.get("DB_PASSWORD"),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5432"),
            "CONN_MAX_AGE": 600,
            "OPTIONS": {
                "sslmode": "require",
            },
        }
    }

# ========================
# Logging (Production)
# ========================

LOGGING["handlers"]["file"]["level"] = "INFO"
LOGGING["handlers"]["console"]["level"] = "WARNING"
LOGGING["loggers"]["django"]["level"] = "WARNING"
LOGGING["loggers"]["tizahab"]["level"] = "INFO"

# ========================
# Caching (Production)
# ========================

REDIS_URL = os.environ.get("REDIS_URL")
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
            "KEY_PREFIX": "tizahab",
            "TIMEOUT": 300,  # 5 minutes
        }
    }

# ========================
# Email Configuration (Production)
# ========================

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True") == "True"
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@tizahab.com")

# ========================
# API Security (Production)
# ========================

REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "anon": os.environ.get("ANON_RATE_LIMIT", "100/hour"),
    "user": os.environ.get("USER_RATE_LIMIT", "1000/hour"),
    "login": os.environ.get("LOGIN_RATE_LIMIT", "100/hour"),
    "signup": os.environ.get("SIGNUP_RATE_LIMIT", "20/hour"),
    "change_password": os.environ.get("CHANGE_PASSWORD_RATE_LIMIT", "30/hour"),
}

# ========================
# Monitoring & Analytics
# ========================

# Sentry integration for error tracking
SENTRY_DSN = os.environ.get("SENTRY_DSN")
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
