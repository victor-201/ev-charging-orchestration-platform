# EV Charging Orchestration Platform

> Design and Implementation of a Real-Time EV Charging Scheduling and Orchestration Platform.

A microservices-based system for EV charging management, supporting booking, queue handling, authentication, payment integration, telemetry ingestion, and analytics. Built with an event-driven architecture for scalability, high availability, and real-time system coordination.

## 🏗 System Architecture

This platform leverages a microservices architecture to ensure high availability, fault tolerance, and independent scalability. The system utilizes an Event-Driven architecture powered by RabbitMQ to loosely couple domains.

### Core Microservices

| Service | Port | Description |
|---|---|---|
| **IAM Service** | `:3001` | Handles authentication, authorization (RBAC), and user profile management. |
| **Analytics Service** | `:3002` | Generates business intelligence reports, dashboards, and platform-wide metrics. |
| **EV Infrastructure** | `:3003` | Manages physical charging stations, charger hardware endpoints, and geodata. |
| **Session Service** | `:3004` | Orchestrates active charging sessions, reservations, and waiting queue logic. |
| **Billing Service** | `:3007` | Manages user wallets, payment gateways, invoicing, and real-time costs. |
| **Notification Service** | `:3008` | Centralizes outgoing alerts (Push, SMS, Email) triggered by asynchronous events. |
| **Telemetry Ingestion** | `:3009` | High-throughput ingestion of hardware telemetry data pushed into ClickHouse. |
| **OCPP Gateway** | `:3010` | Proxies WebSocket connections (OCPP) from physical chargers into internal events. |

## 🛠 Technology Stack

- **API Gateway:** Kong API Gateway
- **Backend Framework:** Node.js, NestJS (TypeScript)
- **Primary Database:** PostgreSQL (Database-per-service pattern)
- **Analytical Database:** ClickHouse (Optimized for massive telemetry ingestion)
- **Message Broker:** RabbitMQ
- **Caching & Rate Limiting:** Redis
- **Observability:** Prometheus & Grafana
- **Containerization:** Docker & Docker Compose

## 🚀 Getting Started

### Prerequisites
- Docker Engine / Docker Desktop
- **WSL2 (Ubuntu)** for Backend Deployment (Bash scripts)
- **PowerShell** for Frontend Development (mobile-app)

### Deployment Commands

The platform provides an integrated suite of automation scripts. For detailed usage (flags like `--ngrok`, `--rebuild`), refer to the [Scripts Guide](docs/system/00_scripts_guide.md).

#### 1. Backend (Docker Microservices)
Run these from your **WSL Terminal**:
```bash
./deployment/scripts/backend/start.sh         # Start infrastructure & services
./deployment/scripts/backend/health-check.sh  # Verify system health
./deployment/scripts/backend/stop.sh          # Shutdown platform
```

#### 2. Frontend (Flutter Mobile App)
Run these from **PowerShell**:
```powershell
.\deployment\scripts\frontend\setup.ps1       # One-time environment setup
.\deployment\scripts\frontend\run.ps1         # Run app (Auto-detects Ngrok)
```

## 🌐 Access Points

Once the system completes its startup health checks, the following infrastructure UI and API entry points become available:

- **Kong Gateway (Public API Entry):** `http://localhost:8000`
- **Kong Admin API:** `http://localhost:8001`
- **RabbitMQ Management UI:** `http://localhost:15672` (Credentials: `guest` / `guest`)
- **Grafana Dashboards:** `http://localhost:9091` (if observability is enabled)
