import { ISessionRepository } from "../../domain/repositories/repository.interfaces";
import { ChargingSession, StopSessionResponse } from "../../domain/entities/entities";
import { apiClient } from "../sources/apiClient";

export class SessionRepositoryImpl implements ISessionRepository {
  async getActiveSession(chargerId: string): Promise<ChargingSession | null> {
    try {
      const { data } = await apiClient.get<ChargingSession>(
        `/charging/charger/${chargerId}/active`
      );
      return data;
    } catch {
      return null;
    }
  }

  async startChargingSession(
    chargerId: string,
    bookingId?: string,
    qrToken?: string
  ): Promise<ChargingSession> {
    const { data } = await apiClient.post<ChargingSession>('/charging/start', {
      chargerId,
      ...(bookingId && { bookingId }),
      ...(qrToken && { qrToken }),
      startMeterWh: 0,
    });
    return data;
  }

  async stopChargingSession(
    sessionId: string,
    endMeterWh?: number
  ): Promise<StopSessionResponse> {
    const { data } = await apiClient.post<StopSessionResponse>(
      `/charging/stop/${sessionId}`,
      {
        ...(endMeterWh !== undefined && { endMeterWh }),
        reason: 'kiosk_user_stop',
      }
    );
    return data;
  }

  async getSession(sessionId: string): Promise<ChargingSession> {
    const { data } = await apiClient.get<ChargingSession>(`/charging/session/${sessionId}`);
    return data;
  }

  async getLatestTelemetry(sessionId: string): Promise<any> {
    const { data } = await apiClient.get<any>(`/charging/telemetry/${sessionId}`);
    return data;
  }
}
