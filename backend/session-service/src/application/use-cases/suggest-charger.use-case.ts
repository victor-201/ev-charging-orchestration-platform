import { Inject, Injectable } from '@nestjs/common';
import {
  IChargerRepository,
  CHARGER_REPOSITORY,
} from '../../domain/repositories/charger.repository.interface';
import {
  IBookingRepository,
  BOOKING_REPOSITORY,
} from '../../domain/repositories/booking.repository.interface';
import { PricingHttpClient } from '../../infrastructure/http/pricing.http-client';
import { SuggestChargerDto } from '../dtos/booking.dto';
import { SuggestChargerResponseDto } from '../dtos/response.dto';

interface KnapsackItem {
  slot: { startTime: Date; endTime: Date };
  weight: number; // cost in thousands of VND
  value: number;  // utility
  pricePerKwh: number;
}

/**
 * SuggestChargerUseCase
 *
 * Implements charger selection and optimal slot scheduling for users.
 * Solves a 0/1 Knapsack problem using dynamic programming to maximize charging utility
 * under user-defined budget and time constraints.
 *
 * Layer: Application / Use Case
 */
@Injectable()
export class SuggestChargerUseCase {
  constructor(
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    private readonly pricingHttpClient: PricingHttpClient,
  ) {}

  /**
   * Identifies and ranks optimal charger suggestions.
   *
   * @param dto - Search criteria including coordinates, budget, and time window
   * @param userId - Requesting user identifier
   * @returns Ranked array of suggested chargers and scores
   */
  async execute(
    dto: SuggestChargerDto,
    userId: string,
    userLat?: number,
    userLng?: number,
  ): Promise<SuggestChargerResponseDto[]> {
    // Default to Hanoi center coordinates if user location is undefined.
    const lat = dto.latitude ?? userLat ?? 21.0285;
    const lng = dto.longitude ?? userLng ?? 105.8542;

    const start = new Date(dto.startTime || new Date());
    // Ensure we start from current time if start is in the past to prevent stale slots.
    const now = new Date();
    const cleanStart = start < now ? now : start;
    const end = new Date(dto.endTime || new Date(cleanStart.getTime() + 4 * 3600 * 1000));

    const slots: { startTime: Date; endTime: Date }[] = [];
    let currentStart = new Date(cleanStart);
    while (currentStart.getTime() + 30 * 60 * 1000 <= end.getTime()) {
      const nextEnd = new Date(currentStart.getTime() + 30 * 60 * 1000);
      slots.push({ startTime: new Date(currentStart), endTime: nextEnd });
      currentStart = nextEnd;
    }

    if (slots.length === 0) {
      return [];
    }

    const chargers = await this.chargerRepo.findAvailableByStation(
      undefined,
      dto.connectorType,
    );

    if (chargers.length === 0) {
      return [];
    }

    const chargerIds = chargers.map((c) => c.id);
    const bookings = await this.bookingRepo.findUpcomingByChargers(chargerIds);

    const stationCoordsCache = new Map<string, { latitude: number; longitude: number }>();
    const chargerDistances = new Map<string, number>();

    for (const charger of chargers) {
      if (!stationCoordsCache.has(charger.stationId)) {
        const coords = await this.pricingHttpClient.getStationCoordinates(charger.stationId);
        stationCoordsCache.set(charger.stationId, coords);
      }
      const coords = stationCoordsCache.get(charger.stationId)!;
      const distance = this.haversineDistance(lat, lng, coords.latitude, coords.longitude);
      chargerDistances.set(charger.id, distance);
    }

    // Scale budget in VND to thousands to keep the dynamic programming table dimensions manageable.
    const budgetVnd = dto.budgetVnd ?? 150000;
    const W = Math.max(1, Math.round(budgetVnd / 1000));

    const candidatesList: {
      chargerId: string;
      stationId: string;
      score: number;
      selectedSlots: KnapsackItem[];
      distance: number;
    }[] = [];

    for (const charger of chargers) {
      const knapsackItems: KnapsackItem[] = [];

      for (const slot of slots) {
        const isBooked = bookings.some(
          (b) =>
            b.chargerId === charger.id &&
            b.timeRange.startTime < slot.endTime &&
            b.timeRange.endTime > slot.startTime,
        );

        if (isBooked) {
          continue;
        }

        const quote = await this.pricingHttpClient.getPricing({
          stationId: charger.stationId,
          chargerId: charger.id,
          connectorType: dto.connectorType,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });

        const costVnd = quote.pricePerKwhVnd * charger.maxPowerKw * 0.5;
        const weight = Math.max(1, Math.round(costVnd / 1000));

        const stationChargers = chargers.filter((c) => c.stationId === charger.stationId);
        const occupiedCount = stationChargers.filter((c) =>
          bookings.some(
            (b) =>
              b.chargerId === c.id &&
              b.timeRange.startTime < slot.endTime &&
              b.timeRange.endTime > slot.startTime,
          ),
        ).length;
        const totalCount = stationChargers.length || 1;
        const load = occupiedCount / totalCount;

        // Reduce utility value for congested stations to distribute charging demand across stations.
        const value = charger.maxPowerKw * 0.5 * (1.0 - 0.5 * load);

        knapsackItems.push({
          slot,
          weight,
          value,
          pricePerKwh: quote.pricePerKwhVnd,
        });
      }

      if (knapsackItems.length === 0) {
        continue;
      }

      const { selectedItems, totalValue } = this.solveKnapsack(knapsackItems, W);

      if (selectedItems.length > 0) {
        const distance = chargerDistances.get(charger.id) ?? 5.0;
        // Balance utility score against distance to prioritize closer chargers without discarding high-utility options.
        const score = Number((totalValue / (distance + 0.1)).toFixed(3));

        candidatesList.push({
          chargerId: charger.id,
          stationId: charger.stationId,
          score,
          selectedSlots: selectedItems,
          distance,
          // Prevent division by zero if station is located at user coordinates
        });
      }
    }

    candidatesList.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 0.001) {
        return b.score - a.score;
      }
      return a.distance - b.distance;
    });

    const limit = 5;
    const topCandidates = candidatesList.slice(0, limit);
    const slotsToSave: any[] = [];

    for (const cand of topCandidates) {
      for (const item of cand.selectedSlots) {
        slotsToSave.push({
          chargerId: cand.chargerId,
          userId,
          vehicleId: null,
          suggestedStart: item.slot.startTime,
          suggestedEnd: item.slot.endTime,
          confidenceScore: cand.score,
          algorithm: 'dp-optimizer',
        });
      }
    }

    // Persist scheduling recommendations to reserve slots temporarily and analyze recommendation history.
    if (slotsToSave.length > 0) {
      await this.bookingRepo.saveSchedulingSlots(slotsToSave);
    }

    return topCandidates.map((cand, idx) => ({
      chargerId: cand.chargerId,
      stationId: cand.stationId,
      score: cand.score,
      rank: idx + 1,
    }));
  }

  private solveKnapsack(
    items: KnapsackItem[],
    W: number,
  ): { selectedItems: KnapsackItem[]; totalValue: number } {
    const n = items.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      const item = items[i - 1];
      for (let j = 0; j <= W; j++) {
        if (item.weight <= j) {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i - 1][j - item.weight] + item.value);
        } else {
          dp[i][j] = dp[i - 1][j];
        }
      }
    }

    const selectedItems: KnapsackItem[] = [];
    let w = W;
    for (let i = n; i > 0; i--) {
      if (dp[i][w] !== dp[i - 1][w]) {
        const item = items[i - 1];
        selectedItems.push(item);
        w -= item.weight;
      }
    }

    return {
      selectedItems: selectedItems.reverse(),
      totalValue: dp[n][W],
    };
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
