# Deployment

This document describes the deployment configuration that currently exists in the repository.

## Current Deployment Mode

The checked-in container setup is HTTP-only and is suitable for internal testing.

What is currently implemented:

- Dockerfile for the Django application
- Docker Compose stack with `web`, `db`, `redis`, and `nginx`
- Nginx reverse proxy listening on port `80`
- Gunicorn serving Django on port `8000` inside the `web` container
- PostgreSQL used by the Compose stack through `DATABASE_URL`

What is not currently active in the checked-in Compose deployment:

- HTTPS termination
- TLS certificates
- Port `443` listener in Nginx

Although `config/settings_production.py` contains stricter security settings, the provided `docker-compose.yml` and `nginx.conf` do not implement HTTPS. Documentation should therefore treat the current deployment as HTTP-only.

## Services

### `web`

Built from `Dockerfile`.

Startup flow from `entrypoint.sh`:

1. `python manage.py migrate --noinput`
2. `python manage.py collectstatic --noinput`
3. `python manage.py load_data` only when the events table is empty
4. Start Gunicorn

### `db`

- Image: `postgres:15-alpine`
- Exposes port `5432`

### `redis`

- Image: `redis:7-alpine`
- Exposes port `6379`

### `nginx`

- Image: `nginx:alpine`
- Proxies HTTP traffic from port `80` to `web:8000`

## Environment Variables

The current documentation and `.env.example` use placeholders only.

Core variables to set:

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Django secret key |
| `DJANGO_DEBUG` | Runtime debug flag used by `config/settings.py` |
| `DEBUG` | Convenience alias in `.env.example`; not the primary runtime variable |
| `DATABASE_URL` | Database connection string |
| `GOOGLE_MAPS_API_KEY` | Google Maps JavaScript API key |
| `EMAIL_HOST_USER` | SMTP username |
| `EMAIL_HOST_PASSWORD` | SMTP password or app password |

Containerized PostgreSQL example:

```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/tizahab_db
```

Development SQLite example:

```env
DATABASE_URL=sqlite:///db.sqlite3
```

## Running the Compose Stack

```bash
docker compose up --build
```

With the checked-in configuration:

- Nginx is available at `http://localhost`
- The Django app is proxied behind Nginx
- No HTTPS listener is configured

## Operational Notes

- The `web` container sets `DJANGO_SETTINGS_MODULE=config.settings`
- Compose injects a PostgreSQL `DATABASE_URL`
- `DJANGO_SECURE_SSL_REDIRECT` defaults to `False` in `docker-compose.yml`
- `nginx.conf` forwards `X-Forwarded-Proto: http`

These defaults confirm that the current repository setup is not configured as an HTTPS deployment.
