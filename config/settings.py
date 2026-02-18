"""
Django settings for config project.
"""

import os
from pathlib import Path
from datetime import timedelta

# ========================
# Base
# ========================

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file manually
env_path = BASE_DIR / ".env"
if env_path.exists():
    with open(env_path) as env_file:
        for line in env_file:
            if line.strip() and not line.startswith("#"):
                key, _, value = line.strip().partition("=")
                os.environ.setdefault(key, value)

# ========================
# Security
# ========================

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "unsafe-default-key")

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

DEBUG = True

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")
    if h.strip()
]

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
    'itinerary',
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
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
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

STATICFILES_DIRS = [
    BASE_DIR / "static",
]
