#!/bin/bash
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Seed the database with 953 Riyadh places on first startup.
# The check avoids duplicating data on subsequent container restarts.
EVENT_COUNT=$(python manage.py shell -c "from events.models import Event; print(Event.objects.count())")
if [ "$EVENT_COUNT" = "0" ]; then
  echo "No events found — importing dataset..."
  python manage.py load_data
  echo "Dataset import complete."
else
  echo "Events already present ($EVENT_COUNT rows) — skipping load_data."
fi

GUNICORN_WORKERS="${GUNICORN_WORKERS:-2}"

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "$GUNICORN_WORKERS"
