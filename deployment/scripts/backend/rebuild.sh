#!/bin/bash
# ============================================================
# rebuild.sh — Targeted Service Image Rebuilder
# Usage:
#   bash rebuild.sh                  → interactive selector
#   bash rebuild.sh iam-service      → rebuild specific service
#   bash rebuild.sh all              → rebuild all services
# ============================================================

set -euo pipefail

export DOCKER_HOST=unix:///var/run/docker.sock
export DOCKER_BUILDKIT=1
docker context use default &>/dev/null || true

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/../../docker" && pwd)"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
ENV_FILE="$COMPOSE_DIR/.env"

# ── Service map: friendly-name → actual container_name (from docker-compose.yml) ──
declare -A SVC_MAP=(
  ["iam-service"]="ev-iam"
  ["ev-infrastructure-service"]="ev-infrastructure"
  ["session-service"]="ev-session"
  ["billing-service"]="ev-billing"
  ["analytics-service"]="ev-analytics"
  ["notification-service"]="ev-notify"
  ["telemetry-ingestion-service"]="ev-telemetry"
  ["ocpp-gateway-service"]="ev-ocpp-gw"
)

# ── Service map: friendly-name → docker-compose service name (for build/up) ──
declare -A COMPOSE_SVC_MAP=(
  ["iam-service"]="iam-service"
  ["ev-infrastructure-service"]="ev-infrastructure-service"
  ["session-service"]="session-service"
  ["billing-service"]="billing-service"
  ["analytics-service"]="analytics-service"
  ["notification-service"]="notification-service"
  ["telemetry-ingestion-service"]="telemetry-ingestion-service"
  ["ocpp-gateway-service"]="ocpp-gateway-service"
)

SERVICES_ORDER=(
  "analytics-service"
  "billing-service"
  "ev-infrastructure-service"
  "iam-service"
  "notification-service"
  "ocpp-gateway-service"
  "session-service"
  "telemetry-ingestion-service"
)

echo -e "${CYAN}======================================================================"
echo -e "  EV Charging Platform — Service Rebuilder"
echo -e "======================================================================${NC}"

rebuild_service() {
  local svc_name="$1"
  local container="${SVC_MAP[$svc_name]:-}"
  local compose_svc="${COMPOSE_SVC_MAP[$svc_name]:-}"

  if [[ -z "$container" ]]; then
    echo -e "${RED}[ERROR] Unknown service: $svc_name${NC}"
    echo -e "  Available: ${!SVC_MAP[*]}"
    return 1
  fi

  echo -e "\n${YELLOW}[BUILD] Building image: ${BOLD}$svc_name${NC} ${YELLOW}→ container: $container ...${NC}"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    build --no-cache "$compose_svc"

  echo -e "${YELLOW}[RESTART] Stopping old container: $container ...${NC}"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    stop "$compose_svc" 2>/dev/null || true

  echo -e "${YELLOW}[START] Starting new container: $container ...${NC}"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    up -d --force-recreate "$compose_svc"

  echo -e "${GREEN}[OK] $svc_name rebuilt and restarted successfully.${NC}"

  # Wait for health
  echo -e "${CYAN}[WAIT] Polling $container health (max 60s)...${NC}"
  local elapsed=0
  while [[ $elapsed -lt 60 ]]; do
    local status
    status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo "missing")
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      echo -e "${GREEN}[HEALTHY] $container is up (${elapsed}s)${NC}"
      return 0
    fi
    printf "\r  Status: %-12s | %ds elapsed..." "$status" "$elapsed"
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo -e "\n${YELLOW}[WARN] $container did not reach healthy state in 60s. Check logs:${NC}"
  echo -e "  docker logs $container --tail 40"
}

rebuild_all() {
  echo -e "${YELLOW}[BUILD] Rebuilding ALL services in parallel...${NC}"
  local compose_services=()
  for svc in "${SERVICES_ORDER[@]}"; do
    compose_services+=("${COMPOSE_SVC_MAP[$svc]}")
  done

  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    build --parallel "${compose_services[@]}"

  echo -e "${YELLOW}[RESTART] Restarting all rebuilt services...${NC}"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    up -d --force-recreate "${compose_services[@]}"

  echo -e "${GREEN}[OK] All services rebuilt and restarted.${NC}"
}

# ── Interactive selector ──────────────────────────────────────
interactive_selector() {
  echo ""
  echo -e "  Select service to rebuild:\n"
  local i=1
  for svc in "${SERVICES_ORDER[@]}"; do
    echo -e "  [${CYAN}$i${NC}] $svc  ${YELLOW}(container: ${SVC_MAP[$svc]})${NC}"
    ((i++))
  done
  echo -e "  [${CYAN}A${NC}] Rebuild ALL services"
  echo ""
  echo -e "  [0] Exit"
  echo ""
  read -rp "  Choice: " choice

  case "$choice" in
    0) echo "Cancelled."; exit 0 ;;
    [aA]) rebuild_all ;;
    *)
      if [[ "$choice" =~ ^[0-9]+$ ]] && [[ "$choice" -ge 1 && "$choice" -le ${#SERVICES_ORDER[@]} ]]; then
        local idx=$((choice - 1))
        rebuild_service "${SERVICES_ORDER[$idx]}"
      else
        echo -e "${RED}[ERROR] Invalid choice: $choice${NC}"
        exit 1
      fi
      ;;
  esac
}

# ── Entry point ───────────────────────────────────────────────
ARG="${1:-}"

case "$ARG" in
  "")        interactive_selector ;;
  "all")     rebuild_all ;;
  *)
    # Accept friendly name, container name (ev-billing), or compose svc name (billing-service)
    found=false
    for svc in "${SERVICES_ORDER[@]}"; do
      if [[ "$ARG" == "$svc" || "$ARG" == "${SVC_MAP[$svc]}" || "$ARG" == "${COMPOSE_SVC_MAP[$svc]}" ]]; then
        rebuild_service "$svc"
        found=true
        break
      fi
    done
    if [[ "$found" == "false" ]]; then
      echo -e "${RED}[ERROR] Unknown service: $ARG${NC}"
      echo -e "  Available services:"
      for svc in "${SERVICES_ORDER[@]}"; do
        echo -e "    $svc  (container: ${SVC_MAP[$svc]})"
      done
      exit 1
    fi
    ;;
esac

echo ""
echo -e "${GREEN}======================================================================"
echo -e "  Done. To view logs: docker logs <container> --tail 50"
echo -e "======================================================================${NC}"
echo ""
echo " Press Enter to close window..."
read -r
