import { Inject, Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { ChargerStateOrmEntity } from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';

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
    @InjectRepository(ChargerStateOrmEntity)
    private readonly chargerStateRepo: Repository<ChargerStateOrmEntity>,
  ) { }

  async execute(cmd: CreateBookingCommand): Promise<Booking> {
    // 1. Idempotency Check
    if ((cmd as any).idempotencyKey) {
      const existing = await this.bookingRepo.findByIdempotencyKey((cmd as any).idempotencyKey);
      if (existing) {
        this.logger.log(`Idempotent request: Returning existing booking ${existing.id}`);
        return existing;
      }
    }

    const startTime = new Date(cmd.startTime);
    const endTime = new Date(cmd.endTime);

    /** 
     * STRICT VALIDATION: Only allow 1 minute buffer for minor sync issues.
     * Reverted from 5-min grace period as requested.
     */
    const STRICT_BUFFER_MS = 60_000;
    if (startTime.getTime() < Date.now() - STRICT_BUFFER_MS) {
      throw new BadRequestException('Cannot create a booking in the past');
    }

    const timeRange = new BookingTimeRange(startTime, endTime);

    // STEP 1: Validate connector type matches charger
    const charger = await this.chargerRepo.findById(cmd.chargerId);
    if (!charger) {
      throw new BadRequestException(`Charger ${cmd.chargerId} does not exist`);
    }

    if (charger.status === 'offline') {
      throw new BadRequestException(`Charger ${cmd.chargerId} is offline`);
    }

    // STEP 1b: Check real-time charger state (charger_state table)
    // Block booking if charger is currently occupied or already reserved
    const chargerState = await this.chargerStateRepo.findOneBy({ chargerId: cmd.chargerId });
    if (chargerState) {
      if (chargerState.availability === 'occupied') {
        throw new ConflictException(
          `Charger ${cmd.chargerId} is currently in use. ` +
          `Please join the waiting queue or try again when the charger is available.`,
        );
      }
      if (chargerState.availability === 'reserved') {
        throw new ConflictException(
          `Charger ${cmd.chargerId} is reserved for an upcoming booking. ` +
          `Please choose a different time slot or another charger.`,
        );
      }
    }

    // STEP 2: Fetch pricing -> calculate depositAmount
    const pricing = await this.pricingClient.getPricing({
      stationId: cmd.stationId,
      chargerId: cmd.chargerId,
      connectorType: cmd.connectorType,
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
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
        userId: cmd.userId,
        chargerId: cmd.chargerId,
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
  ) { }

  async execute(
    chargerId: string,
    stationId: string,
    connectorType: string,
    date: Date,
  ): Promise<(AvailabilitySlot & { pricePerKwhVnd?: number; isPeakHour?: boolean })[]> {
    const bookings = await this.bookingRepo.findByChargerAndDate(chargerId, date);

    const slots: (AvailabilitySlot & { pricePerKwhVnd?: number; isPeakHour?: boolean })[] = [];
    const slotMs = GetAvailabilityUseCase.SLOT_DURATION_MINUTES * 60_000;

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();

    // The system operates in Asia/Ho_Chi_Minh timezone (UTC+7).
    // Generates 30-minute slots starting from 00:00 to 23:30 in Asia/Ho_Chi_Minh timezone.
    const TIMEZONE_OFFSET_HOURS = 7;
    const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
    const endOfDay = new Date(Date.UTC(year, month, day, 23, 30, 0, 0) - TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);

    for (let t = startOfDay.getTime(); t <= endOfDay.getTime(); t += slotMs) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + slotMs);

      const isBooked = bookings.some(
        (b) =>
          b.timeRange.startTime < slotEnd &&
          b.timeRange.endTime > slotStart,
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
          isPeakHour = pricing.isPeakHour;
        } catch {
          // If pricing error, do not block availability
        }
      }

      slots.push({ startTime: slotStart, endTime: slotEnd, isBooked, pricePerKwhVnd, isPeakHour });
    }

    return slots;
  }
}
