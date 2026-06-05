import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import {
  BookingReadModelOrmEntity,
  ProcessedEventOrmEntity,
  ChargerStateOrmEntity,
} from '../../persistence/typeorm/entities/session.orm-entities';
import { OutboxOrmEntity, ChargerReadModelOrmEntity } from '../../persistence/typeorm/entities/booking.orm-entities';
import { v4 as uuidv4 } from 'uuid';
import { NotifyQueueHeadUseCase } from '../../../application/use-cases/queue.use-case';

/**
 * BookingConfirmedSyncConsumer
 *
 * Listens for booking.confirmed from Booking Service.
 * Syncs into booking_read_models in charging DB to:
 *   1. Validate QR time window (startTime ± 15 minutes)
 *   2. Get depositAmount + depositTransactionId for billing reconciliation
 *   3. Validate connector type match
 *
 * Event payload (from BookingConfirmedEvent):
 *   bookingId, userId, chargerId, qrToken,
 *   depositAmount, startTime, endTime
 */
@Injectable()
export class BookingConfirmedSyncConsumer {
  private readonly logger = new Logger(BookingConfirmedSyncConsumer.name);

  constructor(
    @InjectRepository(BookingReadModelOrmEntity)
    private readonly repo: Repository<BookingReadModelOrmEntity>,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.confirmed',
    queue:        'charging-svc.booking.confirmed.sync',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    bookingId:          string;
    userId:             string;
    chargerId:          string;
    qrToken:            string;
    depositAmount:      number;
    depositTransactionId?: string;
    startTime:          string;
    endTime:            string;
    connectorType?:     string;
    eventId?:           string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `booking.confirmed.sync:${payload.bookingId}`;
    if (await this.peRepo.existsBy({ eventId })) return;

    await this.repo.upsert(
      {
        bookingId:           payload.bookingId,
        userId:              payload.userId,
        chargerId:           payload.chargerId,
        qrToken:             payload.qrToken,
        depositAmount:       payload.depositAmount,
        depositTransactionId: payload.depositTransactionId ?? null,
        startTime:           new Date(payload.startTime),
        endTime:             new Date(payload.endTime),
        connectorType:       payload.connectorType ?? null,
        syncedAt:            new Date(),
      },
      ['bookingId'],
    );

    this.logger.log(
      `BookingReadModel synced: booking=${payload.bookingId} ` +
      `charger=${payload.chargerId} window=${payload.startTime}~${payload.endTime}`,
    );

    await this.peRepo.save({ eventId, eventType: 'booking.confirmed' });
  }
}

/**
 * BookingCancelledSyncConsumer
 *
 * Deletes booking_read_model when booking is cancelled/expired/no-show.
 * Ensures QR is invalidated immediately and charger state is released.
 */
@Injectable()
export class BookingCancelledSyncConsumer {
  private readonly logger = new Logger(BookingCancelledSyncConsumer.name);

  constructor(
    @InjectRepository(BookingReadModelOrmEntity)
    private readonly repo: Repository<BookingReadModelOrmEntity>,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(ChargerStateOrmEntity)
    private readonly chargerStateRepo: Repository<ChargerStateOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    private readonly notifyQueueHead: NotifyQueueHeadUseCase,
  ) {}

  private async releaseCharger(bookingId: string): Promise<void> {
    try {
      const booking = await this.repo.findOneBy({ bookingId });
      if (booking) {
        const chargerId = booking.chargerId;
        const state = await this.chargerStateRepo.findOneBy({ chargerId });
        if (state && state.availability === 'reserved') {
          state.availability = 'available';
          state.updatedAt = new Date();
          await this.chargerStateRepo.save(state);
          this.logger.log(`Released charger ${chargerId} -> available because booking ${bookingId} ended/cancelled/no-show`);

          // Resolve stationId
          const chargerRm = await this.repo.manager.findOneBy(ChargerReadModelOrmEntity, { chargerId });
          const stationId = chargerRm?.stationId ?? 'unknown';

          // Emit charger.status.changed to sync ev-infrastructure-service
          const statusEventId = uuidv4();
          await this.outboxRepo.save(
            this.outboxRepo.create({
              id:            statusEventId,
              aggregateType: 'charger',
              aggregateId:   chargerId,
              eventType:     'charger.status.changed',
              payload:       { eventId: statusEventId, chargerId, stationId, newStatus: 'available', changedAt: new Date().toISOString() },
              status:        'pending',
              processedAt:   null,
            })
          );

          // Notify next user in virtual queue
          await this.notifyQueueHead.execute(chargerId);
        }
      }
    } catch (err) {
      this.logger.error(`Error releasing charger for booking ${bookingId}: ${err.message}`);
    }
  }

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.cancelled',
    queue:        'charging-svc.booking.cancelled.sync',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleCancelled(payload: { bookingId: string; eventId?: string }): Promise<void> {
    const eventId = payload.eventId ?? `booking.cancelled.sync:${payload.bookingId}`;
    if (await this.peRepo.existsBy({ eventId })) return;

    await this.releaseCharger(payload.bookingId);
    await this.repo.delete({ bookingId: payload.bookingId });
    this.logger.log(`BookingReadModel removed (cancelled): ${payload.bookingId}`);
    await this.peRepo.save({ eventId, eventType: 'booking.cancelled' });
  }

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.expired',
    queue:        'charging-svc.booking.expired.sync',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleExpired(payload: { bookingId: string; eventId?: string }): Promise<void> {
    const eventId = payload.eventId ?? `booking.expired.sync:${payload.bookingId}`;
    if (await this.peRepo.existsBy({ eventId })) return;

    await this.releaseCharger(payload.bookingId);
    await this.repo.delete({ bookingId: payload.bookingId });
    this.logger.log(`BookingReadModel removed (expired): ${payload.bookingId}`);
    await this.peRepo.save({ eventId, eventType: 'booking.expired' });
  }

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.no_show',
    queue:        'charging-svc.booking.no_show.sync',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleNoShow(payload: { bookingId: string; eventId?: string }): Promise<void> {
    const eventId = payload.eventId ?? `booking.no_show.sync:${payload.bookingId}`;
    if (await this.peRepo.existsBy({ eventId })) return;

    await this.releaseCharger(payload.bookingId);
    await this.repo.delete({ bookingId: payload.bookingId });
    this.logger.log(`BookingReadModel removed (no_show): ${payload.bookingId}`);
    await this.peRepo.save({ eventId, eventType: 'booking.no_show' });
  }
}
