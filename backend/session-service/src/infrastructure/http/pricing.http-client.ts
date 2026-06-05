import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface PricingQuote {
  stationId:            string;
  chargerId:            string;
  connectorType:        string;
  pricePerKwhVnd:       number;
  pricePerMinuteVnd:    number;
  isPeakHour:           boolean;
  isOffPeakHour:        boolean;
  estimatedTotalVnd:    number;
  recommendedDepositVnd: number;
  ruleId:               string | null;
  currency:             string;
}

/**
 * PricingHttpClient
 *
 * Interfaces with station-service to fetch live pricing and coordinate data.
 * Booking-service uses this to dynamically calculate deposit requirements at booking time.
 *
 * Layer: Infrastructure / Adapter
 * Base URL resolved from env variable: STATION_SERVICE_URL (defaults to http://station-service:3003)
 */
@Injectable()
export class PricingHttpClient {
  private readonly logger = new Logger(PricingHttpClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get('STATION_SERVICE_URL', 'http://station-service:3003');
  }

  async getPricing(opts: {
    stationId:     string;
    chargerId:     string;
    connectorType: string;
    startTime:     Date;
    endTime:       Date;
  }): Promise<PricingQuote> {
    const url = `${this.baseUrl}/api/v1/stations/${opts.stationId}/chargers/${opts.chargerId}/pricing`;
    const params = {
      connectorType: opts.connectorType,
      startTime:     opts.startTime.toISOString(),
      endTime:       opts.endTime.toISOString(),
    };

    try {
      const resp = await firstValueFrom(
        this.http.get(url, { params, timeout: 3000 }),
      );
      const data = resp.data as PricingQuote;
      this.logger.debug(
        `Pricing: charger=${opts.chargerId} connector=${opts.connectorType} ` +
        `price=${data.pricePerKwhVnd}VND/kWh deposit=${data.recommendedDepositVnd}VND`,
      );
      return data;
    } catch (err: any) {
      this.logger.error(
        `Pricing HTTP error (charger=${opts.chargerId}): ${err.message}. Using fallback.`,
      );
      // Fallback to static pricing rules if the remote station service is unreachable.
      return this.fallbackPricing(opts);
    }
  }

  async getStationCoordinates(stationId: string): Promise<{ latitude: number; longitude: number }> {
    const url = `${this.baseUrl}/api/v1/stations/${stationId}`;
    try {
      const resp = await firstValueFrom(
        this.http.get(url, { timeout: 3000 }),
      );
      const data = resp.data;
      if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        return { latitude: Number(data.latitude), longitude: Number(data.longitude) };
      }
      throw new Error('Invalid coordinates in station response');
    } catch (err: any) {
      this.logger.error(
        `Failed to fetch station coordinates (stationId=${stationId}): ${err.message}. Using fallback.`,
      );
      // Default to Hanoi center coordinates if remote fetch fails to allow suggestion execution.
      return { latitude: 21.0285, longitude: 105.8542 };
    }
  }

  /**
   * Calculates fallback pricing using standard regional rates.
   *
   * Applied only during network or server outages to ensure system availability
   * is not blocked by station-service downtime.
   */
  private fallbackPricing(opts: {
    chargerId:     string;
    stationId:     string;
    connectorType: string;
    startTime:     Date;
    endTime:       Date;
  }): PricingQuote {
    const hour = opts.startTime.getHours();
    const isPeak     = (hour >= 9 && hour < 12) || (hour >= 17 && hour < 20);
    const isOffPeak  = hour >= 22 || hour < 6;
    const pricePerKwhVnd = isPeak ? 4_500 : isOffPeak ? 2_500 : 3_500;
    const durationHours  = (opts.endTime.getTime() - opts.startTime.getTime()) / 3_600_000;
    // Assume standard 22kW charging speed at 85% efficiency for AC chargers.
    const estimatedKwh   = durationHours * 22 * 0.85;
    const estimatedTotal = Math.ceil(estimatedKwh * pricePerKwhVnd);
    const deposit        = Math.ceil(estimatedTotal * 1.2);

    return {
      stationId:             opts.stationId,
      chargerId:             opts.chargerId,
      connectorType:         opts.connectorType,
      pricePerKwhVnd,
      pricePerMinuteVnd:     0,
      isPeakHour:            isPeak,
      isOffPeakHour:         isOffPeak,
      estimatedTotalVnd:     estimatedTotal,
      recommendedDepositVnd: deposit,
      ruleId:                null,
      currency:              'VND',
    };
  }
}
