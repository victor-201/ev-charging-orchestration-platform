import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import {
  BookingReadModelOrmEntity,
  ProcessedEventOrmEntity,
} from '../../persistence/typeorm/entities/session.orm-entities';

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
 * Deletes booking_read_model when booking is cancelled/expired.
 * Ensures QR is invalidated immediately.
 */
@Injectable()
export class BookingCancelledSyncConsumer {
  private readonly logger = new Logger(BookingCancelledSyncConsumer.name);

  constructor(
    @InjectRepository(BookingReadModelOrmEntity)
    private readonly repo: Repository<BookingReadModelOrmEntity>,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.cancelled',
    queue:        'charging-svc.booking.cancelled.sync',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleCancelled(payload: { bookingId: string; eventId?: string }): Promise<void> {
    const eventId = payload.eventId ?? `booking.cancelled.sync:${payload.bookingId}`;
    if (await this.peRepo.existsBy({ eventId })) return;

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

    await this.repo.delete({ bookingId: payload.bookingId });
    this.logger.log(`BookingReadModel removed (expired): ${payload.bookingId}`);
    await this.peRepo.save({ eventId, eventType: 'booking.expired' });
  }
}
