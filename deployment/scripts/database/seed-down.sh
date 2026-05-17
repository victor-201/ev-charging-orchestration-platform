#!/bin/bash
# Usage:
#   bash seed-down.sh             # Truncate all services in reverse dependency order
#   bash seed-down.sh <service>   # Truncate a single service

set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$BASE_DIR/../../.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVICE_NAME=$1

# Reverse dependency order ensures child tables are truncated before parents,
# though CASCADE in the SQL handles FK constraints regardless.
SERVICES=("notification-service" "analytics-service" "session-service" "billing-service" "ev-infrastructure-service" "iam-service")

DB_USER="ev_user"
DB_PASS="ev_secret"

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

run_down_for_service() {
  local service=$1
  get_service_db_config "$service"

  echo -e "▶ ${CYAN}Seed DOWN: $service...${NC}"

  if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}[ERROR] Container $CONTAINER_NAME not running. Start the database first.${NC}\n"
    exit 1
  fi

  local seed_dir="$PROJECT_ROOT/database/seeds/$service"
  if [ ! -d "$seed_dir" ]; then
    echo -e "  ${YELLOW}[SKIP] Seed directory not found: $seed_dir${NC}\n"
    return 0
  fi

  # Extract TRUNCATE statements from seed files to reverse only what was seeded.
  local truncate_stmts
  truncate_stmts=$(grep -h -i "TRUNCATE TABLE" "$seed_dir"/*.sql 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sort -u)

  if [ -z "$truncate_stmts" ]; then
    echo -e "  ${YELLOW}[SKIP] No TRUNCATE statements found in seed files for $service.${NC}\n"
    return 0
  fi

  # Disable FK triggers for the transaction to allow arbitrary truncation order.
  local sql_stmt="SET session_replication_role = replica;
BEGIN;
$truncate_stmts
COMMIT;
SET session_replication_role = DEFAULT;"

  local tmp_out
  tmp_out=$(mktemp)
  local rc=0

  docker exec -i -e PGPASSWORD="$DB_PASS" "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -c "$sql_stmt" > "$tmp_out" 2>&1 || rc=$?

  if [ $rc -ne 0 ] || grep -q "ERROR:" "$tmp_out"; then
    echo -e "  ${RED}[FAIL] Seed DOWN failed for $service${NC}"
    echo -e "${RED}----------------------------------------------------------------------${NC}"
    cat "$tmp_out"
    echo -e "${RED}----------------------------------------------------------------------${NC}"
    rm -f "$tmp_out"
    exit 1
  else
    echo -e "  ${GREEN}[OK] Tables truncated for $service:${NC}"
    echo "$truncate_stmts" | while read -r line; do
      table_name=$(echo "$line" | awk '{print $3}')
      echo -e "    ${GREEN}✓ $table_name${NC}"
    done
    echo -e "  ${GREEN}Seed DOWN complete for $service.${NC}\n"
  fi
  rm -f "$tmp_out"
}

echo -e "======================================================================"
echo -e "  ${RED}EV Charging Platform — Seed DATABASE DOWN${NC}"
echo -e "======================================================================"

if [ -n "$SERVICE_NAME" ]; then
  services_str=" ${SERVICES[@]} "
  if [[ ! "$services_str" =~ " ${SERVICE_NAME} " ]]; then
    echo -e "${RED}[ERROR] Unknown service: '$SERVICE_NAME'${NC}"
    echo "Available services: ${SERVICES[*]}"
    exit 1
  fi
  run_down_for_service "$SERVICE_NAME"
else
  for service in "${SERVICES[@]}"; do
    run_down_for_service "$service"
  done
fi

echo -e "======================================================================"
echo -e "  ${GREEN}SEED DOWN COMPLETE${NC}"
echo -e "======================================================================"
