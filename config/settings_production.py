"""
Production settings for Tizahab.

Use this module for real deployments only.
It builds on the shared base settings and hardens the runtime defaults.
"""

from django.core.exceptions import ImproperlyConfigured
import dj_database_url

from .settings import *  # noqa

# ========================
# Security (Production)
# ========================

DEBUG = False

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "")
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS environment variable must be set")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY or SECRET_KEY == "unsafe-default-key":
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set for production")

# HTTPS and Security Headers
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "")

# ========================
# Static Files (Production)
# ========================

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
STORAGES["staticfiles"] = {
    "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
}

# ========================
# Database (Production)
# ========================

database_url = os.environ.get("DATABASE_URL", "").strip()
if database_url:
    DATABASES = {
        "default": dj_database_url.parse(
            database_url,
            conn_max_age=600,
            conn_health_checks=True,
            ssl_require=database_url.startswith("postgres"),
        )
    }
else:
    db_engine = os.environ.get("DB_ENGINE", "").strip()
    if not db_engine:
        raise ImproperlyConfigured(
            "DATABASE_URL must be set for production, or supply DB_ENGINE and related DB_* variables."
        )
    DATABASES = {
        "default": {
            "ENGINE": db_engine,
            "NAME": os.environ.get("DB_NAME", "tizahab_db"),
            "USER": os.environ.get("DB_USER", "postgres"),
            "PASSWORD": os.environ.get("DB_PASSWORD"),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5432"),
            "CONN_MAX_AGE": 600,
            "CONN_HEALTH_CHECKS": True,
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
