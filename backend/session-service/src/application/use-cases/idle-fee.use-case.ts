import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  IDLE_GRACE_MINUTES,
  IDLE_FEE_PER_MINUTE_VND,
} from '../../domain/entities/charging-session.aggregate';
import {
  SessionOrmEntity,
  OutboxOrmEntity,
  ChargerStateOrmEntity,
  BookingReadModelOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import { ChargerReadModelOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities';
import { SessionCompletedEvent } from '../../domain/events/charging.events';

/**
 * IdleFeeDetectionJob
 *
 * Runs every 1 minute.
 * Find sessions with status = 'stopped' (charging done) but unplugged.
 * After 15 minutes grace period -> charge 2,000 VND/minute added to idle_fee_vnd.
 *
 * When Billing is triggered (session.completed), total fee = energyFee + idleFee
 * will be used for deposit reconciliation.
 */
@Injectable()
export class IdleFeeDetectionJob {
  private readonly logger = new Logger(IdleFeeDetectionJob.name);

  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('* * * * *')
  async run(): Promise<void> {
    const graceEndTime = new Date(Date.now() - IDLE_GRACE_MINUTES * 60_000);

    // Find stopped but unbilled sessions past 15 min grace period
    const idleSessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where("s.status = 'stopped'")
      .andWhere('s.end_time IS NOT NULL')
      .andWhere('s.end_time <= :graceEndTime', { graceEndTime })
      .getMany();

    if (idleSessions.length === 0) return;

    this.logger.warn(`Idle fee detection: ${idleSessions.length} sessions occupying charger`);

    for (const session of idleSessions) {
      const idleMinutes = Math.floor(
        (Date.now() - session.endTime!.getTime()) / 60_000 - IDLE_GRACE_MINUTES,
      );
      if (idleMinutes <= 0) continue;

      // Actual fee per minute (2,000 VND/min)
      const idleFeeIncrement = IDLE_FEE_PER_MINUTE_VND;
      const newIdleFee = ((session as any).idleFeeVnd ?? 0) + idleFeeIncrement;

      await this.sessionRepo.update(session.id, {
        idleFeeVnd: newIdleFee,
        updatedAt:  new Date(),
      } as any);

      this.logger.warn(
        `Idle fee: session=${session.id} charger=${session.chargerId} ` +
        `idle=${idleMinutes}min total_idle_fee=${newIdleFee}VND`,
      );
    }
  }
}

/**
 * IdleFeeCompletedJob
 *
 * When user unplugs (session.billed or OCPP signal):
 * Emit SessionCompletedEvent with full energyFeeVnd + idleFeeVnd
 * for Payment Service to perform billing reconciliation.
 *
 * Note: this event is actually emitted in StopSessionUseCase.
 * This job only handles stuck sessions (fallback).
 */
@Injectable()
export class StoppedSessionBillingJob {
  private readonly logger = new Logger(StoppedSessionBillingJob.name);

  static readonly BILLING_TIMEOUT_MINUTES = 60; // emit billing after 60 mins if unbilled

  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('*/5 * * * *') // every 5 minutes
  async run(): Promise<void> {
    const cutoff = new Date(
      Date.now() - StoppedSessionBillingJob.BILLING_TIMEOUT_MINUTES * 60_000,
    );

    const stuckSessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where("s.status = 'stopped'")
      .andWhere('s.end_time <= :cutoff', { cutoff })
      .getMany();

    if (stuckSessions.length === 0) return;

    this.logger.warn(`Stuck stopped sessions: ${stuckSessions.length} - force billing`);

    for (const s of stuckSessions) {
      const durationMs = (s.endTime!.getTime() - s.startTime.getTime());
      const durationMin = Math.round(durationMs / 60_000);
      const kwhConsumed = s.endMeterWh != null
        ? (Number(s.endMeterWh) - Number(s.startMeterWh)) / 1000
        : 0;

      const event = new SessionCompletedEvent(
        s.id,
        s.userId,
        s.chargerId,
        s.bookingId,
        kwhConsumed,
        s.endTime!,
        durationMin,
        (s as any).energyFeeVnd ?? 0,
        (s as any).idleFeeVnd ?? 0,
        (s as any).depositAmount ?? 0,
        (s as any).depositTransactionId ?? null,
      );

      await this.outboxRepo.save(
        this.outboxRepo.create({
          id:            uuidv4(),
          aggregateType: 'session',
          aggregateId:   s.id,
          eventType:     event.eventType,
          payload:       { ...event } as object,
          status:        'pending',
          processedAt:   null,
        }),
      );

      this.logger.log(`Force-billing session=${s.id}`);
    }
  }
}

/**
 * ChargerReservationJob
 *
 * Runs every 1 minute.
 * Scans booking_read_models for confirmed bookings starting within 15 minutes
 * and sets the charger's operational state to 'reserved' if it is currently 'available'.
 */
@Injectable()
export class ChargerReservationJob {
  private readonly logger = new Logger(ChargerReservationJob.name);

  constructor(
    @InjectRepository(BookingReadModelOrmEntity)
    private readonly bookingRmRepo: Repository<BookingReadModelOrmEntity>,
    @InjectRepository(ChargerStateOrmEntity)
    private readonly chargerStateRepo: Repository<ChargerStateOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    @InjectRepository(ChargerReadModelOrmEntity)
    private readonly chargerRmRepo: Repository<ChargerReadModelOrmEntity>,
  ) {}

  @Cron('* * * * *')
  async run(): Promise<void> {
    const now = new Date();
    // Lock charger 10 minutes before booking start (agreed business rule)
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60_000);

    // Find all confirmed bookings starting within the next 10 minutes and not yet ended
    const activeBookings = await this.bookingRmRepo
      .createQueryBuilder('b')
      .where('b.startTime <= :tenMinutesFromNow', { tenMinutesFromNow })
      .andWhere('b.endTime >= :now', { now })
      .getMany();

    if (activeBookings.length === 0) return;

    for (const booking of activeBookings) {
      const chargerId = booking.chargerId;
      const state = await this.chargerStateRepo.findOneBy({ chargerId });
      if (state && state.availability === 'available') {
        state.availability = 'reserved';
        state.updatedAt = new Date();
        await this.chargerStateRepo.save(state);

        const chargerRm = await this.chargerRmRepo.findOneBy({ chargerId });
        const stationId = chargerRm?.stationId ?? 'unknown';
        const statusEventId = uuidv4();
        await this.outboxRepo.save(
          this.outboxRepo.create({
            id:            statusEventId,
            aggregateType: 'charger',
            aggregateId:   chargerId,
            eventType:     'charger.status.changed',
            payload:       { eventId: statusEventId, chargerId, stationId, newStatus: 'reserved', changedAt: new Date().toISOString() },
            status:        'pending',
            processedAt:   null,
          }),
        );

        this.logger.log(
          `ChargerReservationJob: Reserved charger ${chargerId} for upcoming booking ${booking.bookingId}`,
        );
      }
    }
  }
}
