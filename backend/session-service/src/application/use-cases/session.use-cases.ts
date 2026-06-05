import { Injectable, Logger, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { v4 as uuidv4 } from 'uuid';
import { IBookingRepository, BOOKING_REPOSITORY } from '../../domain/repositories/booking.repository.interface';
import { IEventBus, EVENT_BUS } from '../../infrastructure/messaging/event-bus.interface';
import { BookingStatus } from '../../domain/value-objects/booking-status.vo';

// Domain
import { ChargingSession } from '../../domain/entities/charging-session.aggregate';
import { TelemetryReading } from '../../domain/value-objects/telemetry.vo';
import {
  ChargingSessionException,
  InvalidSessionStateException,
} from '../../domain/exceptions/charging.exceptions';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import {
  SessionStartedEvent,
  SessionActivatedEvent,
  SessionCompletedEvent,
  SessionInterruptedEvent,
  SessionErrorEvent,
  SessionTelemetryEvent,
} from '../../domain/events/charging.events';

// Infrastructure
import {
  SessionOrmEntity,
  TelemetryOrmEntity,
  ProcessedEventOrmEntity,
  ChargerStateOrmEntity,
  BookingReadModelOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import { OutboxOrmEntity, ChargerReadModelOrmEntity, ConnectorReadModelOrmEntity, QueueOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities'; // Shared outbox
import { PriorityQueueService } from '../../domain/services/priority-queue.service'; 
import { ChargingGateway } from '../../infrastructure/realtime/charging.gateway';



function buildOutboxEntry(
  mgr: EntityManager,
  event: { eventType: string; [key: string]: any },
  aggregateId: string,
): OutboxOrmEntity {
  return mgr.create(OutboxOrmEntity, {
    id:            uuidv4(),
    aggregateType: 'session',
    aggregateId,
    eventType:     event.eventType,
    payload:       { ...event } as object,
    status:        'pending',
    processedAt:   null,
  });
}



/**
 * Starts a charging session.
 *
 * Guards:
 * - Prevents session if charger is occupied
 * - If booking already has an associated session -> conflict
 * - Booking: validates QR time window (startTime ± 15 mins)
 * - Walk-in: ChargingArrearsGuard blocks bad debt before reaching this point
 *
 * Flow:
 * 1. If bookingId exists -> validate QR time window from booking_read_models
 * 2. Create ChargingSession aggregate (status=pending)
 * 3. Activate immediately (pending -> active)
 * 4. Persist + outbox event (session.started)
 * 5. Update charger state -> occupied
 */
@Injectable()
export class StartSessionUseCase {
  private readonly logger = new Logger(StartSessionUseCase.name);

  /** Allowed early entry before booking time: 10 minutes (aligned with ChargerReservationJob) */
  private static readonly EARLY_ENTRY_MS = 10 * 60_000;
  /** Allowed late buffer after booking end: 5 minutes */
  private static readonly LATE_BUFFER_MS = 5 * 60_000;
  /**
   * Look-ahead window: if a booking starts within this many minutes,
   * the walk-in session is capped at the booking startTime.
   * This ensures the charger is free for the scheduled user.
   */
  private static readonly UPCOMING_BOOKING_LOOKAHEAD_MS = 120 * 60_000; // 2 hours look-ahead

  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    @InjectRepository(BookingReadModelOrmEntity)
    private readonly bookingRmRepo: Repository<BookingReadModelOrmEntity>,
    @InjectRepository(ConnectorReadModelOrmEntity)
    private readonly connectorRmRepo: Repository<ConnectorReadModelOrmEntity>,
    @InjectRepository(ChargerReadModelOrmEntity)
    private readonly chargerRmRepo: Repository<ChargerReadModelOrmEntity>,
    @InjectRepository(QueueOrmEntity)
    private readonly queueOrmRepo: Repository<QueueOrmEntity>,
    private readonly priorityQueue: PriorityQueueService,
    private readonly ds: DataSource,
  ) {}

  async execute(cmd: {
    userId: string;        // Always taken from JWT, never trust body
    chargerId: string;
    bookingId?: string;   // User might scan QR for a pre-existing booking
    startMeterWh?: number;
  }): Promise<ChargingSession> {
    let bookingDepositAmount = 0;
    let bookingDepositTransactionId: string | null = null;

    let physicalChargerId = cmd.chargerId;
    const connectorRm = await this.connectorRmRepo.findOneBy({ connectorId: cmd.chargerId });
    if (connectorRm) {
      physicalChargerId = connectorRm.chargerId;
      this.logger.log(`Resolved physical charger ID for connector ${cmd.chargerId} -> ${physicalChargerId} (from local read model)`);
    } else {
      const chargerRm = await this.chargerRmRepo.findOneBy({ chargerId: cmd.chargerId });
      if (chargerRm) {
        physicalChargerId = chargerRm.chargerId;
        this.logger.log(`Resolved physical charger ID (direct matching) -> ${physicalChargerId}`);
      }
    }

    if (cmd.bookingId) {
      const bookingRm = await this.bookingRmRepo.findOneBy({ bookingId: cmd.bookingId });

      if (!bookingRm) {
        throw new ConflictException(
          `Booking ${cmd.bookingId} does not exist or is not confirmed. ` +
          `Please wait for payment confirmation.`,
        );
      }

      if (bookingRm.userId !== cmd.userId) {
        throw new ConflictException(
          `Booking ${cmd.bookingId} does not belong to the current account.`,
        );
      }

      const now = Date.now();
      const earliest = bookingRm.startTime.getTime() - StartSessionUseCase.EARLY_ENTRY_MS;
      const latest   = bookingRm.endTime.getTime()   + StartSessionUseCase.LATE_BUFFER_MS;

      if (now < earliest) {
        // Check if charger is completely free to allow early check-in
        const activeSession = await this.sessionRepo.findActiveByCharger(physicalChargerId);
        
        let hasConflict = false;
        if (activeSession) {
          this.logger.log(`Early check-in for booking ${cmd.bookingId} denied: charger has an active session ${activeSession.id}.`);
          hasConflict = true;
        } else {
          // Check for conflicting bookings
          const conflictingBooking = await this.bookingRmRepo.createQueryBuilder('b')
            .where('b.chargerId = :chargerId', { chargerId: physicalChargerId })
            .andWhere('b.bookingId != :bookingId', { bookingId: cmd.bookingId })
            .andWhere('b.endTime > :now', { now: new Date(now) })
            .andWhere('b.startTime < :bookingStartTime', { bookingStartTime: bookingRm.startTime })
            .getOne();

          if (conflictingBooking) {
            this.logger.log(`Early check-in for booking ${cmd.bookingId} denied: conflicting booking ${conflictingBooking.bookingId} found.`);
            hasConflict = true;
          }
        }

        if (hasConflict) {
          const minutesUntil = Math.ceil((earliest - now) / 60_000);
          throw new ConflictException(
            `It is not yet time for your charging session. You cannot start early because the charger is not free. ` +
            `You can start in ${minutesUntil} minutes ` +
            `(from ${new Date(earliest).toISOString().split('T')[1].substring(0, 5)}).`,
          );
        } else {
          this.logger.log(
            `Early check-in allowed for booking ${cmd.bookingId}: charger ${physicalChargerId} is completely free before scheduled time.`,
          );
        }
      }

      if (now > latest) {
        throw new ConflictException(
          `Booking ${cmd.bookingId} has expired. ` +
          `The slot ended at ${bookingRm.endTime.toISOString().split('T')[1].substring(0, 5)}.`,
        );
      }

      if (bookingRm.chargerId !== physicalChargerId) {
        throw new ConflictException(
          `This booking is for another charger (${bookingRm.chargerId}), not ${cmd.chargerId}.`,
        );
      }

      bookingDepositAmount         = Number(bookingRm.depositAmount);
      bookingDepositTransactionId  = bookingRm.depositTransactionId;

      this.logger.log(
        `QR time window OK: booking=${cmd.bookingId} ` +
        `window=[${bookingRm.startTime.toISOString()}, ${bookingRm.endTime.toISOString()}]`,
      );
    }

    return this.ds.transaction(async (mgr: EntityManager) => {
      if (cmd.bookingId) {
        const existing = await mgr.findOneBy(SessionOrmEntity, {
          bookingId: cmd.bookingId,
        });
        if (existing && existing.status !== 'interrupted' && existing.status !== 'error') {
          throw new ConflictException(
            `Booking ${cmd.bookingId} already has session ${existing.id}`,
          );
        }
      }

      const activeSession = await mgr.findOne(SessionOrmEntity, {
        where: { chargerId: physicalChargerId, status: 'active' },
      });
      if (activeSession) {
        throw new ConflictException(
          `Charger ${cmd.chargerId} is occupied by session ${activeSession.id}`,
        );
      }

      const startSocPercent = ChargingSession.generateStartSoc();
      const session = ChargingSession.create({
        userId:         cmd.userId,
        chargerId:      physicalChargerId,
        bookingId:      cmd.bookingId,
        startMeterWh:   cmd.startMeterWh ?? 0,
        startSocPercent,
        initiatedBy:    'user',
      });
      session.activate();

      // Dequeue if user was in virtual queue
      await mgr.update(
        QueueOrmEntity,
        { userId: cmd.userId, chargerId: physicalChargerId, status: In(['waiting', 'notified']) },
        { status: 'served', servedAt: new Date() }
      );
      this.priorityQueue.removeByUser(cmd.userId, physicalChargerId);

      // Cap walk-in session duration to protect subsequent reserved slots.
      let scheduledStopAt: Date | null = null;
      if (!cmd.bookingId) {
        const now = new Date();
        const lookaheadEnd = new Date(now.getTime() + StartSessionUseCase.UPCOMING_BOOKING_LOOKAHEAD_MS);
        const nextBooking = await mgr
          .createQueryBuilder(BookingReadModelOrmEntity, 'b')
          .where('b.chargerId = :chargerId', { chargerId: physicalChargerId })
          .andWhere('b.startTime > :now', { now })
          .andWhere('b.startTime <= :lookaheadEnd', { lookaheadEnd })
          .orderBy('b.startTime', 'ASC')
          .getOne();

        if (nextBooking) {
          scheduledStopAt = nextBooking.startTime;
          this.logger.log(
            `Walk-in session ${session.id}: will be force-stopped at ${scheduledStopAt.toISOString()} ` +
            `for booking ${nextBooking.bookingId}`,
          );
        }
      }

      await mgr.save(SessionOrmEntity, {
        id:                    session.id,
        userId:                session.userId,
        chargerId:             session.chargerId,
        bookingId:             session.bookingId,
        startSocPercent:       session.startSocPercent,
        startMeterWh:          session.startMeterWh,
        status:                session.status,
        startTime:             session.startTime,
        endTime:               null,
        endMeterWh:            null,
        initiatedBy:           session.initiatedBy,
        errorReason:           null,
        scheduledStopAt,
        depositAmount:         bookingDepositAmount,
        depositTransactionId:  bookingDepositTransactionId,
      });

      await mgr.upsert(
        ChargerStateOrmEntity,
        {
          chargerId:       physicalChargerId,
          availability:    'occupied',
          activeSessionId: session.id,
          errorCode:       null,
          updatedAt:       new Date(),
        },
        ['chargerId'],
      );

      const chargerRm = await mgr.findOneBy(ChargerReadModelOrmEntity, { chargerId: physicalChargerId });
      const stationId = chargerRm?.stationId ?? 'unknown';

      const event = new SessionStartedEvent(
        session.id,
        session.userId,
        session.chargerId,
        stationId,
        session.bookingId,
        session.startTime,
        session.startMeterWh,
      );
      await mgr.save(OutboxOrmEntity, buildOutboxEntry(mgr, event, session.id));
      const statusEventId = uuidv4();
      await mgr.save(OutboxOrmEntity, mgr.create(OutboxOrmEntity, {
        id:            statusEventId,
        aggregateType: 'charger',
        aggregateId:   physicalChargerId,
        eventType:     'charger.status.changed',
        payload:       { eventId: statusEventId, chargerId: physicalChargerId, stationId, newStatus: 'in_use', changedAt: new Date().toISOString() },
        status:        'pending',
        processedAt:   null,
      }));

      this.logger.log(
        `Session started by user ${cmd.userId}: ${session.id} ` +
        `charger=${physicalChargerId} booking=${cmd.bookingId ?? 'walk-in'}`,
      );
      return session;
    });
  }
}



/**
 * Finalizes an active session and releases infrastructure resources.
 */
@Injectable()
export class StopSessionUseCase {
  private readonly logger = new Logger(StopSessionUseCase.name);

  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    private readonly ds: DataSource,
  ) {}

  async execute(cmd: {
    sessionId: string;
    endMeterWh: number;
    reason?: string;
    energyFeeVnd?: number;
    depositAmount?: number;
    depositTransactionId?: string;
  }): Promise<ChargingSession> {
    return this.ds.transaction(async (mgr: EntityManager) => {
      const entity = await mgr.findOneBy(SessionOrmEntity, { id: cmd.sessionId });
      if (!entity) throw new NotFoundException(`Session ${cmd.sessionId} does not exist`);

      const session = this.entityToDomain(entity);

      const chargerRm = await mgr.findOneBy(ChargerReadModelOrmEntity, { chargerId: session.chargerId });
      const stationId = chargerRm?.stationId ?? 'unknown';

      let eventPayload: OutboxOrmEntity;

      const isInterrupted = cmd.reason && cmd.reason !== 'kiosk_user_stop' && cmd.reason !== 'admin_intervention';

      if (isInterrupted) {
        session.interrupt(cmd.reason!);
        const ev = new SessionInterruptedEvent(
          session.id, session.userId, session.chargerId, cmd.reason!,
        );
        eventPayload = buildOutboxEntry(mgr, ev, session.id);
      } else {
        let calculatedEnergyFee = cmd.energyFeeVnd;
        if (calculatedEnergyFee === undefined) {
          calculatedEnergyFee = 0;
          try {
            const baseUrl = process.env.STATION_SERVICE_URL || 'http://ev-infrastructure:3003';
            const kwhConsumed = Math.max(0, (cmd.endMeterWh - session.startMeterWh) / 1000);
            const connectorType = chargerRm?.connectorType ?? 'CCS';
            const response = await fetch(
              `${baseUrl}/api/v1/stations/${stationId}/chargers/${session.chargerId}/pricing/calculate-session-fee`,
              {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  connectorType,
                  startTime:     session.startTime.toISOString(),
                  kwhConsumed,
                  idleMinutes:   0,
                }),
                signal: AbortSignal.timeout(3000),
              }
            );
            if (response.ok) {
              const resBody = await response.json();
              calculatedEnergyFee = resBody.energyFeeVnd ?? 0;
            } else {
              this.logger.error(`Pricing service returned status ${response.status}`);
              throw new Error(`Status ${response.status}`);
            }
          } catch (err: any) {
            this.logger.error(`Failed to calculate fee from infrastructure: ${err.message}. Using fallback.`);
            const kwhConsumed = Math.max(0, (cmd.endMeterWh - session.startMeterWh) / 1000);
            const hour = session.startTime.getHours();
            const isPeak = (hour >= 9 && hour < 12) || (hour >= 17 && hour < 20);
            const isOffPeak = hour >= 22 || hour < 6;
            const pricePerKwhVnd = isPeak ? 4500 : isOffPeak ? 2500 : 3500;
            calculatedEnergyFee = Math.ceil(kwhConsumed * pricePerKwhVnd);
          }
        }

        calculatedEnergyFee ??= 0;
        if (calculatedEnergyFee < 1000) {
          calculatedEnergyFee = 1000;
        }

        session.stop(cmd.endMeterWh, calculatedEnergyFee);
        const durationMs = session.endTime!.getTime() - session.startTime.getTime();
        const ev = new SessionCompletedEvent(
          session.id,
          session.userId,
          session.chargerId,
          stationId,
          session.bookingId,
          session.kwhConsumed!,
          session.endTime!,
          Math.round(durationMs / 60000),
          calculatedEnergyFee,
          session.idleFeeVnd,
          cmd.depositAmount ?? (entity.depositAmount !== null && entity.depositAmount !== undefined ? Number(entity.depositAmount) : 0),
          cmd.depositTransactionId ?? entity.depositTransactionId ?? null,
        );
        eventPayload = buildOutboxEntry(mgr, ev, session.id);
      }

      await mgr.update(SessionOrmEntity, cmd.sessionId, {
        status:      session.status,
        endTime:     session.endTime,
        endMeterWh:  session.endMeterWh,
        errorReason: session.errorReason,
      });

      // ReleasedAt signals QueueCleanupJob to enforce the physical cooling/vacate period.
      const releaseTime = new Date();
      await mgr.upsert(
        ChargerStateOrmEntity,
        {
          chargerId:       session.chargerId,
          availability:    'available',
          activeSessionId: null,
          errorCode:       null,
          releasedAt:      releaseTime,
          updatedAt:       releaseTime,
        },
        ['chargerId'],
      );

      await mgr.save(OutboxOrmEntity, eventPayload);
      const statusEventId = uuidv4();
      await mgr.save(OutboxOrmEntity, mgr.create(OutboxOrmEntity, {
        id:            statusEventId,
        aggregateType: 'charger',
        aggregateId:   session.chargerId,
        eventType:     'charger.status.changed',
        payload:       { eventId: statusEventId, chargerId: session.chargerId, stationId, newStatus: 'available', changedAt: new Date().toISOString() },
        status:        'pending',
        processedAt:   null,
      }));

      this.logger.log(
        `Session ${cmd.sessionId} -> ${session.status} kWh=${session.kwhConsumed ?? 'N/A'}`,
      );
      return session;
    });
  }

  private entityToDomain(e: SessionOrmEntity): ChargingSession {
    return ChargingSession.reconstitute({
      id:              e.id,
      userId:          e.userId,
      chargerId:       e.chargerId,
      bookingId:       e.bookingId,
      initiatedBy:     (e.initiatedBy ?? 'user') as any,
      startSocPercent: e.startSocPercent !== null ? Number(e.startSocPercent) : null,
      startMeterWh:    Number(e.startMeterWh),
      status:          e.status as any,
      startTime:    e.startTime,
      endTime:      e.endTime,
      endMeterWh:   e.endMeterWh !== null ? Number(e.endMeterWh) : null,
      errorReason:  e.errorReason,
      createdAt:    e.createdAt,
      updatedAt:    e.createdAt,
    });
  }
}



/**
 * Saves telemetry reading. Batch-friendly: Fire-and-forget.
 *
 * Validates via TelemetryReading value object.
 * Emits session.telemetry event into outbox for the realtime gateway to consume.
 */
@Injectable()
export class RecordTelemetryUseCase {
  private readonly logger = new Logger(RecordTelemetryUseCase.name);

  constructor(
    @InjectRepository(TelemetryOrmEntity)
    private readonly telemetryRepo: Repository<TelemetryOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
  ) {}

  async execute(sessionId: string, data: {
    powerKw?:      number;
    meterWh?:      number;
    socPercent?:   number;
    temperatureC?: number;
    errorCode?:    string;
    voltage?:      number;
    currentA?:     number;
  }): Promise<TelemetryOrmEntity> {
    const reading = new TelemetryReading(data);

    const sessionOrm = await this.sessionRepo.findOneBy({ id: sessionId });

    let estimatedSoc = reading.socPercent;
    if (estimatedSoc === null && sessionOrm?.startSocPercent != null && reading.meterWh != null) {
      const energyDeltaWh = reading.meterWh - Number(sessionOrm.startMeterWh);
      const batteryCapacityWh = Number(process.env.ESTIMATED_BATTERY_CAPACITY_WH || 60_000);
      estimatedSoc = Math.min(100, Math.max(0,
        Math.round(sessionOrm.startSocPercent + (energyDeltaWh / batteryCapacityWh) * 100)
      ));
    }

    // Persist telemetry
    const entry = this.telemetryRepo.create({
      id:           uuidv4(),
      sessionId,
      powerKw:      reading.powerKw,
      meterWh:      reading.meterWh,
      voltageV:     reading.voltage,
      currentA:     reading.currentA,
      socPercent:   estimatedSoc,
      temperatureC: reading.temperatureC,
      errorCode:    reading.errorCode,
    });
    await this.telemetryRepo.save(entry);

    // Emit telemetry event (realtime gateway picks this up via outbox publisher)
    const event = new SessionTelemetryEvent(
      sessionId,
      sessionOrm?.userId ?? 'unknown',
      sessionOrm?.chargerId ?? 'unknown',
      reading.powerKw,
      reading.meterWh,
      estimatedSoc,
      reading.voltage,
      reading.currentA,
      reading.temperatureC,
      reading.recordedAt,
    );
    await this.outboxRepo.save(
      this.outboxRepo.create({
        id:            uuidv4(),
        aggregateType: 'session',
        aggregateId:   sessionId,
        eventType:     event.eventType,
        payload:       { ...event } as object,
        status:        'pending',
        processedAt:   null,
      }),
    );

    return entry;
  }
}



@Injectable()
export class GetSessionUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepo: ISessionRepository,
    @InjectRepository(ConnectorReadModelOrmEntity)
    private readonly connectorRmRepo: Repository<ConnectorReadModelOrmEntity>,
  ) {}

  async execute(sessionId: string): Promise<ChargingSession | null> {
    return this.sessionRepo.findById(sessionId);
  }

  async getActiveByCharger(chargerId: string): Promise<ChargingSession | null> {
    let physicalChargerId = chargerId;
    const connectorRm = await this.connectorRmRepo.findOneBy({ connectorId: chargerId });
    if (connectorRm) {
      physicalChargerId = connectorRm.chargerId;
    }
    const sessionByPhysical = await this.sessionRepo.findActiveByCharger(physicalChargerId);
    if (sessionByPhysical) return sessionByPhysical;
    return this.sessionRepo.findActiveByCharger(chargerId);
  }

  async getUserHistory(userId: string, limit = 20): Promise<ChargingSession[]> {
    return this.sessionRepo.findByUserId(userId, limit);
  }

  async getAllHistory(limit = 20): Promise<ChargingSession[]> {
    return this.sessionRepo.findAll(limit);
  }

  async getAllHistoryPaginated(
    limit = 20,
    offset = 0,
    userId?: string,
    chargerId?: string,
    status?: string,
    chargerIds?: string[],
  ): Promise<{ items: ChargingSession[]; total: number }> {
    return this.sessionRepo.findAllPaginated(limit, offset, userId, chargerId, status, chargerIds);
  }
}



/**
 * Listens for booking.confirmed:
 *  -> Updates charger state -> reserved
 *  -> Idempotent
 */
@Injectable()
export class BookingConfirmedConsumer {
  private readonly logger = new Logger(BookingConfirmedConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(ChargerStateOrmEntity)
    private readonly chargerStateRepo: Repository<ChargerStateOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    @InjectRepository(ChargerReadModelOrmEntity)
    private readonly chargerRmRepo: Repository<ChargerReadModelOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.confirmed',
    queue: 'charging-ctrl.booking.confirmed',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    eventId: string;
    bookingId: string;
    chargerId: string;
    userId: string;
    startTime?: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `booking.confirmed:${payload.bookingId}`;
    const exists = await this.peRepo.existsBy({ eventId });
    if (exists) {
      this.logger.debug(`Duplicate event ${eventId}, skipping`);
      return;
    }

    await this.peRepo.save({ eventId, eventType: 'booking.confirmed' });

    let shouldReserveImmediately = true;
    if (payload.startTime) {
      const startTime = new Date(payload.startTime);
      // Reserve immediately if booking starts within 10 minutes (aligned with ChargerReservationJob)
      const earlyThreshold = new Date(startTime.getTime() - 10 * 60_000);
      const now = new Date();
      if (now < earlyThreshold) {
        shouldReserveImmediately = false;
      }
    }

    if (shouldReserveImmediately) {
      // FSM check: only allow reserve if currently available or unset
      const current = await this.chargerStateRepo.findOneBy({ chargerId: payload.chargerId });
      if (current && current.availability !== 'available') {
        this.logger.warn(
          `Booking confirmed: cannot reserve charger ${payload.chargerId} ` +
          `for booking ${payload.bookingId} — current state is '${current.availability}'`,
        );
        return;
      }

      // Reserve charger (available -> reserved)
      await this.chargerStateRepo.upsert(
        {
          chargerId:       payload.chargerId,
          availability:    'reserved',
          activeSessionId: null,
          errorCode:       null,
          updatedAt:       new Date(),
        },
        ['chargerId'],
      );

      // Lookup stationId for cross-service event emission
      const chargerRm = await this.chargerRmRepo.findOneBy({ chargerId: payload.chargerId });
      const stationId = chargerRm?.stationId ?? 'unknown';

      // Emit charger.status.changed so ev-infrastructure-service stays in sync
      const statusEventId = uuidv4();
      await this.outboxRepo.save(
        this.outboxRepo.create({
          id:            statusEventId,
          aggregateType: 'charger',
          aggregateId:   payload.chargerId,
          eventType:     'charger.status.changed',
          payload:       { eventId: statusEventId, chargerId: payload.chargerId, stationId, newStatus: 'reserved', changedAt: new Date().toISOString() },
          status:        'pending',
          processedAt:   null,
        }),
      );

      this.logger.log(
        `Booking confirmed: charger ${payload.chargerId} reserved immediately for booking ${payload.bookingId}`,
      );
    } else {
      this.logger.log(
        `Booking confirmed: charger ${payload.chargerId} starting at ${payload.startTime} in the future. Skipping immediate reservation.`,
      );
    }
  }
}



/**
 * Listens for payment.completed:
 *  -> Records successful payment (logging/analytics hook)
 *  -> Idempotent
 *
 * Note: Session is usually started separately via /charging/start.
 * This consumer only triggers if auto-start after payment is required (alternative flow).
 */
@Injectable()
export class PaymentCompletedConsumer {
  private readonly logger = new Logger(PaymentCompletedConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    @Inject(SESSION_REPOSITORY) private readonly sessionDomainRepo: ISessionRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(EVENT_BUS)          private readonly eventBus: IEventBus,
    private readonly chargingGateway: ChargingGateway,
  ) {}

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'payment.completed',
    queue: 'charging-ctrl.payment.completed',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    eventId?: string;
    transactionId: string;
    userId: string;
    relatedId?: string;       // bookingId or sessionId
    relatedType?: string;
    amount: number;
  }): Promise<void> {
    if (payload.relatedType !== 'booking' && payload.relatedType !== 'charging_session') return;

    const eventId = payload.eventId ?? `payment.completed:${payload.transactionId}`;
    const exists  = await this.peRepo.existsBy({ eventId });
    if (exists) { return; }

    await this.peRepo.save({ eventId, eventType: 'payment.completed' });

    // Lookup session via bookingId or sessionId
    let session = payload.relatedType === 'charging_session'
      ? await this.sessionDomainRepo.findById(payload.relatedId!)
      : await this.sessionDomainRepo.findByBookingId(payload.relatedId!);

    if (!session && payload.relatedType === 'booking') {
      // Fallback: relatedId might be a sessionId even if relatedType is booking
      session = await this.sessionDomainRepo.findById(payload.relatedId!);
    }

    if (!session) {
      this.logger.warn(`No session found for payment ${payload.transactionId} relatedId=${payload.relatedId}`);
      return;
    }

    // STOPPED -> BILLED transition
    if (session.status !== 'stopped') {
      this.logger.debug(`Session ${session.id} is ${session.status}, skipping bill transition`);
      return;
    }

    session.bill();
    session.completeSession();

    await this.sessionRepo.update(session.id, {
      status: session.status,
      billedAt: session.billedAt,
    });

    this.logger.log(`Session ${session.id} -> BILLED & COMPLETED (payment ${payload.transactionId})`);

    try {
      this.chargingGateway.broadcastToSession(session.id, 'payment_completed', {
        sessionId: session.id,
        transactionId: payload.transactionId,
        amount: payload.amount,
        status: session.status,
      });
      this.logger.log(`Broadcasted payment_completed event for session ${session.id}`);
    } catch (err: any) {
      this.logger.error(`Failed to broadcast payment completion: ${err.message}`);
    }

    // Complete the booking if it exists
    if (session.bookingId) {
      try {
        const booking = await this.bookingRepo.findById(session.bookingId);
        if (booking && booking.status !== BookingStatus.COMPLETED) {
          booking.complete();
          await this.bookingRepo.save(booking);
          await this.eventBus.publishAll(booking.domainEvents);
          booking.clearDomainEvents();
          this.logger.log(`Booking ${session.bookingId} completed upon session completion.`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to complete booking ${session.bookingId}: ${err.message}`);
      }
    }
  }
}

