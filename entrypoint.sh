#!/bin/bash
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Optional demo-data seeding for local/dev environments only.
if [ "${DJANGO_LOAD_DEMO_DATA:-False}" = "True" ]; then
  EVENT_COUNT=$(python manage.py shell -c "from events.models import Event; print(Event.objects.count())")
  if [ "$EVENT_COUNT" = "0" ]; then
    echo "No events found - importing demo dataset..."
    python manage.py load_data
    echo "Demo dataset import complete."
  else
    echo "Events already present ($EVENT_COUNT rows) - skipping demo data import."
  fi
else
  echo "Demo data auto-seeding disabled."
fi

GUNICORN_WORKERS="${GUNICORN_WORKERS:-2}"

exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "$GUNICORN_WORKERS"