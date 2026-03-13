"""
Django settings for config project.
"""

import os
from pathlib import Path
from datetime import timedelta
from django.core.exceptions import ImproperlyConfigured

# ========================
# Base
# ========================

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file manually — strip both key and value to handle spaces around "="
env_path = BASE_DIR / ".env"
if env_path.exists():
    with open(env_path) as env_file:
        for line in env_file:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                key, _, value = stripped.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

# ========================
# Security
# ========================

# Accept both DJANGO_SECRET_KEY (preferred) and legacy SECRET_KEY.
# Neither may be empty — raise early rather than running with a weak key.
_secret_key = os.environ.get("DJANGO_SECRET_KEY") or os.environ.get("SECRET_KEY", "")
if not _secret_key:
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY environment variable is not set. "
        "Copy .env.example to .env and set a strong random key. "
        "Generate one with: python -c \"from django.core.management.utils import "
        "get_random_secret_key; print(get_random_secret_key())\""
    )
SECRET_KEY = _secret_key

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# Read from env so production stays safe; development .env sets DJANGO_DEBUG=True
DEBUG = os.environ.get("DJANGO_DEBUG", "False").strip().lower() in ("true", "1", "yes")

# Always include localhost in dev; production overrides via DJANGO_ALLOWED_HOSTS
_allowed = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
ALLOWED_HOSTS = [h.strip() for h in _allowed.split(",") if h.strip()]

# ========================
# Applications
# ========================

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'tailwind',
    "theme",
    'core',
    'accounts',
    'events',
    'rest_framework',
    'rest_framework.authtoken',
    'rest_framework_simplejwt',
    'daily_plan',
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

TAILWIND_APP_NAME = "theme"

# ========================
# Middleware
# ========================

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise must be directly after SecurityMiddleware so it can serve
    # compressed static files before any auth/session logic runs.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.NoIndexMiddleware',
]

ROOT_URLCONF = 'config.urls'

# ========================
# Templates
# ========================

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'core.context_processors.google_maps_api_key',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ========================
# Database
# ========================

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# ========================
# Auth
# ========================

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
]

# ========================
# Internationalization
# ========================

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ========================
# Static
# ========================

STATIC_URL = 'static/'

# Where collectstatic writes files for production serving by WhiteNoise / CDN.
# Must NOT overlap with any path inside STATICFILES_DIRS.
STATIC_ROOT = BASE_DIR / "staticfiles"

STATICFILES_DIRS = [
    BASE_DIR / "static",
]

# WhiteNoise: compress files and append content-hash to filenames for
# cache-busting. Requires `python manage.py collectstatic` before deployment.
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# ========================
# Email
# ========================
# Default: console backend so password-reset emails print to stdout in dev.
# Production: set EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
# and supply SMTP credentials via environment variables.

EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend",
)
EMAIL_HOST          = os.environ.get("EMAIL_HOST",          "smtp.gmail.com")
EMAIL_PORT          = int(os.environ.get("EMAIL_PORT",      "587"))
EMAIL_USE_TLS       = os.environ.get("EMAIL_USE_TLS",       "True").strip().lower() in ("true", "1", "yes")
EMAIL_HOST_USER     = os.environ.get("EMAIL_HOST_USER",     "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL  = os.environ.get("DEFAULT_FROM_EMAIL",  "noreply@tizahab.com")

# ========================
# Logging
# ========================

from config.logging_config import LOGGING_CONFIG as _LOGGING_CONFIG

LOGGING = _LOGGING_CONFIG


# ========================
# Custom Settings
# ========================

# API Rate Limiting
API_RATE_LIMIT = os.environ.get("API_RATE_LIMIT", "100/hour")

# Max events per API response
MAX_EVENTS_PER_RESPONSE = 100

# Daily plan batch size
DAILY_PLAN_BATCH_SIZE = 5
