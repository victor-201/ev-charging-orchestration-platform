import {
  StationDetail,
  ChargerInfo,
  ChargingSession,
  StopSessionResponse,
  PricingInfo,
  PaymentCreateResponse,
  AvailabilitySlot
} from "../entities/entities";

export interface IStationRepository {
  getStationDetail(stationId: string): Promise<StationDetail>;
  getStationChargers(stationId: string): Promise<ChargerInfo[]>;
}

export interface ISessionRepository {
  getActiveSession(chargerId: string): Promise<ChargingSession | null>;
  startChargingSession(chargerId: string, bookingId?: string, qrToken?: string): Promise<ChargingSession>;
  stopChargingSession(sessionId: string, endMeterWh?: number): Promise<StopSessionResponse>;
  getSession(sessionId: string): Promise<ChargingSession>;
  getLatestTelemetry(sessionId: string): Promise<any>;
}

export interface IPricingRepository {
  getPricing(stationId: string, chargerId: string, connectorType?: string): Promise<PricingInfo>;
}

export interface IPaymentRepository {
  createVnpayPayment(amount: number, sessionId?: string): Promise<PaymentCreateResponse>;
}

export interface IBookingRepository {
  getAvailabilitySlots(chargerId: string, date: string): Promise<AvailabilitySlot[]>;
}
