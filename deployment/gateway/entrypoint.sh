#!/bin/sh
# Start keep-warm in background to prevent Render cold starts on upstream services
/usr/local/bin/keep-warm.sh &

# Render envsubst template
PORT=${PORT:-8000}
export PORT
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Start nginx in foreground
exec nginx -g 'daemon off;'
