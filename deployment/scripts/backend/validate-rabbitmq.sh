#!/bin/bash

set -uo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../docker/.env"

RMQ_USER="ev_user"
RMQ_PASS="ev_secret"
RMQ_HOST="localhost"
RMQ_PORT="15672"

# Prefer credentials from .env over defaults to avoid stale config mismatch.
if [[ -f "$ENV_FILE" ]]; then
    ENV_USER=$(grep -E "^RABBITMQ_USER=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"'$'\r' || true)
    ENV_PASS=$(grep -E "^RABBITMQ_PASS=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"'$'\r' || true)
    [[ -n "$ENV_USER" ]] && RMQ_USER="$ENV_USER"
    [[ -n "$ENV_PASS" ]] && RMQ_PASS="$ENV_PASS"
fi

RMQ_API="http://${RMQ_HOST}:${RMQ_PORT}/api"
AUTH="${RMQ_USER}:${RMQ_PASS}"

echo -e "${CYAN}======================================================================"
echo -e "  EV Platform — RabbitMQ Validation"
echo -e "  Endpoint: $RMQ_API"
echo -e "======================================================================${NC}"

PASSED=0
FAILED=0

echo -e "\n${YELLOW}[1/3] RabbitMQ Management API connectivity...${NC}"
OVERVIEW=$(curl -s --connect-timeout 4 --max-time 8 \
    -u "$AUTH" "${RMQ_API}/overview" 2>/dev/null || echo "")

if [[ -z "$OVERVIEW" ]]; then
    echo -e "  [${RED}FAIL${NC}] Cannot reach RabbitMQ API (${RMQ_API})"
    echo -e "  ${YELLOW}=> Verify container ev-rabbitmq is running and port 15672 is exposed.${NC}"
    exit 1
fi
echo -e "  [${GREEN}OK${NC}]   Connected"
((PASSED++)) || true

echo -e "\n${YELLOW}[2/3] Message backlog...${NC}"
MSG_READY=$(echo "$OVERVIEW"   | grep -o '"messages_ready":[0-9]*'   | head -1 | cut -d: -f2 || echo "0")
MSG_UNACK=$(echo "$OVERVIEW"   | grep -o '"messages_unacknowledged":[0-9]*' | head -1 | cut -d: -f2 || echo "0")
MSG_TOTAL=$(echo "$OVERVIEW"   | grep -o '"messages":[0-9]*'         | head -1 | cut -d: -f2 || echo "0")

echo -e "  Messages ready        : ${CYAN}${MSG_READY:-0}${NC}"
echo -e "  Messages unacknowledged: ${CYAN}${MSG_UNACK:-0}${NC}"
echo -e "  Messages total        : ${CYAN}${MSG_TOTAL:-0}${NC}"

if [[ "${MSG_READY:-0}" -eq 0 && "${MSG_UNACK:-0}" -eq 0 ]]; then
    echo -e "  [${GREEN}OK${NC}]   No backlog"
    ((PASSED++)) || true
elif [[ "${MSG_READY:-0}" -gt 100 ]]; then
    # Threshold of 100 indicates consumer starvation or a crashed worker.
    echo -e "  [${RED}WARN${NC}] High ready-message count: ${MSG_READY}. Check consumer health."
    ((FAILED++)) || true
else
    echo -e "  [${YELLOW}INFO${NC}] ${MSG_READY:-0} pending messages (within acceptable range)"
    ((PASSED++)) || true
fi

echo -e "\n${YELLOW}[3/3] Queue inventory...${NC}"
QUEUES=$(curl -s --connect-timeout 4 --max-time 8 \
    -u "$AUTH" "${RMQ_API}/queues" 2>/dev/null || echo "[]")

QUEUE_COUNT=$(echo "$QUEUES" | grep -o '"name"' | wc -l || echo "0")

if [[ "$QUEUE_COUNT" -gt 0 ]]; then
    echo -e "  [${GREEN}OK${NC}]   Found ${QUEUE_COUNT} queue(s)"
    DLQ_COUNT=$(echo "$QUEUES" | grep -c '"dlq\|dead.letter\|DLQ' || echo "0")
    if [[ "$DLQ_COUNT" -gt 0 ]]; then
        echo -e "  [${YELLOW}INFO${NC}] ${DLQ_COUNT} Dead Letter Queue(s) present"
    fi
    ((PASSED++)) || true
else
    echo -e "  [${YELLOW}WARN${NC}] No queues found. System may not have fully initialized."
fi

echo -e "\n${CYAN}======================================================================"
if [[ $FAILED -eq 0 ]]; then
    echo -e "  ${GREEN}RABBITMQ OK  ✓${NC}"
    echo -e "${CYAN}======================================================================"
    exit 0
else
    echo -e "  ${RED}RABBITMQ FAILURES: $FAILED${NC}"
    echo -e "${CYAN}======================================================================"
    exit 1
fi
