#!/bin/sh
# Keep-warm script: pings all upstream services every 8 minutes
# to prevent Render free-tier cold starts (spin-down after ~15 min idle).
# Runs in background alongside nginx.
#
# Uses HEAD requests to /health on each upstream to minimise response payload.

UPSTREAMS="
https://ev-iam-service.onrender.com/health
https://ev-infrastructure-service.onrender.com/health
https://ev-session-service.onrender.com/health
https://ev-billing-service.onrender.com/health
https://ev-notification-service.onrender.com/health
https://ev-analytics-service.onrender.com/health
https://ev-telemetry-ingestion.onrender.com/health
https://ev-ocpp-gateway.onrender.com/health
"

while true; do
    for url in $UPSTREAMS; do
        curl -sf -o /dev/null --max-time 10 "$url" 2>/dev/null || true
    done
    sleep 480  # 8 minutes
done
