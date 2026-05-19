#!/bin/bash

# Omit -e to prevent premature exit on individual check failures.
set -uo pipefail

export DOCKER_HOST=unix:///var/run/docker.sock

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

echo -e "${CYAN}======================================================================"
echo -e "  EV Platform — Health Check"
echo -e "======================================================================${NC}"

echo -e "\n${YELLOW}[1/4] Docker Daemon...${NC}"
if docker info &>/dev/null; then
    echo -e "  [${GREEN}OK${NC}]   Docker running"
    ((PASSED++)) || true
else
    echo -e "  [${RED}FAIL${NC}] Docker not responding"
    ((FAILED++)) || true
fi

echo -e "\n${YELLOW}[2/4] Docker Containers...${NC}"

# Names must match container_name fields in docker-compose.yml.
CONTAINERS=(
    "ev-pg-iam"       "ev-pg-infra"     "ev-pg-session"
    "ev-pg-billing"   "ev-pg-analytics" "ev-pg-notify"
    "ev-redis"        "ev-rabbitmq"     "ev-clickhouse"
    "ev-iam"          "ev-infrastructure" "ev-session"
    "ev-billing"      "ev-analytics"    "ev-notify"
    "ev-telemetry"    "ev-ocpp-gw"      "ev-kong"
)

declare -A health_map
while IFS=" " read -r cname hstatus sstatus; do
    cname="${cname#/}"
    health_map["$cname"]="${hstatus}|${sstatus}"
done < <(docker inspect \
    --format='{{.Name}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.Status}}' \
    "${CONTAINERS[@]}" 2>/dev/null || true)

for container in "${CONTAINERS[@]}"; do
    info="${health_map[$container]:-missing|missing}"
    hstatus="${info%%|*}"
    sstatus="${info##*|}"

    if [[ "$hstatus" == "healthy" ]]; then
        printf "  [${GREEN}OK${NC}]   %-28s  health=healthy  state=%s\n" "$container" "$sstatus"
        ((PASSED++)) || true
    elif [[ "$hstatus" == "none" && "$sstatus" == "running" ]]; then
        printf "  [${GREEN}OK${NC}]   %-28s  health=none     state=running\n" "$container"
        ((PASSED++)) || true
    elif [[ "$hstatus" == "starting" ]]; then
        printf "  [${YELLOW}WAIT${NC}] %-28s  health=starting state=%s\n" "$container" "$sstatus"
        ((FAILED++)) || true
    elif [[ "$hstatus" == "missing" ]]; then
        printf "  [${RED}FAIL${NC}] %-28s  CONTAINER NOT FOUND\n" "$container"
        ((FAILED++)) || true
    else
        printf "  [${RED}FAIL${NC}] %-28s  health=%s  state=%s\n" "$container" "$hstatus" "$sstatus"
        ((FAILED++)) || true
    fi
done

echo -e "\n${YELLOW}[3/4] HTTP Endpoints (parallel)...${NC}"

ENDPOINTS=(
    "IAM-Service:http://localhost:3001/health"
    "Analytics-Service:http://localhost:3002/health"
    "Infrastructure-Service:http://localhost:3003/health"
    "Session-Service:http://localhost:3004/health"
    "Billing-Service:http://localhost:3007/health"
    "Notification-Service:http://localhost:3008/health"
    "Telemetry-Service:http://localhost:3009/health"
    "OCPP-Gateway:http://localhost:3010/health"
    "Kong-Proxy:http://localhost:8000"
    "Kong-Admin:http://localhost:8001"
    "RabbitMQ-UI:http://localhost:15672"
    "ClickHouse-HTTP:http://localhost:8123/ping"
)

TMP_DIR=$(mktemp -d)
declare -a EP_PIDS=()

for ep in "${ENDPOINTS[@]}"; do
    (
        name="${ep%%:*}"
        url="${ep#*:}"
        http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 "$url" 2>/dev/null || echo "000")
        if [[ "$http_code" =~ ^(200|301|302|401|404)$ ]]; then
            printf "  [${GREEN}OK${NC}]   %-28s  HTTP %s\n" "$name" "$http_code"
            touch "$TMP_DIR/ok_${RANDOM}"
        else
            printf "  [${RED}FAIL${NC}] %-28s  HTTP %s  (%s)\n" "$name" "$http_code" "$url"
            touch "$TMP_DIR/fail_${RANDOM}"
        fi
    ) &
    EP_PIDS+=($!)
done

# Wait for all parallel curl probes before aggregating results.
for pid in "${EP_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

ep_passed=$(ls -1 "$TMP_DIR"/ok_* 2>/dev/null | wc -l)
ep_failed=$(ls -1 "$TMP_DIR"/fail_* 2>/dev/null | wc -l)
rm -rf "$TMP_DIR"
PASSED=$((PASSED + ep_passed))
FAILED=$((FAILED + ep_failed))

echo -e "\n${YELLOW}[4/4] Ngrok Tunnel...${NC}"
if tasklist.exe /FI "IMAGENAME eq ngrok.exe" 2>/dev/null | grep -q "ngrok.exe"; then
    log_file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../ngrok.log"
    pub_url=$(grep -o "url=https://[a-zA-Z0-9.-]*" "$log_file" 2>/dev/null | cut -d= -f2 | tail -n 1)
    if [[ -n "$pub_url" ]]; then
        echo -e "  [${GREEN}OK${NC}]   Ngrok tunnel active  ($pub_url)"
    else
        echo -e "  [${GREEN}OK${NC}]   Ngrok tunnel active"
    fi
    ((PASSED++)) || true
else
    # Ngrok is optional; skip without incrementing FAILED.
    echo -e "  [${YELLOW}SKIP${NC}] Ngrok not running (not required)"
fi

echo -e "\n${CYAN}======================================================================"
TOTAL=$((PASSED + FAILED))
if [[ $FAILED -eq 0 ]]; then
    echo -e "  ${GREEN}RESULT: $PASSED/$TOTAL OK  ✓${NC}"
    echo -e "${CYAN}======================================================================"
    exit 0
else
    echo -e "  ${RED}RESULT: $PASSED OK  |  $FAILED FAILED${NC}"
    echo -e "  ${RED}Review FAIL entries above.${NC}"
    echo -e "${CYAN}======================================================================"
    exit 1
fi
