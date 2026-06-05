import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Not, LessThan } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  ChargerStateOrmEntity,
  SessionOrmEntity,
  OutboxOrmEntity,
  BookingReadModelOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import { ChargerReadModelOrmEntity, QueueOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities';
import { NotifyQueueHeadUseCase } from './queue.use-case';

/**
 * QueueCleanupJob
 *
 * Runs every 1 minute.
 * Business rule: After a session ends, wait 3 minutes for a physical walk-in
 * before activating the virtual queue (FIFO app queue).
 *
 * Flow:
 * 1. Find chargers with availability='available' AND releasedAt IS NOT NULL
 *    AND (NOW() - releasedAt) >= 3 minutes
 *    AND no active session on that charger
 * 2. Emit 'charger.queue.ready' outbox event → Notification Service picks this up
 *    and sends push notification to the head of the queue
 * 3. Clear releasedAt (set to null) so this job doesn't fire again for same release
 */
@Injectable()
export class QueueCleanupJob {
  private readonly logger = new Logger(QueueCleanupJob.name);

  /** Physical wait buffer: 3 minutes after session ends before activating app queue */
  static readonly PHYSICAL_WAIT_MINUTES = 3;

  constructor(
    @InjectRepository(ChargerStateOrmEntity)
    private readonly chargerStateRepo: Repository<ChargerStateOrmEntity>,
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    @InjectRepository(ChargerReadModelOrmEntity)
    private readonly chargerRmRepo: Repository<ChargerReadModelOrmEntity>,
    @InjectRepository(QueueOrmEntity)
    private readonly queueOrmRepo: Repository<QueueOrmEntity>,
    private readonly notifyQueueHead: NotifyQueueHeadUseCase,
  ) {}

  @Cron('* * * * *') // every 1 minute
  async run(): Promise<void> {
    const now = new Date();
    // 0. Auto-expire notified queue entries past their expiration time
    try {
      const expiredCount = await this.queueOrmRepo.update(
        { status: 'notified', expiresAt: LessThan(now) },
        { status: 'expired' }
      );
      if (expiredCount.affected && expiredCount.affected > 0) {
        this.logger.log(`QueueCleanupJob: expired ${expiredCount.affected} notified queue entries`);
      }
    } catch (err) {
      this.logger.error(`QueueCleanupJob: failed to expire queue entries: ${err}`);
    }

    const physicalWaitMs = QueueCleanupJob.PHYSICAL_WAIT_MINUTES * 60_000;
    const cutoffTime = new Date(Date.now() - physicalWaitMs);

    // Find chargers that:
    // 1. Have releasedAt set (just became available after a session)
    // 2. releasedAt was more than 3 minutes ago (physical wait elapsed)
    // 3. Currently still 'available' (no one plugged in physically)
    const releasedChargers = await this.chargerStateRepo.find({
      where: {
        availability: 'available',
        releasedAt:   Not(IsNull()),
      },
    });

    const eligibleChargers = releasedChargers.filter(
      (c) => c.releasedAt! <= cutoffTime,
    );

    if (eligibleChargers.length === 0) return;

    this.logger.log(
      `QueueCleanupJob: ${eligibleChargers.length} charger(s) past 3-min physical wait. Activating queue.`,
    );

    for (const chargerState of eligibleChargers) {
      const chargerId = chargerState.chargerId;

      // Double-check: no active session (safety guard)
      const activeSession = await this.sessionRepo.findOne({
        where: { chargerId, status: 'active' },
      });
      if (activeSession) {
        this.logger.warn(
          `QueueCleanupJob: skipping ${chargerId} — active session ${activeSession.id} found`,
        );
        // Clear stale releasedAt
        await this.chargerStateRepo.update({ chargerId }, { releasedAt: null });
        continue;
      }

      // Notify queue head
      await this.notifyQueueHead.execute(chargerId);

      // Clear releasedAt — prevents re-firing on next cron tick
      await this.chargerStateRepo.update({ chargerId }, { releasedAt: null });

      this.logger.log(
        `QueueCleanupJob: activated queue for ${chargerId} ` +
        `(released at ${chargerState.releasedAt!.toISOString()})`,
      );
    }
  }
}

/**
 * ForceStopJob
 *
 * Runs every 1 minute.
 * Business rule: Walk-in sessions with scheduledStopAt in the past must be
 * force-terminated so the charger is free for the upcoming booking slot.
 *
 * Flow:
 * 1. Find active sessions where scheduledStopAt IS NOT NULL AND scheduledStopAt <= NOW()
 * 2. Mark session as 'interrupted' with reason 'forced_stop_for_booking'
 * 3. Release charger → availability = 'reserved' (skip available/wait → direct to reserved
 *    because the booking lock window has arrived)
 * 4. Emit session.interrupted event + charger.status.changed event
 */
@Injectable()
export class ForceStopJob {
  private readonly logger = new Logger(ForceStopJob.name);

  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    @InjectRepository(ChargerStateOrmEntity)
    private readonly chargerStateRepo: Repository<ChargerStateOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    @InjectRepository(ChargerReadModelOrmEntity)
    private readonly chargerRmRepo: Repository<ChargerReadModelOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('* * * * *') // every 1 minute
  async run(): Promise<void> {
    const now = new Date();

    // Find active sessions that should have been stopped by now
    const overdueSessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where("s.status = 'active'")
      .andWhere('s.scheduled_stop_at IS NOT NULL')
      .andWhere('s.scheduled_stop_at <= :now', { now })
      .getMany();

    if (overdueSessions.length === 0) return;

    this.logger.warn(
      `ForceStopJob: ${overdueSessions.length} walk-in session(s) past scheduled stop time`,
    );

    for (const session of overdueSessions) {
      await this.dataSource.transaction(async (mgr) => {
        // Mark session interrupted
        await mgr.update(SessionOrmEntity, session.id, {
          status:      'interrupted',
          endTime:     now,
          errorReason: 'forced_stop_for_booking',
        });

        // Get stationId for events
        const chargerRm = await mgr.findOneBy(ChargerReadModelOrmEntity, {
          chargerId: session.chargerId,
        });
        const stationId = chargerRm?.stationId ?? 'unknown';

        // Transition charger → reserved (the booking window has arrived)
        await mgr.upsert(
          ChargerStateOrmEntity,
          {
            chargerId:       session.chargerId,
            availability:    'reserved',
            activeSessionId: null,
            errorCode:       null,
            releasedAt:      null, // clear — no walk-in queue needed
            updatedAt:       now,
          },
          ['chargerId'],
        );

        // Emit session.interrupted event
        const interruptedEventId = uuidv4();
        await mgr.save(
          mgr.create(OutboxOrmEntity, {
            id:            interruptedEventId,
            aggregateType: 'session',
            aggregateId:   session.id,
            eventType:     'session.interrupted',
            payload:       {
              eventId:   interruptedEventId,
              sessionId: session.id,
              userId:    session.userId,
              chargerId: session.chargerId,
              reason:    'forced_stop_for_booking',
              endTime:   now.toISOString(),
            },
            status:      'pending',
            processedAt: null,
          }),
        );

        // Emit charger.status.changed → reserved
        const statusEventId = uuidv4();
        await mgr.save(
          mgr.create(OutboxOrmEntity, {
            id:            statusEventId,
            aggregateType: 'charger',
            aggregateId:   session.chargerId,
            eventType:     'charger.status.changed',
            payload:       {
              eventId:   statusEventId,
              chargerId: session.chargerId,
              stationId,
              newStatus: 'reserved',
              changedAt: now.toISOString(),
            },
            status:      'pending',
            processedAt: null,
          }),
        );

        this.logger.warn(
          `ForceStopJob: session ${session.id} (user=${session.userId}) ` +
          `force-stopped at ${now.toISOString()} → charger ${session.chargerId} reserved for booking`,
        );
      });
    }
  }
}
