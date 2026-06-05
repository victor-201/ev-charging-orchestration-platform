import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

import { DeliveryEngine } from '../../../domain/services/delivery.engine';
import { ProcessedEventOrmEntity } from '../../persistence/typeorm/entities/notification.orm-entities';
import { NOTIFICATION_TEMPLATES } from '../../../domain/events/notification.events';
import { NotificationChannel } from '../../../domain/entities/notification.aggregate';
import type {
  BookingCreatedEvent, BookingConfirmedEvent, BookingCancelledEvent,
  PaymentCompletedEvent, PaymentFailedEvent,
  SessionStartedEvent, SessionCompletedEvent, SessionTelemetryPushEvent,
  QueueUpdatedEvent,
  BillingIdleFeeChargedEvent, BillingExtraChargeEvent, BillingRefundIssuedEvent,
  WalletArrearsCreatedEvent, WalletArrearsClearedEvent,
  ChargerQueueReadyEvent,
  EmailVerificationRequestedEvent,
} from '../../../domain/events/notification.events';

/**
 * DLQ_OPTS: standard queueOptions for all notification consumers.
 *
 * x-dead-letter-exchange: failed messages -> DLQ fanout exchange.
 * x-message-ttl: messages expire after 24h if not consumed -> DLQ.
 * x-delivery-limit: max 3 delivery attempts before DLQ (requires RabbitMQ Quorum Queues).
 */
function buildQueueOpts(routingKeyStr?: string) {
  const opts: any = {
    durable: true,
    deadLetterExchange: 'ev.charging.dlx',
    arguments: { 'x-message-ttl': 86400000 },
  };
  if (routingKeyStr) opts.arguments['x-dead-letter-routing-key'] = routingKeyStr;
  return opts;
}


/**
 * NotificationConsumers: Event-Driven Notification Triggers
 *
 * Each consumer:
 * 1. Idempotency check (processed_events PK lookup)
 * 2. Mark processed
 * 3. Build notification content from template registry
 * 4. Delegate to DeliveryEngine (persist + dispatch channels)
 *
 * Channels per event type:
 *   booking.created    -> in_app + push
 *   booking.confirmed  -> in_app + push (booking_update realtime)
 *   booking.cancelled  -> in_app + push (booking_update realtime)
 *   payment.completed  -> push + in_app
 *   payment.failed     -> push + in_app
 *   session.started    -> push + in_app (charging_update realtime)
 *   session.completed  -> push + email (charging_update realtime)
 *   queue.updated      -> in_app (queue_update realtime)
 */

// BookingNotificationConsumer

@Injectable()
export class BookingNotificationConsumer {
  private readonly logger = new Logger(BookingNotificationConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.created',
    queue: 'notification.booking.created',
    queueOptions: buildQueueOpts('dlq.notification.booking.created'),
  })
  async onBookingCreated(payload: BookingCreatedEvent): Promise<void> {
    const eventId = payload.eventId ?? `booking.created:${payload.bookingId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'booking.created', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['booking.created'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'booking.created',
      channels: ['in_app', 'push'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: { bookingId: payload.bookingId, startTime: payload.startTime },
    });

    this.logger.log(`booking.created notification: user=${payload.userId} booking=${payload.bookingId}`);
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.confirmed',
    queue: 'notification.booking.confirmed',
    queueOptions: buildQueueOpts(),
  })
  async onBookingConfirmed(payload: BookingConfirmedEvent): Promise<void> {
    const eventId = payload.eventId ?? `booking.confirmed:${payload.bookingId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'booking.confirmed', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['booking.confirmed'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'booking.confirmed',
      channels: ['in_app', 'push'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: { bookingId: payload.bookingId },
      realtimePayload: {
        bookingUpdate: {
          bookingId: payload.bookingId,
          status: 'confirmed',
          message: tpl.body(payload),
          metadata: { stationId: payload.stationId },
        },
      },
    });
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.cancelled',
    queue: 'notification.booking.cancelled',
    queueOptions: buildQueueOpts('dlq.notification.booking.cancelled'),
  })
  async onBookingCancelled(payload: BookingCancelledEvent): Promise<void> {
    const eventId = payload.eventId ?? `booking.cancelled:${payload.bookingId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'booking.cancelled', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['booking.cancelled'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'booking.cancelled',
      channels: ['in_app', 'push'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: { bookingId: payload.bookingId, reason: payload.reason },
      realtimePayload: {
        bookingUpdate: {
          bookingId: payload.bookingId,
          status: 'cancelled',
          message: tpl.body(payload),
        },
      },
    });
  }
}

// PaymentNotificationConsumer

@Injectable()
export class PaymentNotificationConsumer {
  private readonly logger = new Logger(PaymentNotificationConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'payment.completed',
    queue: 'notification.payment.completed',
    queueOptions: buildQueueOpts(),
  })
  async onPaymentCompleted(payload: PaymentCompletedEvent): Promise<void> {
    const eventId = payload.eventId ?? `payment.completed:${payload.transactionId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'payment.completed', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['payment.completed'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'payment.completed',
      channels: ['push', 'in_app'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: { transactionId: payload.transactionId, amount: payload.amount },
    });
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'payment.failed',
    queue: 'notification.payment.failed',
    queueOptions: buildQueueOpts(),
  })
  async onPaymentFailed(payload: PaymentFailedEvent): Promise<void> {
    const eventId = payload.eventId ?? `payment.failed:${payload.transactionId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'payment.failed', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['payment.failed'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'payment.failed',
      channels: ['push', 'in_app'],
      title: tpl.title(payload),
      // Use reason from PaymentFailedEvent (contains information about the amount to deposit)
      body: payload.reason ?? tpl.body(payload),
      metadata: { transactionId: payload.transactionId, reason: payload.reason },
    });
  }
}

// ChargingNotificationConsumer

@Injectable()
export class ChargingNotificationConsumer {
  private readonly logger = new Logger(ChargingNotificationConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'session.started',
    queue: 'notification.charging.started',
    queueOptions: buildQueueOpts(),
  })
  async onSessionStarted(payload: SessionStartedEvent): Promise<void> {
    const eventId = payload.eventId ?? `session.started:${payload.sessionId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'session.started', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['session.started'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'session.started',
      channels: ['push', 'in_app'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: { sessionId: payload.sessionId, chargerId: payload.chargerId },
      realtimePayload: {
        chargingUpdate: {
          sessionId: payload.sessionId,
          eventType: 'session.started',
          message: tpl.body(payload),
        },
      },
    });

    this.logger.log(`session.started notification: user=${payload.userId} session=${payload.sessionId}`);
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'session.completed',
    queue: 'notification.charging.completed',
    queueOptions: buildQueueOpts(),
  })
  async onSessionCompleted(payload: SessionCompletedEvent): Promise<void> {
    const eventId = payload.eventId ?? `session.completed:${payload.sessionId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'session.completed', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['session.completed'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'session.completed',
      channels: ['push', 'email'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        sessionId: payload.sessionId,
        kwhConsumed: payload.kwhConsumed,
        durationMinutes: payload.durationMinutes,
      },
      realtimePayload: {
        chargingUpdate: {
          sessionId: payload.sessionId,
          eventType: 'session.completed',
          kwhConsumed: payload.kwhConsumed,
          durationMin: payload.durationMinutes,
          message: tpl.body(payload),
        },
      },
    });
  }
}

// QueueNotificationConsumer

@Injectable()
export class QueueNotificationConsumer {
  private readonly logger = new Logger(QueueNotificationConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'queue.*',
    queue: 'notification.queue',
    queueOptions: buildQueueOpts(),
  })
  async onQueueUpdated(payload: QueueUpdatedEvent): Promise<void> {
    const eventId = payload.eventId ?? `queue.updated:${payload.queueId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'queue.updated', this.peRepo);

    const isCalled = payload.status === 'called';
    const tpl = NOTIFICATION_TEMPLATES['queue.updated'];

    // When user's turn is called, send push notification too (reliable delivery)
    const channels: NotificationChannel[] = isCalled ? ['in_app', 'push'] : ['in_app'];

    await this.engine.dispatch({
      userId: payload.userId,
      type: 'queue.updated',
      channels,
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        queueId: payload.queueId,
        position: payload.position,
        estimatedWaitMinutes: payload.estimatedWaitMinutes,
        status: payload.status,
        chargerId: payload.chargerId,
      },
      realtimePayload: {
        queueUpdate: {
          queueId: payload.queueId,
          position: payload.position,
          estimatedWaitMinutes: payload.estimatedWaitMinutes,
          status: payload.status,
          chargerId: payload.chargerId,
        },
      },
    });

    this.logger.log(
      `queue.updated notification: user=${payload.userId} position=${payload.position} status=${payload.status}`,
    );
  }
}

// BookingLifecycleExtendedConsumer
// Handles: booking.expired, booking.no_show

@Injectable()
export class BookingLifecycleExtendedConsumer {
  private readonly logger = new Logger(BookingLifecycleExtendedConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.expired',
    queue: 'notification.booking.expired',
    queueOptions: buildQueueOpts(),
  })
  async onBookingExpired(payload: {
    eventId?: string;
    bookingId: string;
    userId: string;
    chargerId: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `booking.expired:${payload.bookingId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'booking.expired', this.peRepo);

    await this.engine.dispatch({
      userId: payload.userId,
      type: 'booking.expired',
      channels: ['in_app', 'push'],
      title: 'Booking Expired',
      body: 'Your booking has been automatically cancelled due to unpaid deposit within 5 minutes. Please check your wallet balance and try again.',
      metadata: { bookingId: payload.bookingId },
    });

    this.logger.log(`booking.expired notification: user=${payload.userId} booking=${payload.bookingId}`);
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.no_show',
    queue: 'notification.booking.no_show',
    queueOptions: buildQueueOpts(),
  })
  async onBookingNoShow(payload: {
    eventId?: string;
    bookingId: string;
    userId: string;
    chargerId: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `booking.no_show:${payload.bookingId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'booking.no_show', this.peRepo);

    await this.engine.dispatch({
      userId: payload.userId,
      type: 'booking.no_show',
      channels: ['in_app', 'push'],
      title: 'Booking Cancelled (No-Show)',
      body: 'Your booking has been marked as no-show. The slot has been released for others.',
      metadata: { bookingId: payload.bookingId },
      realtimePayload: {
        bookingUpdate: {
          bookingId: payload.bookingId,
          status: 'no_show',
          message: 'Lịch sạc bị hủy do không đến đúng giờ hẹn. Trụ sạc đã được giải phóng.',
        },
      },
    });

    this.logger.log(`booking.no_show notification: user=${payload.userId} booking=${payload.bookingId}`);
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.reminder.upcoming',
    queue: 'notification.booking.reminder.upcoming',
    queueOptions: buildQueueOpts(),
  })
  async onBookingReminderUpcoming(payload: {
    eventId?: string;
    bookingId: string;
    userId: string;
    startTime: string;
    customTitle?: string;
    customBody?: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `booking.reminder.upcoming:${payload.bookingId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'booking.reminder.upcoming', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['booking.reminder.upcoming'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'booking.reminder.upcoming',
      channels: ['in_app', 'push'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        bookingId: payload.bookingId,
        startTime: payload.startTime,
        customTitle: payload.customTitle,
        customBody: payload.customBody,
      },
    });

    this.logger.log(`booking.reminder.upcoming notification sent for user=${payload.userId} booking=${payload.bookingId}`);
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.reminder.payment_expiry',
    queue: 'notification.booking.reminder.payment_expiry',
    queueOptions: buildQueueOpts(),
  })
  async onBookingReminderPaymentExpiry(payload: {
    eventId?: string;
    bookingId: string;
    userId: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `booking.reminder.payment_expiry:${payload.bookingId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'booking.reminder.payment_expiry', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['booking.reminder.payment_expiry'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'booking.reminder.payment_expiry',
      channels: ['in_app', 'push'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: { bookingId: payload.bookingId },
    });

    this.logger.log(`booking.reminder.payment_expiry notification sent for user=${payload.userId} booking=${payload.bookingId}`);
  }
}

// FaultNotificationConsumer

@Injectable()
export class FaultNotificationConsumer {
  private readonly logger = new Logger(FaultNotificationConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'charger.fault.detected',
    queue: 'notification.charger.fault',
    queueOptions: buildQueueOpts(),
  })
  async onChargerFault(payload: {
    eventId?: string;
    chargerId: string;
    sessionId?: string;
    errorCode: string;
    detectedAt: string;
    affectedUserId?: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `charger.fault:${payload.chargerId}:${payload.detectedAt}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'charger.fault.detected', this.peRepo);

    // Notify affected user (if session active)
    if (payload.affectedUserId) {
      await this.engine.dispatch({
        userId: payload.affectedUserId,
        type: 'charger.fault',
        channels: ['push', 'in_app'],
        title: 'Sự cố trạm sạc',
        body: `Trạm sạc đang gặp sự cố (mã: ${payload.errorCode}). Nhân viên đang xử lý.`,
        metadata: { chargerId: payload.chargerId, errorCode: payload.errorCode },
        realtimePayload: {
          chargingUpdate: {
            sessionId: payload.sessionId,
            eventType: 'charger.fault',
            message: `Charger fault: ${payload.errorCode}`,
          },
        },
      });
    }

    this.logger.warn(
      `charger.fault notification: charger=${payload.chargerId} code=${payload.errorCode}`,
    );
  }
}

// BillingNotificationConsumer
// billing.idle_fee_charged | billing.extra_charge | billing.refund_issued

@Injectable()
export class BillingNotificationConsumer {
  private readonly logger = new Logger(BillingNotificationConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'billing.idle_fee_charged',
    queue: 'notification.billing.idle_fee',
    queueOptions: buildQueueOpts(),
  })
  async onIdleFeeCharged(payload: BillingIdleFeeChargedEvent): Promise<void> {
    const eventId = payload.eventId ?? `billing.idle_fee:${payload.sessionId}:${payload.transactionId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'billing.idle_fee_charged', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['billing.idle_fee_charged'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'billing.idle_fee_charged',
      channels: ['push', 'in_app'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        sessionId: payload.sessionId,
        idleFeeVnd: payload.idleFeeVnd,
        chargeableIdleMinutes: payload.chargeableIdleMinutes,
        idleFeePerMinuteVnd: payload.idleFeePerMinuteVnd,
        idleGraceMinutes: payload.idleGraceMinutes,
        transactionId: payload.transactionId,
      },
    });

    this.logger.warn(
      `billing.idle_fee: user=${payload.userId} fee=${payload.idleFeeVnd}VND idleMin=${payload.chargeableIdleMinutes}`,
    );
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'billing.extra_charge',
    queue: 'notification.billing.extra_charge',
    queueOptions: buildQueueOpts(),
  })
  async onExtraCharge(payload: BillingExtraChargeEvent): Promise<void> {
    const eventId = payload.eventId ?? `billing.extra_charge:${payload.sessionId}:${payload.transactionId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'billing.extra_charge', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['billing.extra_charge'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'billing.extra_charge',
      channels: ['push', 'in_app'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        sessionId: payload.sessionId,
        extraAmountVnd: payload.extraAmountVnd,
        depositAmount: payload.depositAmount,
        totalFeeVnd: payload.totalFeeVnd,
        transactionId: payload.transactionId,
      },
    });

    this.logger.log(
      `billing.extra_charge: user=${payload.userId} extra=${payload.extraAmountVnd}VND`,
    );
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'billing.refund_issued',
    queue: 'notification.billing.refund',
    queueOptions: buildQueueOpts(),
  })
  async onRefundIssued(payload: BillingRefundIssuedEvent): Promise<void> {
    const eventId = payload.eventId ?? `billing.refund:${payload.sessionId}:${payload.transactionId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'billing.refund_issued', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['billing.refund_issued'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'billing.refund_issued',
      channels: ['push', 'in_app'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        sessionId: payload.sessionId,
        refundAmountVnd: payload.refundAmountVnd,
        depositAmount: payload.depositAmount,
        totalFeeVnd: payload.totalFeeVnd,
        transactionId: payload.transactionId,
      },
    });

    this.logger.log(
      `billing.refund_issued: user=${payload.userId} refund=${payload.refundAmountVnd}VND`,
    );
  }
}

// WalletArrearsNotificationConsumer
// Handles: wallet.arrears.created, wallet.arrears.cleared

@Injectable()
export class WalletArrearsNotificationConsumer {
  private readonly logger = new Logger(WalletArrearsNotificationConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'wallet.arrears.created',
    queue: 'notification.wallet.arrears.created',
    queueOptions: buildQueueOpts(),
  })
  async onArrearsCreated(payload: WalletArrearsCreatedEvent): Promise<void> {
    const eventId = payload.eventId ?? `wallet.arrears.created:${payload.transactionId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'wallet.arrears.created', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['wallet.arrears.created'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'wallet.arrears.created',
      channels: ['push', 'in_app'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        arrearsAmount: payload.arrearsAmount,
        totalOutstanding: payload.totalOutstanding,
        transactionId: payload.transactionId,
        relatedSessionId: payload.relatedSessionId,
        dueDate: payload.dueDate,
      },
    });

    this.logger.warn(
      `wallet.arrears.created: user=${payload.userId} amount=${payload.arrearsAmount}VND total=${payload.totalOutstanding}VND`,
    );
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'wallet.arrears.cleared',
    queue: 'notification.wallet.arrears.cleared',
    queueOptions: buildQueueOpts(),
  })
  async onArrearsCleared(payload: WalletArrearsClearedEvent): Promise<void> {
    const eventId = payload.eventId ?? `wallet.arrears.cleared:${payload.transactionId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'wallet.arrears.cleared', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['wallet.arrears.cleared'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'wallet.arrears.cleared',
      channels: ['push', 'in_app'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        clearedAmount: payload.clearedAmount,
        totalOutstanding: payload.totalOutstanding,
        transactionId: payload.transactionId,
      },
    });

    this.logger.log(
      `wallet.arrears.cleared: user=${payload.userId} cleared=${payload.clearedAmount}VND`,
    );
  }
}

// ChargerQueueReadyNotificationConsumer
// Handles: charger.queue.ready (notify user at front of queue that charger is free)

@Injectable()
export class ChargerQueueReadyNotificationConsumer {
  private readonly logger = new Logger(ChargerQueueReadyNotificationConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'charger.queue.ready',
    queue: 'notification.charger.queue.ready',
    queueOptions: buildQueueOpts(),
  })
  async onChargerQueueReady(payload: ChargerQueueReadyEvent): Promise<void> {
    const eventId = payload.eventId ?? `charger.queue.ready:${payload.queueId}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'charger.queue.ready', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['charger.queue.ready'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'charger.queue.ready',
      channels: ['push', 'in_app'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        queueId: payload.queueId,
        chargerId: payload.chargerId,
        stationId: payload.stationId,
        stationName: payload.stationName,
        chargerName: payload.chargerName,
        position: payload.position,
      },
      realtimePayload: {
        queueUpdate: {
          chargerId: payload.chargerId,
          queueId: payload.queueId,
          status: 'called',
          position: payload.position,
        },
      },
    });

    this.logger.log(
      `charger.queue.ready: user=${payload.userId} charger=${payload.chargerId} station=${payload.stationName ?? payload.stationId}`,
    );
  }
}

// AuthNotificationConsumer

@Injectable()
export class AuthNotificationConsumer {
  private readonly logger = new Logger(AuthNotificationConsumer.name);

  constructor(
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging', // IAM service publishes to ev.charging
    routingKey: 'user.email_verification_requested',
    queue: 'notification.user.email_verification',
    queueOptions: buildQueueOpts(),
  })
  async onEmailVerificationRequested(payload: EmailVerificationRequestedEvent): Promise<void> {
    const eventId = payload.eventId ?? `user.email_verification:${payload.userId}:${Date.now()}`;
    if (await this.engine.isProcessed(eventId, this.peRepo)) return;
    await this.engine.markProcessed(eventId, 'user.email_verification_requested', this.peRepo);

    const tpl = NOTIFICATION_TEMPLATES['user.email_verification_requested'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'user.email_verification_requested' as any, // Not yet in NotificationType enum, using as any for now or need to add it
      channels: ['email'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: {
        targetEmail: payload.email,
        rawToken: payload.rawToken,
        shortCode: payload.shortCode,
      },
    });

    this.logger.log(`user.email_verification_requested notification: email=${payload.email}`);
  }
}

/**
 * SessionTelemetryPushConsumer
 *
 * Listens for session.telemetry events and sends FCM data-only push notifications
 * with real-time telemetry data. Throttled to 1 push per 30 seconds per session
 * to avoid flooding the user with notifications.
 *
 * The push is a data-only message (no visible notification banner unless the app
 * chooses to show one) so the mobile app can display the latest telemetry values
 * even when in background.
 */
@Injectable()
export class SessionTelemetryPushConsumer {
  private readonly logger = new Logger(SessionTelemetryPushConsumer.name);
  private static readonly PUSH_THROTTLE_MS = 30_000;
  private static lastPushedAt = new Map<string, number>();

  constructor(
    private readonly engine: DeliveryEngine,
  ) { }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'session.telemetry',
    queue: 'notification.charging.telemetry',
    queueOptions: buildQueueOpts(),
  })
  async onTelemetry(payload: SessionTelemetryPushEvent): Promise<void> {
    // Throttle: only push every 30 seconds per session
    const lastPush = SessionTelemetryPushConsumer.lastPushedAt.get(payload.sessionId) ?? 0;
    const now = Date.now();
    if (now - lastPush < SessionTelemetryPushConsumer.PUSH_THROTTLE_MS) return;
    SessionTelemetryPushConsumer.lastPushedAt.set(payload.sessionId, now);

    // Build telemetry data payload for the FCM data message
    const tpl = NOTIFICATION_TEMPLATES['session.telemetry_push'];
    await this.engine.dispatch({
      userId: payload.userId,
      type: 'session.telemetry_push' as any,
      channels: ['push'],
      title: tpl.title(payload),
      body: tpl.body(payload),
      metadata: { telemetry: true, silent: true },
    });

    this.logger.debug(
      `Telemetry push: user=${payload.userId} session=${payload.sessionId} ` +
      `power=${payload.powerKw}kW soc=${payload.socPercent}%`,
    );
  }
}
