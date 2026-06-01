import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { v4 as uuidv4 } from 'uuid';

import { AggregationEngine } from '../../../domain/services/aggregation.engine';
import { ProcessedEventOrmEntity, EventLogOrmEntity } from '../../persistence/typeorm/entities/analytics.orm-entities';
import {
  SessionCompletedPayload,
  SessionStartedPayload,
  PaymentCompletedPayload,
  BookingCreatedPayload,
  BookingConfirmedPayload,
  BookingCancelledPayload,
} from '../../../domain/events/analytics-inbound.events';

/**
 * SessionEventConsumer
 *
 * Listens for: session.started, session.completed.
 *
 * session.started: Logs the event to track active sessions.
 * session.completed: Triggers the aggregation engine for:
 *   - daily_station_metrics (sessions, kwh, avg_duration)
 *   - hourly_usage_stats (peak detection)
 *   - daily_user_metrics
 *   - user_behavior_stats
 *
 * Idempotent: Verifies processed_events before execution.
 */
@Injectable()
export class SessionEventConsumer {
  private readonly logger = new Logger(SessionEventConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(EventLogOrmEntity)
    private readonly logRepo: Repository<EventLogOrmEntity>,
    private readonly aggregation: AggregationEngine,
    private readonly ds: DataSource,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'session.started',
    queue:        'analytics.session.started',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onSessionStarted(payload: SessionStartedPayload): Promise<void> {
    const eventId = this.extractEventId(payload, 'session.started');
    if (!(await this.checkAndMarkProcessed(eventId, 'session.started'))) return;

    await this.logEvent(payload, 'charging-control-service');
    this.logger.log(`Session started tracked: sessionId=${payload.sessionId}`);
  }

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'session.completed',
    queue:        'analytics.session.completed',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onSessionCompleted(payload: SessionCompletedPayload): Promise<void> {
    const eventId = this.extractEventId(payload, 'session.completed');
    if (!(await this.checkAndMarkProcessed(eventId, 'session.completed'))) return;

    await this.logEvent(payload, 'charging-control-service');

    const stationId = payload.stationId ?? null;

    await this.aggregation.onSessionCompleted({
      sessionId:       payload.sessionId,
      stationId,
      chargerId:       payload.chargerId,
      userId:          payload.userId,
      kwhConsumed:     payload.kwhConsumed,
      durationMinutes: payload.durationMinutes,
      occurredAt:      new Date(payload.endTime ?? Date.now()),
    });

    this.logger.log(
      `Session completed aggregated: session=${payload.sessionId} kwh=${payload.kwhConsumed} min=${payload.durationMinutes}`,
    );
  }

  // helpers

  private extractEventId(payload: any, fallbackPrefix: string): string {
    return payload?.eventId ?? `${fallbackPrefix}:${payload?.sessionId ?? uuidv4()}`;
  }

  private async checkAndMarkProcessed(eventId: string, eventType: string): Promise<boolean> {
    const exists = await this.peRepo.findOneBy({ eventId: eventId });
    if (exists) {
      this.logger.debug(`Duplicate event ${eventId}, skipping`);
      return false;
    }
    await this.peRepo.save(
      this.peRepo.create({ eventId: eventId, eventType }),
    );
    return true;
  }

  private async logEvent(payload: any, source: string): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        id:            uuidv4(),
        eventType:     payload.eventType ?? 'unknown',
        sourceService: source,
        aggregateId:   payload.sessionId ?? payload.bookingId ?? null,
        userId:        payload.userId ?? null,
        payload,
      }),
    );
  }
}

/**
 * Listens for: payment.completed.
 *
 * → revenue_stats (monthly per station)
 * → daily_station_metrics.total_revenue_vnd
 * → daily_user_metrics.amount_spent_vnd
 *
 * Idempotent.
 */
@Injectable()
export class PaymentEventConsumer {
  private readonly logger = new Logger(PaymentEventConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(EventLogOrmEntity)
    private readonly logRepo: Repository<EventLogOrmEntity>,
    private readonly aggregation: AggregationEngine,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'payment.completed',
    queue:        'analytics.payment.completed',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onPaymentCompleted(payload: PaymentCompletedPayload): Promise<void> {
    const eventId = payload.eventId ?? `payment.completed:${payload.transactionId}`;

    const exists = await this.peRepo.findOneBy({ eventId: eventId });
    if (exists) {
      this.logger.debug(`Duplicate payment event ${eventId}, skipping`);
      return;
    }
    await this.peRepo.save(
      this.peRepo.create({ eventId: eventId, eventType: 'payment.completed' }),
    );

    // Log event
    await this.logRepo.save(
      this.logRepo.create({
        id:            uuidv4(),
        eventType:     'payment.completed',
        sourceService: 'payment-service',
        aggregateId:   payload.transactionId,
        userId:        payload.userId,
        payload,
      }),
    );

    // Enrich stationId from relatedId when possible.
    // (Production note: perform lookup from booking_log or ensure stationId is explicitly sent)
    const stationId = (payload as any).stationId ?? null;

    await this.aggregation.onPaymentCompleted({
      transactionId: payload.transactionId,
      userId:        payload.userId,
      amountVnd:     payload.amount,
      stationId,
      bookingId:     payload.relatedId,
      occurredAt:    new Date(payload.occurredAt ?? Date.now()),
    });

    this.logger.log(
      `Payment aggregated: txn=${payload.transactionId} amount=${payload.amount}VND`,
    );
  }
}

/**
 * Listens for: booking.created, booking.confirmed, booking.cancelled.
 *
 * → booking_stats per station per day
 * Idempotent.
 */
@Injectable()
export class BookingEventConsumer {
  private readonly logger = new Logger(BookingEventConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(EventLogOrmEntity)
    private readonly logRepo: Repository<EventLogOrmEntity>,
    private readonly aggregation: AggregationEngine,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.created',
    queue:        'analytics.booking.created',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onBookingCreated(payload: BookingCreatedPayload): Promise<void> {
    await this.processBookingEvent(payload, 'booking.created');
  }

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.confirmed',
    queue:        'analytics.booking.confirmed',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onBookingConfirmed(payload: BookingConfirmedPayload): Promise<void> {
    await this.processBookingEvent(payload, 'booking.confirmed');
  }

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.cancelled',
    queue:        'analytics.booking.cancelled',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onBookingCancelled(payload: BookingCancelledPayload): Promise<void> {
    await this.processBookingEvent(payload, 'booking.cancelled');
  }

  private async processBookingEvent(payload: any, eventType: string): Promise<void> {
    const eventId = payload.eventId ?? `${eventType}:${payload.bookingId}`;

    const exists = await this.peRepo.findOneBy({ eventId: eventId });
    if (exists) return;

    await this.peRepo.save(
      this.peRepo.create({ eventId: eventId, eventType }),
    );

    await this.logRepo.save(
      this.logRepo.create({
        id:            uuidv4(),
        eventType,
        sourceService: 'booking-service',
        aggregateId:   payload.bookingId,
        userId:        payload.userId ?? null,
        payload,
      }),
    );

    const stationId = payload.stationId ?? null;
    await this.aggregation.onBookingEvent({
      eventType: eventType as 'booking.created' | 'booking.confirmed' | 'booking.cancelled',
      bookingId:  payload.bookingId,
      stationId,
      userId:     payload.userId ?? 'unknown',
      occurredAt: new Date(payload.createdAt ?? Date.now()),
    });

    this.logger.log(`Booking event ${eventType}: booking=${payload.bookingId} station=${stationId}`);
  }
}

// Tracks: booking.expired, booking.no_show, charger.fault.detected

@Injectable()
export class OperationalEventConsumer {
  private readonly logger = new Logger(OperationalEventConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(EventLogOrmEntity)
    private readonly logRepo: Repository<EventLogOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.expired',
    queue:        'analytics.booking.expired',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onBookingExpired(payload: any): Promise<void> {
    await this.logOperation(payload, 'booking.expired', 'booking-service', payload.bookingId);
  }

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'booking.no_show',
    queue:        'analytics.booking.no_show',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onBookingNoShow(payload: any): Promise<void> {
    await this.logOperation(payload, 'booking.no_show', 'booking-service', payload.bookingId);
  }

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'charger.fault.detected',
    queue:        'analytics.charger.fault',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onChargerFault(payload: any): Promise<void> {
    await this.logOperation(payload, 'charger.fault.detected', 'charging-service', payload.chargerId);
  }

  private async logOperation(payload: any, eventType: string, source: string, aggregateId: string): Promise<void> {
    const eventId = payload.eventId ?? `${eventType}:${aggregateId}:${Date.now()}`;

    const exists = await this.peRepo.findOneBy({ eventId });
    if (exists) return;

    await this.peRepo.save(this.peRepo.create({ eventId, eventType }));
    await this.logRepo.save(this.logRepo.create({
      id:            uuidv4(),
      eventType,
      sourceService: source,
      aggregateId,
      userId:        payload.userId ?? null,
      payload,
    }));

    this.logger.log(`Operational event tracked: ${eventType} aggregate=${aggregateId}`);
  }
}

// Tracks payment.failed events → failure_rate per charger/station

@Injectable()
export class PaymentFailureAnalyticsConsumer {
  private readonly logger = new Logger(PaymentFailureAnalyticsConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(EventLogOrmEntity)
    private readonly logRepo: Repository<EventLogOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'payment.failed',
    queue:        'analytics.payment.failed',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onPaymentFailed(payload: {
    eventId?: string;
    transactionId: string;
    userId: string;
    reason?: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `payment.failed:${payload.transactionId}`;
    const exists = await this.peRepo.findOneBy({ eventId });
    if (exists) return;

    await this.peRepo.save(this.peRepo.create({ eventId, eventType: 'payment.failed' }));
    await this.logRepo.save(this.logRepo.create({
      id:            uuidv4(),
      eventType:     'payment.failed',
      sourceService: 'payment-service',
      aggregateId:   payload.transactionId,
      userId:        payload.userId,
      payload,
    }));

    this.logger.log(`Payment failure tracked: txn=${payload.transactionId} reason=${payload.reason ?? 'unknown'}`);
  }
}

// Tracks wallet.arrears.created → bad debt rate per station

@Injectable()
export class ArrearsAnalyticsConsumer {
  private readonly logger = new Logger(ArrearsAnalyticsConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(EventLogOrmEntity)
    private readonly logRepo: Repository<EventLogOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'wallet.arrears.created',
    queue:        'analytics.wallet.arrears.created',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async onArrearsCreated(payload: {
    eventId?: string;
    userId: string;
    walletId: string;
    arrearsAmount: number;
    sessionId: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `wallet.arrears.created:${payload.sessionId}`;
    const exists = await this.peRepo.findOneBy({ eventId });
    if (exists) return;

    await this.peRepo.save(this.peRepo.create({ eventId, eventType: 'wallet.arrears.created' }));
    await this.logRepo.save(this.logRepo.create({
      id:            uuidv4(),
      eventType:     'wallet.arrears.created',
      sourceService: 'payment-service',
      aggregateId:   payload.sessionId,
      userId:        payload.userId,
      payload,
    }));

    this.logger.warn(`Arrears tracked: user=${payload.userId} amount=${payload.arrearsAmount}VND session=${payload.sessionId}`);
  }
}


