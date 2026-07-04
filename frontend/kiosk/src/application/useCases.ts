import { StationRepositoryImpl } from "../data/repositories/StationRepositoryImpl";
import { SessionRepositoryImpl } from "../data/repositories/SessionRepositoryImpl";
import { PricingRepositoryImpl } from "../data/repositories/PricingRepositoryImpl";
import { PaymentRepositoryImpl } from "../data/repositories/PaymentRepositoryImpl";
import { BookingRepositoryImpl } from "../data/repositories/BookingRepositoryImpl";
import { 
  StationDetail, 
  ChargerInfo, 
  ChargingSession, 
  StopSessionResponse, 
  PricingInfo, 
  PaymentCreateResponse, 
  AvailabilitySlot 
} from "../domain/entities/entities";

export class GetStationDetailUseCase {
  private repo = new StationRepositoryImpl();
  execute(stationId: string): Promise<StationDetail> {
    return this.repo.getStationDetail(stationId);
  }
}

export class GetStationChargersUseCase {
  private repo = new StationRepositoryImpl();
  execute(stationId: string): Promise<ChargerInfo[]> {
    return this.repo.getStationChargers(stationId);
  }
}

export class GetActiveSessionUseCase {
  private repo = new SessionRepositoryImpl();
  execute(chargerId: string): Promise<ChargingSession | null> {
    return this.repo.getActiveSession(chargerId);
  }
}

export class GetLatestTelemetryUseCase {
  private repo = new SessionRepositoryImpl();
  execute(sessionId: string): Promise<any> {
    return this.repo.getLatestTelemetry(sessionId);
  }
}

export class StartSessionUseCase {
  private repo = new SessionRepositoryImpl();
  execute(chargerId: string, bookingId?: string, qrToken?: string): Promise<ChargingSession> {
    return this.repo.startChargingSession(chargerId, bookingId, qrToken);
  }
}

export class StopSessionUseCase {
  private repo = new SessionRepositoryImpl();
  execute(sessionId: string, endMeterWh?: number): Promise<StopSessionResponse> {
    return this.repo.stopChargingSession(sessionId, endMeterWh);
  }
}

export class GetPricingUseCase {
  private repo = new PricingRepositoryImpl();
  execute(stationId: string, chargerId: string, connectorType?: string): Promise<PricingInfo> {
    return this.repo.getPricing(stationId, chargerId, connectorType);
  }
}

export class CreateVnpayPaymentUseCase {
  private repo = new PaymentRepositoryImpl();
  execute(amount: number, sessionId?: string): Promise<PaymentCreateResponse> {
    return this.repo.createVnpayPayment(amount, sessionId);
  }
}

export class GetAvailabilitySlotsUseCase {
  private repo = new BookingRepositoryImpl();
  execute(chargerId: string, date: string): Promise<AvailabilitySlot[]> {
    return this.repo.getAvailabilitySlots(chargerId, date);
  }
}

