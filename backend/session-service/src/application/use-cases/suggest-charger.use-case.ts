import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SessionOrmEntity, ChargerStateOrmEntity } from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import {
  IChargerRepository,
  CHARGER_REPOSITORY,
} from '../../domain/repositories/charger.repository.interface';
import {
  IBookingRepository,
  BOOKING_REPOSITORY,
} from '../../domain/repositories/booking.repository.interface';
import { PricingHttpClient } from '../../infrastructure/http/pricing.http-client';
import { VehicleReadModelOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities';
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
 * Solves a 0/1 Knapsack problem using dynamic programming to maximise charging utility
 * under user-defined budget and time constraints.
 *
 * Personalisation:
 *   - Auto-resolves the requesting user's primary vehicle connector type and filters
 *     chargers to only those compatible with that vehicle, ensuring every suggestion is
 *     physically usable.
 *   - Returns enriched metadata (connectorType, maxPowerKw, estimatedPriceVnd, distanceKm)
 *     so the UI can display meaningful, vehicle-aware recommendation cards.
 *
 * Performance:
 *   - Station coordinate fetches and per-charger pricing calls are all parallelised
 *     with Promise.all to prevent sequential-HTTP timeouts in large deployments.
 *
 * Layer: Application / Use Case
 */
@Injectable()
export class SuggestChargerUseCase {
  private readonly logger = new Logger(SuggestChargerUseCase.name);

  constructor(
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    private readonly pricingHttpClient: PricingHttpClient,
    @InjectRepository(VehicleReadModelOrmEntity)
    private readonly vehicleRepo: Repository<VehicleReadModelOrmEntity>,
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    @InjectRepository(ChargerStateOrmEntity)
    private readonly chargerStateRepo: Repository<ChargerStateOrmEntity>,
  ) {}

  /**
   * Identifies and ranks optimal charger suggestions, filtered to the user's vehicle.
   *
   * @param dto - Search criteria including coordinates, budget, and time window
   * @param userId - Requesting user identifier
   * @returns Ranked array of suggested chargers with vehicle-aware metadata
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

    // ── Auto-resolve vehicle connector type ────────────────────────────────
    // If the client didn't specify a connector filter, look up the user's
    // primary vehicle so we only suggest chargers they can actually use.
    let resolvedConnectorType = dto.connectorType;
    let vehicleInfo: { connectorType: string; batteryCapacityKwh?: number } | null = null;

    if (!resolvedConnectorType) {
      const primaryVehicle = await this.vehicleRepo
        .createQueryBuilder('v')
        .where('v.owner_id = :userId', { userId })
        .andWhere('v.is_active = true')
        .orderBy('v.synced_at', 'DESC')
        .limit(1)
        .getOne();

      if (primaryVehicle && primaryVehicle.connectorType) {
        resolvedConnectorType = primaryVehicle.connectorType;
        vehicleInfo = { connectorType: primaryVehicle.connectorType };
        this.logger.debug(
          `Auto-resolved connector type ${resolvedConnectorType} from vehicle ${primaryVehicle.vehicleId} for user ${userId}`,
        );
      }
    }

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

    // Filter chargers by the resolved connector type (vehicle-aware)
    const chargers = await this.chargerRepo.findAvailableByStation(
      undefined,
      resolvedConnectorType,
    );

    if (chargers.length === 0) {
      return [];
    }

    // ── Step 1: Fetch ALL station coordinates IN PARALLEL ──────────────────
    // Deduplicate station IDs first to avoid redundant HTTP calls.
    const uniqueStationIds = [...new Set(chargers.map((c) => c.stationId))];
    const stationCoordsCache = new Map<string, { latitude: number; longitude: number }>();

    await Promise.all(
      uniqueStationIds.map(async (stationId) => {
        const coords = await this.pricingHttpClient.getStationCoordinates(stationId);
        stationCoordsCache.set(stationId, coords);
      }),
    );

    // ── Step 2: Pre-filter chargers by geographic proximity ────────────────
    // Only score chargers within 50 km, capped at 20 to bound pricing HTTP calls.
    const MAX_RADIUS_KM = 50;
    const MAX_CHARGERS_TO_SCORE = 20;

    const chargerDistances = new Map<string, number>();
    for (const charger of chargers) {
      const coords = stationCoordsCache.get(charger.stationId) ?? { latitude: lat, longitude: lng };
      const distance = this.haversineDistance(lat, lng, coords.latitude, coords.longitude);
      chargerDistances.set(charger.id, distance);
    }

    // Keep chargers within radius, nearest-first, capped at MAX_CHARGERS_TO_SCORE.
    let nearbyChargers = chargers
      .filter((c) => c.status !== 'offline' && c.status !== 'faulted')
      .filter((c) => (chargerDistances.get(c.id) ?? Infinity) <= MAX_RADIUS_KM)
      .sort((a, b) => (chargerDistances.get(a.id) ?? 0) - (chargerDistances.get(b.id) ?? 0))
      .slice(0, MAX_CHARGERS_TO_SCORE);

    if (nearbyChargers.length === 0) {
      // Fallback: use the nearest chargers regardless of radius when no local ones exist.
      nearbyChargers = [...chargers]
        .filter((c) => c.status !== 'offline' && c.status !== 'faulted')
        .sort((a, b) => (chargerDistances.get(a.id) ?? 0) - (chargerDistances.get(b.id) ?? 0))
        .slice(0, MAX_CHARGERS_TO_SCORE);
    }

    const nearbyChargerIds = nearbyChargers.map((c) => c.id);
    const bookings = await this.bookingRepo.findUpcomingByChargers(nearbyChargerIds);
    const activeSessions = await this.sessionRepo.find({
      where: {
        chargerId: In(nearbyChargerIds),
        status: 'active',
      },
    });

    // Build set of charger IDs that currently have an active session
    const activeSessionChargerIds = new Set(activeSessions.map((s) => s.chargerId));

    // Fetch real-time charger availability state
    const chargerStates = await this.chargerStateRepo.find({
      where: {
        chargerId: In(nearbyChargerIds),
      },
    });
    const chargerStateMap = new Map(chargerStates.map((s) => [s.chargerId, s]));

    // Filter out chargers that are permanently offline or faulted in real-time
    const activeNearbyChargers = nearbyChargers.filter((c) => {
      const state = chargerStateMap.get(c.id);
      if (state) {
        return state.availability !== 'offline' && state.availability !== 'faulted';
      }
      return true; // default to true if no state row exists
    });

    const freeNearbyChargers = activeNearbyChargers.filter((c) => !activeSessionChargerIds.has(c.id));
    const busyNearbyChargers = activeNearbyChargers.filter((c) => activeSessionChargerIds.has(c.id));

    // Score all active chargers to allow comparing available vs busy optimally
    const chargersToScore = activeNearbyChargers;
    this.logger.debug(
      `Suggest: ${freeNearbyChargers.length} free, ${busyNearbyChargers.length} busy → scoring all ${chargersToScore.length} active chargers`,
    );

    // Scale budget in VND to thousands to keep the dynamic programming table dimensions manageable.
    const budgetVnd = dto.budgetVnd ?? 150000;
    const W = Math.max(1, Math.round(budgetVnd / 1000));

    // ── Step 3: Score all chargers IN PARALLEL ─────────────────────────────
    // Each charger gets its pricing calls batched with Promise.all internally.
    const candidateResults = await Promise.all(
      chargersToScore.map(async (charger) => {
        // Filter out already-booked time slots for this charger.
        const freeSlots = slots.filter(
          (slot) =>
            !bookings.some(
              (b) =>
                b.chargerId === charger.id &&
                b.timeRange.startTime < slot.endTime &&
                b.timeRange.endTime > slot.startTime,
            ) &&
            !activeSessions.some((s) => {
              if (s.chargerId !== charger.id) return false;
              let estimatedEnd = s.scheduledStopAt
                ? new Date(s.scheduledStopAt)
                : new Date(s.startTime.getTime() + 2 * 60 * 60 * 1000);
              if (estimatedEnd.getTime() < now.getTime() + 30 * 60 * 1000) {
                estimatedEnd = new Date(now.getTime() + 30 * 60 * 1000);
              }
              return s.startTime < slot.endTime && estimatedEnd > slot.startTime;
            }),
        );

        if (freeSlots.length === 0) return null;

        // Fetch pricing for all free slots IN PARALLEL.
        const quotes = await Promise.all(
          freeSlots.map((slot) =>
            this.pricingHttpClient.getPricing({
              stationId: charger.stationId,
              chargerId: charger.id,
              connectorType: resolvedConnectorType || charger.connectorType,
              startTime: slot.startTime,
              endTime: slot.endTime,
            }),
          ),
        );

        // Compute station load factor to penalise congested stations.
        const stationChargers = nearbyChargers.filter((c) => c.stationId === charger.stationId);
        const referenceSlot = slots[0];
        const occupiedCount = stationChargers.filter((c) =>
          bookings.some(
            (b) =>
              b.chargerId === c.id &&
              b.timeRange.startTime < referenceSlot.endTime &&
              b.timeRange.endTime > referenceSlot.startTime,
          ) ||
          activeSessions.some((s) => s.chargerId === c.id),
        ).length;
        const load = occupiedCount / (stationChargers.length || 1);

        const knapsackItems: KnapsackItem[] = freeSlots.map((slot, i) => {
          const quote = quotes[i];
          const costVnd = quote.pricePerKwhVnd * charger.maxPowerKw * 0.5;
          const weight = Math.max(1, Math.round(costVnd / 1000));
          // Reduce utility for congested stations to distribute demand.
          const value = charger.maxPowerKw * 0.5 * (1.0 - 0.5 * load);
          return { slot, weight, value, pricePerKwh: quote.pricePerKwhVnd };
        });

        const { selectedItems, totalValue } = this.solveKnapsack(knapsackItems, W);
        if (selectedItems.length === 0) return null;

        // Compute estimated session cost from the selected slots.
        const estimatedPriceVnd = selectedItems.reduce((sum, item) => {
          const durationHours = (item.slot.endTime.getTime() - item.slot.startTime.getTime()) / 3_600_000;
          return sum + Math.round(item.pricePerKwh * charger.maxPowerKw * durationHours * 0.85);
        }, 0);

        const distance = chargerDistances.get(charger.id) ?? 5.0;
        // Balance utility score against distance to prioritize closer chargers without discarding high-utility options.
        const score = Number((totalValue / (distance + 0.1)).toFixed(3));
        return {
          chargerId: charger.id,
          stationId: charger.stationId,
          connectorType: charger.connectorType,
          maxPowerKw: charger.maxPowerKw,
          estimatedPriceVnd,
          score,
          selectedSlots: selectedItems,
          distance,
          earliestFreeSlotTime: freeSlots[0].startTime,
        };
      }),
    );

    // Filter null results (chargers with no free/scored slots).
    const candidatesList = candidateResults.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );

    // Filter to immediately available chargers if any exist
    const cleanStartMs = cleanStart.getTime();
    const immediateBufferMs = 5 * 60 * 1000; // 5 minutes
    const isAvailableNow = (c: typeof candidatesList[0]) => {
      const isFreeSlotImmediate = c.earliestFreeSlotTime.getTime() <= cleanStartMs + immediateBufferMs;
      if (!isFreeSlotImmediate) return false;
      if (activeSessionChargerIds.has(c.chargerId)) return false;
      const state = chargerStateMap.get(c.chargerId);
      if (state && (state.availability === 'occupied' || state.availability === 'reserved')) {
        return false;
      }
      return true;
    };

    const hasAvailableNow = candidatesList.some((c) => isAvailableNow(c));

    let rankedCandidates = candidatesList;
    if (hasAvailableNow) {
      rankedCandidates = candidatesList.filter((c) => isAvailableNow(c));
    }

    const getCompositeMetric = (c: typeof candidatesList[0]) => {
      const pref = dto.preference;
      if (pref === 'distance') {
        // Distance preference: prioritize distance, but ensure cost is optimized
        return c.distance * (1 + c.estimatedPriceVnd / 150000.0);
      }
      // Default / Cost preference: prioritize cost, but ensure reasonable distance
      return c.estimatedPriceVnd * (1 + c.distance / 25.0);
    };

    rankedCandidates.sort((a, b) => {
      const aAvail = isAvailableNow(a);
      const bAvail = isAvailableNow(b);

      if (aAvail && !bAvail) return -1;
      if (!aAvail && bAvail) return 1;

      if (aAvail && bAvail) {
        // Both available: sort by composite metric ascending
        const metricDiff = getCompositeMetric(a) - getCompositeMetric(b);
        if (Math.abs(metricDiff) > 0.001) {
          return metricDiff;
        }
        return b.score - a.score;
      } else {
        // Both busy:
        // 1. Wait time difference > 15 minutes gets absolute priority
        const timeDiff = a.earliestFreeSlotTime.getTime() - b.earliestFreeSlotTime.getTime();
        if (Math.abs(timeDiff) > 15 * 60 * 1000) {
          return timeDiff;
        }
        // 2. Otherwise, sort by composite metric
        const metricDiff = getCompositeMetric(a) - getCompositeMetric(b);
        if (Math.abs(metricDiff) > 0.001) {
          return metricDiff;
        }
        // 3. Fallback to wait time difference and score
        if (Math.abs(timeDiff) > 1000) {
          return timeDiff;
        }
        return b.score - a.score;
      }
    });

    const limit = 5;
    const topCandidates = rankedCandidates.slice(0, limit);

    // Normalise confidence scores to [0, 1] relative to the best candidate
    // so they fit NUMERIC(8,6) and carry meaningful semantic value.
    const maxScore = topCandidates.length > 0 ? topCandidates[0].score : 1;
    const slotsToSave: any[] = [];

    for (const cand of topCandidates) {
      const normalizedScore = maxScore > 0
        ? Math.min(1, Number((cand.score / maxScore).toFixed(6)))
        : 0;
      for (const item of cand.selectedSlots) {
        slotsToSave.push({
          chargerId: cand.chargerId,
          userId,
          vehicleId: null,
          suggestedStart: item.slot.startTime,
          suggestedEnd: item.slot.endTime,
          confidenceScore: normalizedScore,
          algorithm: 'dp-optimizer',
        });
      }
    }

    // Persist scheduling recommendations to reserve slots temporarily and analyze recommendation history.
    if (slotsToSave.length > 0) {
      await this.bookingRepo.saveSchedulingSlots(slotsToSave);
    }

    // Normalize score to a 0–100 percentage (best candidate = 100)
    // so clients always receive a human-readable confidence percentage.
    const bestRawScore = topCandidates.length > 0 ? topCandidates[0].score : 1;

    return topCandidates.map((cand, idx) => ({
      chargerId: cand.chargerId,
      stationId: cand.stationId,
      // score ∈ [0, 100] — percentage relative to the best candidate in this batch
      score: Number(Math.min(100, (cand.score / (bestRawScore || 1)) * 100).toFixed(1)),
      rank: idx + 1,
      connectorType: cand.connectorType,
      maxPowerKw: cand.maxPowerKw,
      estimatedPriceVnd: cand.estimatedPriceVnd,
      distanceKm: Number(cand.distance.toFixed(2)),
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
