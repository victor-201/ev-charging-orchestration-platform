#!/bin/bash
# Usage:
#   bash tests.sh                   # Run unit tests (default)
#   bash tests.sh --unit            # Unit tests only
#   bash tests.sh --smoke           # Smoke / API gateway tests only
#   bash tests.sh --all             # Both unit and smoke tests
#   bash tests.sh --service <name>  # Unit test a single service
#   bash tests.sh --gateway <url>   # Override gateway URL for smoke tests

set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

RUN_UNIT=false
RUN_SMOKE=false
TARGET_SERVICE=""
GATEWAY="http://localhost:8000"

if [[ $# -eq 0 ]]; then
    RUN_UNIT=true
fi

while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --unit)    RUN_UNIT=true ;;
        --smoke)   RUN_SMOKE=true ;;
        --all)     RUN_UNIT=true; RUN_SMOKE=true ;;
        --service) TARGET_SERVICE="$2"; shift ;;
        --gateway) GATEWAY="$2"; shift ;;
        *) echo -e "${RED}[ERROR] Unknown flag: $1${NC}"; exit 1 ;;
    esac
    shift
done

ALL_SERVICES=(
    "iam-service"
    "ev-infrastructure-service"
    "session-service"
    "billing-service"
    "notification-service"
    "analytics-service"
    "telemetry-ingestion-service"
    "ocpp-gateway-service"
)

UNIT_PASS=0
UNIT_FAIL=0

run_unit_tests() {
    local services=("${ALL_SERVICES[@]}")
    if [[ -n "$TARGET_SERVICE" ]]; then
        services=("$TARGET_SERVICE")
    fi

    echo -e "${CYAN}======================================================================"
    echo -e "  UNIT TESTS"
    echo -e "======================================================================${NC}"

    for svc in "${services[@]}"; do
        local svc_dir="$BACKEND_DIR/$svc"
        echo -e "\n${CYAN}>>> $svc${NC}"

        if [[ ! -d "$svc_dir" ]]; then
            echo -e "  [${RED}SKIP${NC}] Directory not found: $svc_dir"
            ((UNIT_FAIL++)) || true
            continue
        fi

        # Skip services without installed dependencies; avoids misleading failures.
        if [[ ! -d "$svc_dir/node_modules" ]]; then
            echo -e "  [${YELLOW}SKIP${NC}] node_modules absent. Run: npm install"
            continue
        fi

        cd "$svc_dir"
        local test_cmd="npm test"
        if npm run 2>/dev/null | grep -q "test:unit"; then
            test_cmd="npm run test:unit"
        fi

        if $test_cmd; then
            echo -e "  [${GREEN}PASS${NC}] $svc"
            ((UNIT_PASS++)) || true
        else
            echo -e "  [${RED}FAIL${NC}] $svc"
            ((UNIT_FAIL++)) || true
        fi
    done

    echo -e "\n${CYAN}--- Unit Test Summary: ${GREEN}${UNIT_PASS} PASS${NC} / ${RED}${UNIT_FAIL} FAIL${CYAN} ---${NC}"
}

run_smoke_tests() {
    echo -e "\n${CYAN}======================================================================"
    echo -e "  SMOKE TESTS — API Gateway: $GATEWAY"
    echo -e "======================================================================${NC}"

    TMP_DIR=$(mktemp -d)
    declare -a PIDS=()

    fire_test() {
        local label="$1"
        local method="$2"
        local path="$3"
        (
            code=$(curl -s -o /dev/null -w "%{http_code}" \
                --connect-timeout 4 --max-time 8 \
                -X "$method" "${GATEWAY}${path}" 2>/dev/null || echo "000")
            # Accept any response code indicating the gateway routed the request,
            # including 4xx (auth/validation errors are expected without a body).
            if [[ "$code" =~ ^(200|201|400|401|403|404|422)$ ]]; then
                echo -e "  [${GREEN}OK${NC}]   [$method] $path  → HTTP $code  ($label)"
                touch "$TMP_DIR/ok_${RANDOM}"
            else
                echo -e "  [${RED}FAIL${NC}] [$method] $path  → HTTP $code  ($label)"
                touch "$TMP_DIR/fail_${RANDOM}"
            fi
        ) &
        PIDS+=($!)
    }

    fire_test "IAM - Register (no body)"       POST "/api/v1/auth/register"
    fire_test "IAM - Me (unauthenticated)"     GET  "/api/v1/users/me"
    fire_test "Infra - Station list (public)"  GET  "/api/v1/stations"
    fire_test "Session - Booking (unauth)"     POST "/api/v1/bookings"
    fire_test "Billing - Wallet (unauth)"      GET  "/api/v1/wallets/balance"
    fire_test "Notify - List (unauth)"         GET  "/api/v1/notifications"
    fire_test "Analytics - Dashboard (unauth)" GET  "/api/v1/analytics/dashboard"
    fire_test "Telemetry - Health"             GET  "/api/v1/telemetry/health"

    for pid in "${PIDS[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    smoke_ok=$(ls -1 "$TMP_DIR"/ok_* 2>/dev/null | wc -l)
    smoke_fail=$(ls -1 "$TMP_DIR"/fail_* 2>/dev/null | wc -l)
    rm -rf "$TMP_DIR"

    echo -e "\n${CYAN}--- Smoke Test Summary: ${GREEN}${smoke_ok} PASS${NC} / ${RED}${smoke_fail} FAIL${CYAN} ---${NC}"
}

if [[ "$RUN_UNIT" == "true" ]]; then
    run_unit_tests
fi

if [[ "$RUN_SMOKE" == "true" ]]; then
    run_smoke_tests
fi

echo -e "\n${GREEN}======================================================================"
echo -e "  TEST RUN COMPLETE"
echo -e "======================================================================${NC}"
