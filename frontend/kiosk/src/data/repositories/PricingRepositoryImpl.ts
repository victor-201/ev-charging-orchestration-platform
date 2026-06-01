import { IPricingRepository } from "../../domain/repositories/repository.interfaces";
import { PricingInfo } from "../../domain/entities/entities";
import { apiClient } from "../sources/apiClient";
import { StationRepositoryImpl } from "./StationRepositoryImpl";

export class PricingRepositoryImpl implements IPricingRepository {
  private readonly stationRepo = new StationRepositoryImpl();

  async getPricing(
    stationId: string,
    chargerId: string,
    connectorType?: string
  ): Promise<PricingInfo> {
    let resolvedType = connectorType;
    let resolvedPointId = '';

    if (chargerId && stationId) {
      try {
        const chargers = await this.stationRepo.getStationChargers(stationId);
        for (const c of chargers) {
          if (c.connectors) {
            const matched = c.connectors.find(conn => conn.id === chargerId);
            if (matched) {
              resolvedPointId = c.id; // Map connector ID (chargerId) to physical Charging Point ID
              if (!resolvedType) {
                resolvedType = matched.connectorType;
              }
              break;
            }
          }
        }
      } catch (err) {
        console.warn('[Kiosk] Could not dynamically resolve pricing identifiers:', err);
      }
    }

    if (!resolvedPointId) {
      resolvedPointId = chargerId; // Fallback to chargerId if not resolved
    }
    if (!resolvedType) {
      resolvedType = 'CCS';
    }

    const now = new Date().toISOString();
    const { data } = await apiClient.get<any>(
      `/stations/${stationId}/chargers/${resolvedPointId}/pricing`,
      {
        params: {
          connectorType: resolvedType,
          startTime: now,
          endTime: now,
        },
      }
    );
    return {
      pricePerKwh: data.pricePerKwhVnd ?? data.pricePerKwh ?? 0,
      idleFeePerMinute: data.idleFeePerMinuteVnd ?? data.idleFeePerMinute ?? 0,
      totalEstimateVnd: data.estimatedTotalVnd ?? data.totalEstimateVnd ?? 0,
    };
  }
}
