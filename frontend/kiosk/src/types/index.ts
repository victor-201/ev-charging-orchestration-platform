/**
 * EVOLTTOUCH Kiosk — Domain Types
 *
 * Aligned with backend database schema (01_database_schema.md)
 * and API endpoints (02_api_endpoints.md).
 */

// ---- Session & Charging ----

/** Mirrors charging_sessions_status_enum from session DB */
export type SessionStatus = 'INIT' | 'RESERVED' | 'NOTICE' | 'ACTIVE' | 'STOPPED' | 'BILLED' | 'MAINTENANCE' | 'ERROR';

/** Mirrors charger_state_availability_enum */
export type ChargerAvailability = 'available' | 'occupied' | 'faulted' | 'offline' | 'reserved';

/** Raw telemetry from session_telemetry table / WebSocket stream */
export interface TelemetryPayload {
  sessionId: string;
  socPercent: number;       // 0–100
  powerKw: number;
  meterWh: number;
  voltageV: number;
  currentA: number;
  temperatureC: number;
  recordedAt: string;
}

/** Processed telemetry used by UI */
export interface TelemetryData {
  soc: number;              // socPercent
  power: number;            // powerKw
  voltage: number;          // voltageV
  current: number;          // currentA
  temperature: number;      // temperatureC
  energyDelivered: number;  // (meterWh - startMeterWh) / 1000 → kWh
  estimatedCost: number;    // computed from pricePerKwh * kWh
  elapsedSeconds: number;   // time elapsed since start
}

/** Charging session DTO from API [62] POST /charging/start */
export interface ChargingSession {
  id: string;
  userId: string;
  chargerId: string;
  bookingId: string | null;
  startTime: string;
  status: string;
  startMeterWh: number;
  createdAt: string;
}

/** Charger state from charger_state table */
export interface ChargerState {
  chargerId: string;
  availability: ChargerAvailability;
  activeSessionId: string | null;
  errorCode: string | null;
  lastHeartbeatAt: string;
  updatedAt: string;
}

/** Session stop response from API [63] */
export interface StopSessionResponse {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
  totalKwh: number;
  totalCostVnd: number;
  stopReason: string;
}

// ---- Pricing ----

/** Pricing response from API [43] GET pricing */
export interface PricingInfo {
  pricePerKwh: number;      // VND
  idleFeePerMinute: number; // VND
  totalEstimateVnd: number;
}

// ---- Payment ----

/** VNPay payment URL from API [69] */
export interface PaymentCreateResponse {
  paymentUrl: string;
  txnRef: string;
}

// ---- Kiosk Config ----

/** Env-based config loaded at startup */
export interface KioskConfig {
  apiBaseUrl: string;
  wsUrl: string;
  stationId: string;
  chargerId: string;
  enableMockData: boolean;
}

// ---- WebSocket Message ----

/** WS message envelope from Kong Gateway */
export interface WsMessage {
  type: 'telemetry' | 'session_update' | 'charger_status' | 'ping';
  payload: TelemetryPayload | Record<string, unknown>;
}
