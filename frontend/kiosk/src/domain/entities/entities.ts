/**
 * EVOLTTOUCH Kiosk — Domain Entities
 *
 * Core business models free of database or network concerns.
 */

// ---- Session & Charging ----

/** Mirrors charging_sessions_status_enum from session DB */
export type SessionStatus = 
  | 'INIT'
  | 'SCAN_QR'       // Kiosk scanning booking QR from user's phone
  | 'RESERVED' 
  | 'NOTICE' 
  | 'ACTIVE' 
  | 'STOPPED' 
  | 'BILLED' 
  | 'MAINTENANCE' 
  | 'ERROR' 
  | 'OFFLINE';

/** Mirrors charger_state_availability_enum */
export type ChargerAvailability = 'available' | 'occupied' | 'faulted' | 'offline' | 'reserved';

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  isBooked: boolean;
  pricePerKwhVnd?: number;
  isPeakHour?: boolean;
}

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
  /** SOC % at the moment charging started — seeded from OCPP StartTransaction */
  startSocPercent?: number | null;
  createdAt: string;
  stationName?: string | null;
  cityName?: string | null;
  connectorType?: string | null;
  maxPowerKw?: number | null;
  energyKwh?: number;
  amountDue?: number;
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

// ---- Station / Charger ----

export interface StationDetail {
  id: string;
  name: string;
  address: string;
  cityId?: string;
  latitude?: number;
  longitude?: number;
  status: string;
  ownerId?: string | null;
  ownerName?: string | null;
  totalChargers?: number;
  availableChargers?: number;
  chargers: ChargerInfo[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ConnectorInfo {
  id: string;
  connectorType: string;
  maxPowerKw: number;
}

/** A charger/pillar at a station */
export interface ChargerInfo {
  id: string;
  name?: string;
  externalId?: string | null;
  stationId?: string;
  maxPowerKw?: number;
  status?: string;
  connectors?: ConnectorInfo[];
  updatedAt?: string;
}

// ---- Kiosk Config ----

/** Env-based config loaded at startup */
export interface KioskConfig {
  apiBaseUrl: string;
  wsUrl: string;
  stationId: string;
  chargerId: string;
}

// ---- WebSocket Message ----

/** WS message envelope from Kong Gateway */
export interface WsMessage {
  type: 'telemetry' | 'session_update' | 'charger_status' | 'ping';
  payload: TelemetryPayload | Record<string, unknown>;
}
