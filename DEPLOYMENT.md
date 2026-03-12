# Tizahab Production Deployment Guide

**Last Updated:** March 2026  
**Version:** 1.0.0

This guide covers deploying Tizahab to production environments.

---

## Prerequisites

- Linux server (Ubuntu 20.04+ recommended)
- Python 3.8+
- PostgreSQL 12+
- Redis 6+
- Nginx or Apache
- SSL certificate (Let's Encrypt recommended)
- Domain name

---

## 🚀 Deployment Steps

### 1. Server Setup

**Update system packages**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip python3-venv postgresql postgresql-contrib redis-server nginx
```

**Create application user**
```bash
sudo useradd -m -s /bin/bash tizahab
sudo su - tizahab
cd /home/tizahab
```

### 2. Clone Repository

```bash
git clone <your-repo> tizahab-web
cd tizahab-web
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn psycopg2-binary
```

### 3. Database Configuration

**Create PostgreSQL database**
```bash
sudo -i -u postgres
psql
```

```sql
CREATE DATABASE tizahab_db;
CREATE USER tizahab_user WITH PASSWORD 'secure_password_here';
ALTER ROLE tizahab_user SET client_encoding TO 'utf8';
ALTER ROLE tizahab_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE tizahab_user SET default_transaction_deferrable TO on;
ALTER ROLE tizahab_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE tizahab_db TO tizahab_user;
\q
exit
```

### 4. Environment Configuration

**Create production `.env` file**
```bash
cd /home/tizahab/tizahab-web
cat > .env << EOF
# Django Settings
DJANGO_SETTINGS_MODULE=config.settings_production
DJANGO_SECRET_KEY=$(python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())')
DEBUG=False

# Allowed Hosts
DJANGO_ALLOWED_HOSTS=tizahab.example.com,www.tizahab.example.com

# Database
DB_ENGINE=django.db.backends.postgresql
DB_NAME=tizahab_db
DB_USER=tizahab_user
DB_PASSWORD=secure_password_here
DB_HOST=localhost
DB_PORT=5432

# Redis
REDIS_URL=redis://localhost:6379/1

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
DEFAULT_FROM_EMAIL=noreply@tizahab.com

# Google API
GOOGLE_MAPS_API_KEY=your-api-key-here

# Security
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True

# API Rate Limiting
ANON_RATE_LIMIT=100/hour
USER_RATE_LIMIT=1000/hour

# Monitoring (Optional)
SENTRY_DSN=your-sentry-dsn-here
EOF
chmod 600 .env
```

### 5. Django Setup

```bash
source venv/bin/activate
cd /home/tizahab/tizahab-web

# Run migrations
python manage.py makemigrations
python manage.py migrate

# Collect static files
python manage.py collectstatic --noinput

# Create superuser
python manage.py createsuperuser
```

### 6. Gunicorn Configuration

**Create systemd service file**
```bash
sudo tee /etc/systemd/system/tizahab.service > /dev/null << EOF
[Unit]
Description=Tizahab Web Service
After=network.target postgresql.service redis.service

[Service]
User=tizahab
Group=tizahab
WorkingDirectory=/home/tizahab/tizahab-web
Environment="PATH=/home/tizahab/tizahab-web/venv/bin"
ExecStart=/home/tizahab/tizahab-web/venv/bin/gunicorn \
    --workers=4 \
    --worker-class=sync \
    --bind=unix:/run/gunicorn.sock \
    --timeout=30 \
    --access-logfile=/home/tizahab/logs/access.log \
    --error-logfile=/home/tizahab/logs/error.log \
    config.wsgi:application

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tizahab
sudo systemctl start tizahab
```

**Create log directory**
```bash
mkdir -p /home/tizahab/logs
chmod 755 /home/tizahab/logs
```

### 7. Nginx Configuration

**Create nginx config**
```bash
sudo tee /etc/nginx/sites-available/tizahab > /dev/null << 'EOF'
upstream tizahab_app {
    server unix:/run/gunicorn.sock fail_timeout=0;
}

server {
    listen 80;
    server_name tizahab.example.com www.tizahab.example.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tizahab.example.com www.tizahab.example.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/tizahab.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tizahab.example.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Client upload size
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;

    # Static files
    location /static/ {
        alias /home/tizahab/tizahab-web/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Media files
    location /media/ {
        alias /home/tizahab/tizahab-web/media/;
        expires 7d;
    }

    # Proxy to gunicorn
    location / {
        proxy_pass http://tizahab_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/tizahab /etc/nginx/sites-enabled/tizahab
sudo nginx -t
sudo systemctl reload nginx
```

### 8. SSL Certificate

**Using Let's Encrypt (Certbot)**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d tizahab.example.com -d www.tizahab.example.com
sudo certbot renew --dry-run  # Test renewal
```

**Auto-renew**
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 9. Monitoring & Logging

**Check service status**
```bash
sudo systemctl status tizahab
sudo journalctl -u tizahab -f  # Follow logs
```

**View application logs**
```bash
tail -f /home/tizahab/logs/error.log
tail -f /home/tizahab/logs/access.log
tail -f /home/tizahab/tizahab-web/logs/tizahab.log
```

### 10. Backup & Maintenance

**Database backup**
```bash
# Manual backup
sudo -i -u postgres
pg_dump tizahab_db > /home/tizahab/backups/tizahab_$(date +%Y%m%d).sql

# Automated backup (cron)
0 3 * * * pg_dump tizahab_db > /home/tizahab/backups/tizahab_$(date +\%Y\%m\%d).sql
```

**Static files cleanup**
```bash
python manage.py collectstatic --clear --noinput
```

**Check disk usage**
```bash
du -sh /home/tizahab/
du -sh /home/tizahab/logs/
```

---

## 🔧 Troubleshooting

### Service won't start
```bash
# Check service logs
sudo journalctl -u tizahab -n 50 --no-pager

# Check gunicorn socket
ls -l /run/gunicorn.sock

# Restart service
sudo systemctl restart tizahab
```

### Database connection error
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Verify credentials in .env
psql -h localhost -U tizahab_user -d tizahab_db

# Check user permissions
sudo -i -u postgres psql -c "SELECT * FROM information_schema.table_privileges WHERE grantee = 'tizahab_user';"
```

### Static files not loading
```bash
# Recollect static files
python manage.py collectstatic --clear --noinput

# Fix permissions
sudo chown -R tizahab:tizahab /home/tizahab/tizahab-web/staticfiles/
sudo chmod -R 755 /home/tizahab/tizahab-web/staticfiles/
```

### High memory usage
```bash
# Check gunicorn workers
ps aux | grep gunicorn

# Adjust worker count in systemd service
# Limit to: (CPU_cores * 2) + 1
```

---

## 📊 Monitoring Commands

```bash
# System resources
htop
free -m
df -h

# Service health
sudo systemctl status tizahab
sudo systemctl status postgresql
sudo systemctl status redis-server
sudo systemctl status nginx

# Network
netstat -tlnp | grep -E '(8000|5432|6379|80|443)'
```

---

## 🔄 Rolling Updates

```bash
# 1. Pull latest changes
cd /home/tizahab/tizahab-web
git pull origin main

# 2. Activate venv
source venv/bin/activate

# 3. Install dependencies (if changed)
pip install -r requirements.txt

# 4. Run migrations
python manage.py migrate

# 5. Collect static files
python manage.py collectstatic --noinput

# 6. Restart service
sudo systemctl restart tizahab

# 7. Verify
sudo systemctl status tizahab
```

---

## 🚨 Emergency Procedures

**Rollback to previous version**
```bash
cd /home/tizahab/tizahab-web
git log --oneline -5  # Find commit to roll back to
git checkout <commit-hash>
python manage.py migrate  # Rollback migrations if needed
sudo systemctl restart tizahab
```

**Disable maintenance mode**
```bash
# Create maintenance page
sudo cp maintenance.html /home/tizahab/tizahab-web/maintenance.html

# Configure nginx to show maintenance page
# Then re-enable after fix
```

**Clear cache**
```bash
redis-cli -n 1 FLUSHDB  # Only production DB
python manage.py shell
>>> from django.core.cache import cache
>>> cache.clear()
```

---

## ✅ Production Checklist

- [ ] Database backed up
- [ ] SSL certificate installed
- [ ] ALLOWED_HOSTS configured
- [ ] DEBUG = False
- [ ] SECRET_KEY generated and secure
- [ ] Email configured
- [ ] API keys set (Google, Sentry, etc.)
- [ ] Logging configured
- [ ] Redis configured
- [ ] Static files collected
- [ ] Superuser created
- [ ] Nginx SSL configured
- [ ] Firewall rules set
- [ ] Monitoring enabled
- [ ] Backup schedule setup

---

## 📞 Support

For deployment issues:
1. Check [API_DOCUMENTATION.md](API_DOCUMENTATION.md)
2. Review application logs in `/home/tizahab/logs/`
3. Check system logs: `sudo journalctl -u tizahab`
4. Contact: support@tizahab.com

---

**Happy Deploying! 🚀**
