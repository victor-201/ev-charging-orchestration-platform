import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Booking } from '../../domain/aggregates/booking.aggregate';
import { BookingTimeRange } from '../../domain/value-objects/booking-time-range.vo';
import {
  IBookingRepository,
  BOOKING_REPOSITORY,
  AvailabilitySlot,
} from '../../domain/repositories/booking.repository.interface';
import {
  IChargerRepository,
  CHARGER_REPOSITORY,
} from '../../domain/repositories/charger.repository.interface';
import { CreateBookingCommand } from '../commands/booking.commands';
import { BookingConflictException } from '../../domain/exceptions/booking.exceptions';
import { IEventBus, EVENT_BUS } from '../../infrastructure/messaging/event-bus.interface';
import { PricingHttpClient } from '../../infrastructure/http/pricing.http-client';

/**
 * CreateBookingUseCase - VinFast automation standard
 *
 * Flow:
 * 1. Validate connector type match charger (check charger read-model)
 * 2. Fetch pricing from station-service -> calculate dynamic depositAmount
 * 3. BEGIN TRANSACTION
 * 4. SELECT charger FOR UPDATE (row-level lock)
 * 5. Check overlap in active bookings
 * 6. Create Booking aggregate with depositAmount (auto-calculated)
 * 7. Emit BookingCreatedEvent + BookingDepositRequestedEvent (outbox)
 * 8. COMMIT
 *
 * Payment Service will listen to BookingDepositRequestedEvent and automatically
 * deduct deposit from wallet -> if successful emit PaymentCompleted -> Booking Service
 * automatically confirms booking and generates QR Token.
 *
 * If wallet balance insufficient -> Payment Service emits PaymentFailedEvent -> Notification
 * immediately (no waiting for 5 mins to expire).
 */
@Injectable()
export class CreateBookingUseCase {
  private readonly logger = new Logger(CreateBookingUseCase.name);

  /** Absolute minimum deposit = 50,000 VND */
  static readonly MIN_DEPOSIT_VND = 50_000;

  constructor(
    @Inject(BOOKING_REPOSITORY)
    private readonly bookingRepo: IBookingRepository,
    @Inject(CHARGER_REPOSITORY)
    private readonly chargerRepo: IChargerRepository,
    @Inject(EVENT_BUS)
    private readonly eventBus: IEventBus,
    private readonly dataSource: DataSource,
    private readonly pricingClient: PricingHttpClient,
  ) {}

  async execute(cmd: CreateBookingCommand): Promise<Booking> {
    const timeRange = new BookingTimeRange(
      new Date(cmd.startTime),
      new Date(cmd.endTime),
    );

    // STEP 1: Validate connector type matches charger
    const charger = await this.chargerRepo.findById(cmd.chargerId);
    if (!charger) {
      throw new BadRequestException(`Charger ${cmd.chargerId} does not exist`);
    }

    if (charger.status === 'offline') {
      throw new BadRequestException(`Charger ${cmd.chargerId} is offline`);
    }

    const hasConnector = charger.connectors.some(
      (c) => c.connectorType === cmd.connectorType,
    );
    if (!hasConnector) {
      const available = charger.connectors.map((c) => c.connectorType).join(', ');
      throw new BadRequestException(
        `Charger ${cmd.chargerId} does not have connector ${cmd.connectorType}. ` +
        `Available: ${available || 'None'}`,
      );
    }

    // STEP 2: Fetch pricing -> calculate depositAmount
    const pricing = await this.pricingClient.getPricing({
      stationId:     cmd.stationId,
      chargerId:     cmd.chargerId,
      connectorType: cmd.connectorType,
      startTime:     timeRange.startTime,
      endTime:       timeRange.endTime,
    });

    const depositAmount = pricing.recommendedDepositVnd;

    this.logger.log(
      `Pricing fetched: connector=${cmd.connectorType} price=${pricing.pricePerKwhVnd}VND/kWh ` +
      `estimated=${pricing.estimatedTotalVnd}VND deposit=${depositAmount}VND ` +
      `isPeak=${pricing.isPeakHour}`,
    );

    // STEP 3-7: Transaction
    return this.dataSource.transaction(async (manager: EntityManager) => {
      // Row-level lock
      await this.chargerRepo.lockForUpdate(cmd.chargerId, manager);

      // Overlap check
      const conflict = await this.bookingRepo.hasOverlap(
        cmd.chargerId,
        timeRange.startTime,
        timeRange.endTime,
        undefined,
        manager,
      );
      if (conflict) {
        throw new BookingConflictException(cmd.chargerId);
      }

      // Create aggregate - with connector type and pricing snapshot
      const booking = Booking.create({
        userId:        cmd.userId,
        chargerId:     cmd.chargerId,
        timeRange,
        depositAmount,
        connectorType: cmd.connectorType,
        pricePerKwhSnapshot: pricing.pricePerKwhVnd,
      });

      // Persist + outbox
      await this.bookingRepo.save(booking, manager);
      await this.eventBus.publishAll(booking.domainEvents, manager);
      booking.clearDomainEvents();

      this.logger.log(
        `Booking created: ${booking.id} charger=${cmd.chargerId} ` +
        `connector=${cmd.connectorType} deposit=${depositAmount}VND - awaiting payment`,
      );
      return booking;
    });
  }
}

/**
 * GetAvailabilityUseCase
 *
 * Returns list of 30-minute time slots in a day for a charger.
 * If a slot has an active booking, isBooked = true.
 * Each slot also includes pricePerKwhVnd for immediate display to user.
 */
@Injectable()
export class GetAvailabilityUseCase {
  static readonly SLOT_DURATION_MINUTES = 30;

  constructor(
    @Inject(BOOKING_REPOSITORY)
    private readonly bookingRepo: IBookingRepository,
    private readonly pricingClient: PricingHttpClient,
  ) {}

  async execute(
    chargerId: string,
    stationId: string,
    connectorType: string,
    date: Date,
  ): Promise<(AvailabilitySlot & { pricePerKwhVnd?: number; isPeakHour?: boolean })[]> {
    const bookings = await this.bookingRepo.findByChargerAndDate(chargerId, date);

    const slots: (AvailabilitySlot & { pricePerKwhVnd?: number; isPeakHour?: boolean })[] = [];
    const slotMs = GetAvailabilityUseCase.SLOT_DURATION_MINUTES * 60_000;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 30, 0, 0);

    for (let t = startOfDay.getTime(); t <= endOfDay.getTime(); t += slotMs) {
      const slotStart = new Date(t);
      const slotEnd   = new Date(t + slotMs);

      const isBooked = bookings.some(
        (b) =>
          b.timeRange.startTime < slotEnd &&
          b.timeRange.endTime   > slotStart,
      );

      // Calculate slot price (only if not booked) - based on time
      let pricePerKwhVnd: number | undefined;
      let isPeakHour: boolean | undefined;

      if (!isBooked && stationId && connectorType) {
        try {
          const pricing = await this.pricingClient.getPricing({
            stationId, chargerId, connectorType,
            startTime: slotStart, endTime: slotEnd,
          });
          pricePerKwhVnd = pricing.pricePerKwhVnd;
          isPeakHour     = pricing.isPeakHour;
        } catch {
          // If pricing error, do not block availability
        }
      }

      slots.push({ startTime: slotStart, endTime: slotEnd, isBooked, pricePerKwhVnd, isPeakHour });
    }

    return slots;
  }
}

