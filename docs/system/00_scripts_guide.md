# Deployment Scripts Guide

This document covers the complete automation toolset (Bash for Backend and PowerShell for Frontend) in the `deployment/scripts/` directory for managing **backend microservices** (Docker) and **frontend Flutter mobile app**.

> **General Requirements:**
>
> - **Backend:** Ubuntu (WSL) with Docker Engine installed directly inside (Native WSL - **No Docker Desktop required**).
> - **Frontend:** PowerShell 5.1+ (Windows) or PowerShell 7+ (`pwsh`)
> - All commands run from **project root** (`ev-charging-orchestration-platform/`)
> - **Auto-WSL Utility:** Backend scripts can run directly from Git Bash/PowerShell on Windows; the system automatically redirects to WSL.

---

## PART 1 - BACKEND (Docker Microservices)

> **Additional requirements:** Docker running in WSL (Ubuntu).

### Overview

> **Recommendation:** Use the **Interactive Menu** at `deployment/scripts/menu.ps1` as the central control hub for one-click operations. The menu has Auto-WSL integration and automatically calls all scripts below.

| Script                 | Purpose                              | Key Parameters          |
| ---------------------- | ------------------------------------ | ----------------------- |
| `menu.ps1`             | Interactive menu for full system mgmt| _(Run on PowerShell)_   |
| `backend/start.sh`     | Start Docker Compose system          | `--rebuild`, `--ngrok`  |
| `backend/stop.sh`      | Stop system + stop ngrok             | `--clean`               |
| `backend/reset.sh`     | Clean + restart from scratch         | `--force`, `--ngrok`    |
| `backend/health-check.sh` | Check system health (Parallel Fast)| _(none)_                |
| `backend/logs.sh`      | View container logs flexibly         | `--service`, `--tail`   |
| `backend/tests.sh`     | Run Unit & Parallel Smoke Test       | `--smoke`, `--all`      |
| `backend/validate-rabbitmq.sh` | Validate Zero-Loss RabbitMQ DLQ | _(none)_                |
| `backend/clickhouse-check.sh`  | Quick ClickHouse check (Multi-Query) | _(none)_      |
| `database/seed-up.sh`          | Seed data into Database              | `<service-name>`        |
| `database/seed-down.sh`        | Clean data from Database             | `<service-name>`        |
| `database/seed-reset.sh`       | Clean and reload all sample data     | `<service-name>`        |

---

### 1.0. Docker Native WSL Setup Guide (No Docker Desktop)

For the system to run stably without Docker Desktop (saves RAM and CPU), install Docker Engine directly into WSL:

1.  **Install Docker Engine (inside WSL):**

    ```bash
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose-v2
    sudo usermod -aG docker $USER
    ```

    _(Close and reopen WSL terminal after running this command)_

2.  **Disconnect from Windows Docker:**

    ```bash
    docker context use default
    ```

3.  **Auto-WSL Redirection Utility:**
    You can run backend scripts directly from **Git Bash, CMD, or PowerShell** on Windows. The script will automatically:
    - Detect Windows environment.
    - Translate current path to WSL format.
    - Auto-start Docker service (`sudo service docker start`) if needed.
    - Execute all logic inside WSL and return results to Windows terminal.

---

### 1.1. Start the System (`start.sh`)

Start the entire infrastructure (Docker containers, Volumes, Networks) and wait for all 18 containers to become `healthy`.
Default does not run ngrok. Add `--ngrok` to enable tunnel.

```bash
# Run from WSL Terminal
./deployment/scripts/backend/start.sh              # Normal start
./deployment/scripts/backend/start.sh --rebuild     # Force rebuild all images
./deployment/scripts/backend/start.sh --ngrok       # Start + ngrok tunnel
```

**start.sh workflow:**

1. Stop old containers (free ports)
2. Build images (if `--rebuild`)
3. Start Docker Compose
4. _(Optional - if `--ngrok`)_ Kill old ngrok → start ngrok → confirm tunnel via `localhost:4040`
5. Poll health check per container, timeout 120 seconds/container

> **ngrok requirement (only with `--ngrok`):** Install ngrok and login: `ngrok config add-authtoken <token>`
> Download at: https://ngrok.com/download

---

### 1.2. Stop the System (`stop.sh`)

```bash
./deployment/scripts/backend/stop.sh          # Stop containers + stop ngrok
./deployment/scripts/backend/stop.sh --clean   # Stop + PERMANENTLY DELETE all Volumes
```

Script automatically stops `ngrok` process if running.

---

### 1.3. Reset Entire System (`reset.sh`)

```bash
./deployment/scripts/backend/reset.sh               # Ask confirmation [y/N]
./deployment/scripts/backend/reset.sh --force        # No confirmation, execute immediately
./deployment/scripts/backend/reset.sh --ngrok        # Reset + start ngrok
./deployment/scripts/backend/reset.sh --force --ngrok  # Reset + start ngrok, no confirmation
```

---

### 1.4. Health Check (`health-check.sh`)

```bash
./deployment/scripts/backend/health-check.sh
```

**Results:**

- Check 11 HTTP endpoints (8 services + Kong + Kong Admin + RabbitMQ)
- Check ngrok tunnel via `http://localhost:4040/api/tunnels`
- Check 18 containers (status + health)
- Print `N OK  M ERROR`, exit code `1` if errors found

---

### 1.5. View System Logs (`logs.sh`)

This script supports viewing Docker Compose logs flexibly, allowing filtering by service, service group (PG/Infra) or limiting line count.

```bash
./deployment/scripts/backend/logs.sh                                  # View all system logs
./deployment/scripts/backend/logs.sh --pg                            # View all 6 PostgreSQL database logs
./deployment/scripts/backend/logs.sh --infra                         # View infrastructure logs (Redis, RMQ, CH, Kong)
./deployment/scripts/backend/logs.sh --app                           # View all microservice logs
./deployment/scripts/backend/logs.sh --service iam-service            # View a specific service log
./deployment/scripts/backend/logs.sh --tail 500                       # View last 500 lines of all logs
```

**18 Supported Containers:**

- **App (8):** `iam-service`, `analytics-service`, `ev-infrastructure-service`, `session-service`, `billing-service`, `notification-service`, `telemetry-ingestion-service`, `ocpp-gateway-service`
- **Infra (4):** `ev-kong`, `ev-redis`, `ev-rabbitmq`, `ev-clickhouse`
- **DB (6):** `ev-pg-iam`, `ev-pg-infra`, `ev-pg-session`, `ev-pg-billing`, `ev-pg-notify`, `ev-pg-analytics`

---

### 1.6. Test System (`tests.sh`)

This script combines Unit Tests (code verification) and Smoke Tests (real API verification).

```bash
./deployment/scripts/backend/tests.sh                                  # Default: run all Unit Tests
./deployment/scripts/backend/tests.sh --unit --service iam-service     # Run Unit Tests for 1 service only
./deployment/scripts/backend/tests.sh --smoke                          # Run Smoke Tests via Gateway
./deployment/scripts/backend/tests.sh --all                            # Run both Unit and Smoke Tests
./deployment/scripts/backend/tests.sh --smoke --gateway "http://alt:8000" # Smoke test with custom gateway
```

**Smoke Test Endpoints Details:**

| Service        | Endpoint                                       | Result |
| -------------- | ---------------------------------------------- | ------ |
| IAM            | `POST /api/v1/auth/register` (missing body)    | `400`  |
| Infrastructure | `GET /api/v1/stations` (public)                | `200`  |
| Session        | `POST /api/v1/bookings` (no token)             | `401`  |
| Billing        | `GET /api/v1/wallets/balance` (no token)       | `401`  |
| Notification   | `GET /api/v1/notifications` (no token)         | `401`  |
| Analytics      | `GET /api/v1/analytics/dashboard` (no token)   | `401`  |
| Telemetry      | `POST /api/v1/telemetry/ingest` (missing body) | `400`  |
| OCPP Gateway   | `GET /api/v1/ocpp/health`                      | `200`  |

> Script skips (`SKIP`) services without `node_modules` or `*.spec.ts` files.

**Services tested:** `iam-service`, `ev-infrastructure-service`, `session-service`, `billing-service`, `notification-service`, `analytics-service`, `telemetry-ingestion-service`, `ocpp-gateway-service`

---

### 1.8. Validate RabbitMQ (`validate-rabbitmq.sh`)

```bash
./deployment/scripts/backend/validate-rabbitmq.sh
```

| Status                      | Meaning                                           |
| --------------------------- | ------------------------------------------------- |
| `[V] VALIDATION PASSED`     | 100% messages processed, no data loss             |
| `[!] PASSED WITH WARNING`   | No lost messages but pending in queue             |
| `[X] VALIDATION FAILED`     | Messages in DLQ - check consumer logs             |

> **Default credentials:** `ev_user:ev_secret` (configured in `deployment/docker/.env`)

---

### 1.9. Check ClickHouse (`clickhouse-check.sh`)

```bash
./deployment/scripts/backend/clickhouse-check.sh
```

> Requirement: Docker daemon running (Native WSL) and `ev-clickhouse` container exists.
> Script runs via `docker exec clickhouse-client` (does not use HTTP port).

**Check Items:**

| Item          | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| [1] Container | `ev-clickhouse` Docker health status                          |
| [2] Ping      | `SELECT 1` via clickhouse-client                              |
| [3] Version   | `SELECT version()`                                            |
| [4] Database  | `ev_telemetry` created                                        |
| [5] Table     | `telemetry_logs` - row count, partitions, TTL                 |
| [6] Service   | `http://localhost:3009/health` clickhouse connection status   |

**Exit codes:**

- `exit 0` - All OK (may have WARNINGS)
- `exit 1` - Critical errors (container down, service error)

---

### 1.10. Seed Data Management

Two scripts `seed-up.sh` and `seed-down.sh` automate loading and removing sample data for services. Scripts run in dependency order (IAM -> Infra -> Billing -> Session -> Analytics -> Notification).

```bash
# Load sample data for all system
./deployment/scripts/database/seed-up.sh

# Load sample data for a specific service
./deployment/scripts/database/seed-up.sh iam-service

# Remove all sample data (Rollback)
./deployment/scripts/database/seed-down.sh

# Remove sample data for a specific service
./deployment/scripts/database/seed-down.sh iam-service

# Clean and reload all data (Reset)
./deployment/scripts/database/seed-reset.sh

# Reset sample data for a specific service
./deployment/scripts/database/seed-reset.sh iam-service
```

> **Note:** Database containers must be running before loading data. Data is inserted directly via `psql` inside the container.

---

## PART 2 - FRONTEND (Flutter Mobile App)

> **Additional requirements:** Flutter SDK installed and in `PATH`.

### Overview

| Script      | Purpose                          | Key Parameters                                          |
| ----------- | -------------------------------- | ------------------------------------------------------- |
| `setup.ps1` | First-time environment setup     | `-GenKeystore`, `-SkipDoctor`                           |
| `run.ps1`   | Run app on device/emulator       | `-Flavor`, `-Device`, `-ApiUrl`, `-Release`             |
| `build.ps1` | Build APK / AAB / IPA            | `-Target`, `-Flavor`, `-Release`, `-Analyze`, `-Clean`  |
| `test.ps1`  | Run unit test + coverage         | `-Coverage`, `-Filter`, `-Widget`                       |

---

### 2.1. Environment Setup (`setup.ps1`)

Run **once** when cloning the project or setting up a new machine.

```powershell
.\deployment\scripts\frontend\setup.ps1                # Check environment + pub get
.\deployment\scripts\frontend\setup.ps1 -GenKeystore   # Generate Android signing keystore
.\deployment\scripts\frontend\setup.ps1 -SkipDoctor    # Skip flutter doctor
```

**Script steps:**

1. Check Flutter SDK version
2. Run `flutter doctor -v` (unless `-SkipDoctor`)
3. Run `flutter pub get`
4. Check ADB + connected devices
5. Check `google-services.json` (Firebase)
6. Check `android/key.properties` (signing)
7. _(Optional)_ Generate release keystore with `keytool`

> **Security:** `android/key.properties` and `*.keystore` are added to `.gitignore`. **Do not commit to git.**

---

### 2.2. Run App (`run.ps1`)

Script **auto-detects ngrok URL** (prefers ngrok URL when running dev) instead of localhost.

```powershell
# Run dev - auto-detect ngrok URL if ngrok is running
.\deployment\scripts\frontend\run.ps1

# Specify API URL (real device + backend local)
.\deployment\scripts\frontend\run.ps1 -ApiUrl http://192.168.1.100:8000

# Use fixed ngrok URL
.\deployment\scripts\frontend\run.ps1 -ApiUrl https://impeditive-incredible-jordy.ngrok-free.dev

# Android Emulator (10.0.2.2 = host localhost)
.\deployment\scripts\frontend\run.ps1 -ApiUrl http://10.0.2.2:8000

# Specify specific device ID
.\deployment\scripts\frontend\run.ps1 -Device 5137bf8c

# Run release mode
.\deployment\scripts\frontend\run.ps1 -Flavor staging -Release
```

**Flavors & Application ID:**

| Flavor    | Application ID                           | Default API URL                                  |
| --------- | ---------------------------------------- | ------------------------------------------------ |
| `dev`     | `com.evcharging.ev_charging_app.dev`     | Auto-detect ngrok -> `http://localhost:8000`     |
| `staging` | `com.evcharging.ev_charging_app.staging` | `http://staging.ev-charging.local:8000`          |
| `prod`    | `com.evcharging.ev_charging_app`         | `https://api.ev-charging.vn`                     |

> **API URL priority when flavor=dev:**
>
> 1. `-ApiUrl` parameter (if provided)
> 2. Ngrok tunnel (auto-fetch via `http://localhost:4040/api/tunnels`)
> 3. `http://localhost:8000` (fallback)

---

### 2.3. Build App (`build.ps1`)

```powershell
# APK debug (dev)
.\deployment\scripts\frontend\build.ps1

# APK release staging with analyze
.\deployment\scripts\frontend\build.ps1 -Target apk -Flavor staging -Release -Analyze

# AAB production release - upload to Google Play Console
.\deployment\scripts\frontend\build.ps1 -Target appbundle -Flavor prod -Release

# Clean build from scratch
.\deployment\scripts\frontend\build.ps1 -Target apk -Flavor dev -Clean
```

| Parameter  | Value                         | Description                                       |
| ---------- | ----------------------------- | ------------------------------------------------- |
| `-Target`  | `apk` \| `appbundle` \| `ipa` | Output artifact type                              |
| `-Flavor`  | `dev` \| `staging` \| `prod`  | Build flavor                                      |
| `-Release` | switch                        | Enable minify + shrink + obfuscate                |
| `-Analyze` | switch                        | Run `flutter analyze` before build                |
| `-Clean`   | switch                        | Run `flutter clean` + `pub get` before            |
| `-ApiUrl`  | string                        | Override API URL (default: auto-detect ngrok)     |

**With `-Release`:**

- `--obfuscate` + `--split-debug-info=build/debug-info/<flavor>/`
- Signing from `android/key.properties`
- Artifact: `build/app/outputs/bundle/<flavor>Release/*.aab`

---

### 2.4. Run Tests (`test.ps1`)

```powershell
.\deployment\scripts\frontend\test.ps1                      # All unit tests
.\deployment\scripts\frontend\test.ps1 -Coverage            # Coverage report
.\deployment\scripts\frontend\test.ps1 -Filter "Booking"    # Filter tests by name
.\deployment\scripts\frontend\test.ps1 -Widget              # Include widget tests
.\deployment\scripts\frontend\test.ps1 -Coverage -Widget -Filter "Auth"
```

**Coverage report:** `coverage/lcov.info` - prints % lines covered. HTML report: `choco install lcov` -> `coverage/html/index.html`

---

## Recommended Workflows

### First-time project startup (Full Stack)

```powershell
# 1. Setup Flutter environment (PowerShell)
.\deployment\scripts\frontend\setup.ps1 -GenKeystore

# 2. Start backend (WSL Terminal)
./deployment/scripts/backend/start.sh

# 3. Confirm backend is healthy (WSL Terminal)
./deployment/scripts/backend/health-check.sh

# 4. Run Flutter app (PowerShell)
.\deployment\scripts\frontend\run.ps1
```

### Start with Ngrok (real devices)

```powershell
# Start backend + ngrok tunnel (WSL Terminal)
./deployment/scripts/backend/start.sh --ngrok

# Run Flutter app - auto-detect ngrok URL (PowerShell)
.\deployment\scripts\frontend\run.ps1
```

### Before demo / submission

```powershell
# Reset backend clean, rebuild (WSL Terminal)
./deployment/scripts/backend/reset.sh --force

# Verify no lost events (WSL Terminal)
./deployment/scripts/backend/validate-rabbitmq.sh

# Run backend tests (WSL Terminal)
./deployment/scripts/backend/tests.sh

# Run frontend tests (PowerShell)
.\deployment\scripts\frontend\test.ps1 -Coverage

# Build AAB production (PowerShell)
.\deployment\scripts\frontend\build.ps1 -Target appbundle -Flavor prod -Release -Analyze

# Test via ngrok (WSL Terminal)
./deployment/scripts/backend/tests.sh --smoke --gateway "https://impeditive-incredible-jordy.ngrok-free.dev"
```

### Debug backend errors (WSL Terminal)

```bash
./deployment/scripts/backend/health-check.sh          # Check containers + HTTP
./deployment/scripts/backend/logs.sh --service ev-iam  # View failing service logs
./deployment/scripts/backend/tests.sh --smoke         # Test routing via Kong
./deployment/scripts/backend/reset.sh --force         # Reset if unfixable
```

### Debug frontend errors

```powershell
flutter devices                                                                    # Check available devices
.\deployment\scripts\frontend\test.ps1                                    # Run unit tests
.\deployment\scripts\frontend\run.ps1 -ApiUrl http://10.0.2.2:8000       # Run on emulator
.\deployment\scripts\frontend\run.ps1 -ApiUrl https://impeditive-incredible-jordy.ngrok-free.dev
flutter analyze                                                                    # Check code errors
```

---

## Network & Endpoints

### Backend

| Service                | URL                                                  | Notes                       |
| ---------------------- | ---------------------------------------------------- | --------------------------- |
| Kong Gateway (API)     | `http://localhost:8000`                              | All API clients go through  |
| Ngrok Tunnel           | `https://impeditive-incredible-jordy.ngrok-free.dev` | Public URL for real devices |
| Ngrok Dashboard        | `http://localhost:4040`                              | View ngrok request logs     |
| Kong Admin             | `http://localhost:8001`                              | Manage routes/plugins       |
| RabbitMQ UI            | `http://localhost:15672`                             | Credentials: `guest/guest`  |
| IAM Service            | `http://localhost:3001/health`                       |                             |
| Analytics Service      | `http://localhost:3002/health`                       |                             |
| Infrastructure Service | `http://localhost:3003/health`                       |                             |
| Session Service        | `http://localhost:3004/health`                       |                             |
| Billing Service        | `http://localhost:3007/health`                       |                             |
| Notification Service   | `http://localhost:3008/health`                       |                             |
| Telemetry Service      | `http://localhost:3009/health`                       |                             |
| OCPP Gateway           | `http://localhost:3010/health`                       |                             |

### Frontend - API URL by Environment

| Environment     | Real Device                                          | Android Emulator       |
| --------------- | ---------------------------------------------------- | ---------------------- |
| Dev (recommended)| `https://impeditive-incredible-jordy.ngrok-free.dev` | `http://10.0.2.2:8000` |
| Dev (LAN)       | `http://192.168.x.x:8000`                            | `http://10.0.2.2:8000` |
| Staging         | `http://staging.ev-charging.local:8000`              | -                      |
| Production      | `https://api.ev-charging.vn`                         | -                      |
