#!/bin/bash
# Usage:
#   bash seed-up.sh             # Seed all services in dependency order
#   bash seed-up.sh <service>   # Seed a single service

set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$BASE_DIR/../../.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVICE_NAME=$1

# IAM must seed first — other services reference user IDs via FK.
SERVICES=("iam-service" "ev-infrastructure-service" "billing-service" "session-service" "analytics-service" "notification-service")

DB_USER="ev_user"
DB_PASS="ev_secret"
GLOBAL_ERROR=0

get_service_db_config() {
  local service=$1
  case "$service" in
    "iam-service")
      CONTAINER_NAME="ev-pg-iam"
      DB_NAME="ev_iam_db"
      ;;
    "ev-infrastructure-service")
      CONTAINER_NAME="ev-pg-infra"
      DB_NAME="ev_infrastructure_db"
      ;;
    "billing-service")
      CONTAINER_NAME="ev-pg-billing"
      DB_NAME="ev_billing_db"
      ;;
    "session-service")
      CONTAINER_NAME="ev-pg-session"
      DB_NAME="ev_session_db"
      ;;
    "analytics-service")
      CONTAINER_NAME="ev-pg-analytics"
      DB_NAME="ev_analytics_db"
      ;;
    "notification-service")
      CONTAINER_NAME="ev-pg-notify"
      DB_NAME="ev_notification_db"
      ;;
  esac
}

run_up_for_service() {
  local service=$1
  get_service_db_config "$service"

  echo -e "▶ ${CYAN}Seed UP: $service...${NC}"
  echo "  Container: $CONTAINER_NAME  DB: $DB_NAME  User: $DB_USER"

  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}[ERROR] Container $CONTAINER_NAME not running. Start the database first.${NC}\n"
    exit 1
  fi

  local seed_dir="$PROJECT_ROOT/database/seeds/$service"
  if [ ! -d "$seed_dir" ]; then
    echo -e "  ${YELLOW}[SKIP] Seed directory not found: $seed_dir${NC}\n"
    return 0
  fi

  local has_error=0
  for sql_file in $(ls -1 "$seed_dir"/*.sql | sort); do
    filename=$(basename "$sql_file")

    local tmp_out
    tmp_out=$(mktemp)
    local rc=0

    docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$sql_file" > "$tmp_out" 2>&1 || rc=$?

    if [ $rc -ne 0 ] || grep -q "ERROR:" "$tmp_out"; then
      echo -e "  ${RED}[FAIL] $filename${NC}"
      echo -e "${RED}----------------------------------------------------------------------${NC}"
      cat "$tmp_out"
      echo -e "${RED}----------------------------------------------------------------------${NC}"
      has_error=1
      GLOBAL_ERROR=1
    else
      echo -e "  ${GREEN}[OK] $filename${NC}"
    fi
    rm -f "$tmp_out"
  done

  if [ $has_error -ne 0 ]; then
    echo -e "  ${RED}Seed UP finished with errors for $service.${NC}\n"
  else
    echo -e "  ${GREEN}Seed UP complete for $service.${NC}\n"
  fi
}

echo -e "======================================================================"
echo -e "  ${GREEN}EV Charging Platform — Seed DATABASE UP${NC}"
echo -e "======================================================================"

if [ -n "$SERVICE_NAME" ]; then
  services_str=" ${SERVICES[@]} "
  if [[ ! "$services_str" =~ " ${SERVICE_NAME} " ]]; then
    echo -e "${RED}[ERROR] Unknown service: '$SERVICE_NAME'${NC}"
    echo "Available services: ${SERVICES[*]}"
    exit 1
  fi
  run_up_for_service "$SERVICE_NAME"
else
  for service in "${SERVICES[@]}"; do
    run_up_for_service "$service"
  done
fi

if [ $GLOBAL_ERROR -ne 0 ]; then
  echo -e "======================================================================"
  echo -e "  ${RED}SEED UP COMPLETE WITH ERRORS${NC}"
  echo -e "======================================================================"
  exit 1
else
  echo -e "======================================================================"
  echo -e "  ${GREEN}SEED UP COMPLETE SUCCESSFULLY${NC}"
  echo -e "======================================================================"
  exit 0
fi
