#!/bin/bash
# Usage: bash start.sh [--rebuild] [--ngrok]

set -euo pipefail

# Force native WSL Docker socket; avoids Desktop proxy routing issues.
export DOCKER_HOST=unix:///var/run/docker.sock
export DOCKER_BUILDKIT=1
export COMPOSE_PARALLEL_LIMIT=24
docker context use default &>/dev/null || true

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/../../docker" && pwd)"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
ENV_FILE="$COMPOSE_DIR/.env"
NGROK_DOMAIN="impeditive-incredible-jordy.ngrok-free.dev"

REBUILD=false
NGROK=false

while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --rebuild|-Rebuild) REBUILD=true ;;
        --ngrok|-Ngrok)     NGROK=true ;;
        *) echo -e "${RED}[ERROR] Unknown flag: $1${NC}"; exit 1 ;;
    esac
    shift
done

echo -e "${CYAN}======================================================================"
echo -e "  EV Charging Platform — System Start"
echo -e "======================================================================${NC}"

# Auto-start Docker daemon if not running; required for Native WSL installs
# where the service does not start on boot by default.
if ! docker info &>/dev/null; then
    echo -e "${YELLOW}[INFO] Docker not running. Starting service...${NC}"
    sudo service docker start &>/dev/null || true
    sleep 2
    if ! docker info &>/dev/null; then
        echo -e "${RED}[ERROR] Docker unavailable after start attempt. Check Docker Engine installation.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}[OK] Docker running.${NC}"

echo -e "${YELLOW}[PREP] Stopping existing containers...${NC}"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --remove-orphans &>/dev/null || true

# Force rebuild if any expected local image is absent to prevent stale-image
# containers from running on an incomplete image set.
LOCAL_IMAGES=(
    "ev/iam-service:local"
    "ev/ev-infrastructure-service:local"
    "ev/session-service:local"
    "ev/billing-service:local"
    "ev/analytics-service:local"
    "ev/notification-service:local"
    "ev/telemetry-ingestion-service:local"
    "ev/ocpp-gateway-service:local"
)

missing_image=false
for img in "${LOCAL_IMAGES[@]}"; do
    if [[ -z "$(docker images -q "$img" 2>/dev/null)" ]]; then
        missing_image=true
        break
    fi
done

if [[ "$REBUILD" == "true" || "$missing_image" == "true" ]]; then
    if [[ "$missing_image" == "true" ]]; then
        echo -e "${YELLOW}[INFO] Missing local images detected. Triggering build...${NC}"
    fi
    echo -e "${YELLOW}[BUILD] Building images in parallel (may take several minutes)...${NC}"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --parallel
fi

echo -e "${GREEN}[START] Starting all containers...${NC}"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

if [[ "$NGROK" == "true" ]]; then
    pkill ngrok &>/dev/null || true
    taskkill.exe /F /IM ngrok.exe &>/dev/null || true
    sleep 1
    echo -e "${CYAN}[NGROK] Starting tunnel (domain: $NGROK_DOMAIN)...${NC}"
    
    # Run ngrok.exe via Windows PowerShell to ensure it detaches completely and survives WSL terminal close
    powershell.exe -NoProfile -Command "Start-Process ngrok.exe -ArgumentList 'http --domain=$NGROK_DOMAIN 8000' -NoNewWindow" </dev/null &>/dev/null &
    
    echo -e "${GREEN}[NGROK] Tunnel started in background.${NC}"
fi


echo -e "\n${CYAN}[WAIT] Polling service readiness...${NC}"

# Container names must match container_name fields in docker-compose.yml.
SERVICES=(
    # Services
    "ev-analytics"      "ev-billing"        "ev-iam"
    "ev-infrastructure" "ev-notify"         "ev-ocpp-gw"
    "ev-session"        "ev-telemetry"
    # Databases
    "ev-clickhouse"     "ev-pg-analytics"   "ev-pg-billing"
    "ev-pg-iam"         "ev-pg-infra"       "ev-pg-notify"
    "ev-pg-session"
    # Tools
    "ev-kong"           "ev-rabbitmq"       "ev-redis"
)

TIMEOUT=180
INTERVAL=3
ELAPSED=0

while [[ $ELAPSED -lt $TIMEOUT ]]; do
    ready_count=0
    total=${#SERVICES[@]}

    declare -A health_map
    while IFS=" " read -r cname hstatus sstatus; do
        cname="${cname#/}"
        health_map["$cname"]="${hstatus}|${sstatus}"
    done < <(docker inspect \
        --format='{{.Name}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.Status}}' \
        "${SERVICES[@]}" 2>/dev/null || true)

    for svc in "${SERVICES[@]}"; do
        info="${health_map[$svc]:-missing|missing}"
        hstatus="${info%%|*}"
        sstatus="${info##*|}"
        if [[ "$hstatus" == "healthy" || "$hstatus" == "starting" || ("$hstatus" == "none" && "$sstatus" == "running") ]]; then
            ((ready_count++)) || true
        fi
    done

    bar_len=20
    filled=$(( ready_count * bar_len / total ))
    bar=""
    for ((i=0; i<filled; i++));   do bar="${bar}#"; done
    for ((i=filled; i<bar_len; i++)); do bar="${bar}-"; done
    printf "\r  [%s] %d/%d ready  " "$bar" "$ready_count" "$total"

    if [[ $ready_count -eq $total ]]; then
        echo -e "\n\n${GREEN}======================================================================"
        echo -e "  ALL $total SERVICES READY"
        echo -e "======================================================================${NC}"
        exit 0
    fi

    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
    unset health_map
done

echo -e "\n\n${YELLOW}[WARN] Timeout after ${TIMEOUT}s. Some services may still be starting.${NC}"
echo -e "${YELLOW}       Run health-check.sh for details.${NC}"
exit 0
