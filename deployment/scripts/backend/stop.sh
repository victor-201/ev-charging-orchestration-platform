#!/bin/bash
# Usage: bash stop.sh [--clean]
#   --clean  Remove all volumes and images. Irreversible data loss.

set -euo pipefail

export DOCKER_HOST=unix:///var/run/docker.sock
export COMPOSE_PARALLEL_LIMIT=24

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$SCRIPT_DIR/../../docker"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
ENV_FILE="$COMPOSE_DIR/.env"

CLEAN=false

while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --clean|-Clean) CLEAN=true ;;
        *) echo -e "${RED}[ERROR] Unknown flag: $1${NC}"; exit 1 ;;
    esac
    shift
done

echo -e "${CYAN}[STOP] Stopping ngrok...${NC}"
pkill ngrok &>/dev/null || true
taskkill.exe /F /IM ngrok.exe &>/dev/null || true

if [[ "$CLEAN" == "true" ]]; then
    echo -e "${RED}[STOP] CLEAN mode: removing containers, volumes, and images...${NC}"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down \
        --volumes --rmi all --remove-orphans
    echo -e "${GREEN}[STOP] System cleaned.${NC}"
else
    echo -e "${YELLOW}[STOP] Stopping all containers (volumes retained)...${NC}"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down --remove-orphans
    echo -e "${GREEN}[STOP] All services stopped.${NC}"
fi
