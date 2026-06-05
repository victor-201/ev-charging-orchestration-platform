import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { v4 as uuidv4 } from 'uuid';

import {
  IWalletRepository, WALLET_REPOSITORY,
} from '../../../domain/repositories/wallet.repository.interface';
import {
  ITransactionRepository, TRANSACTION_REPOSITORY,
} from '../../../domain/repositories/transaction.repository.interface';
import { Transaction } from '../../../domain/entities/transaction.aggregate';
import {
  RefundCompletedEvent,
  WalletArrearsCreatedEvent,
  WalletArrearsClearedEvent,
  PaymentCompletedEvent,
  PaymentFailedEvent,
  IdleFeeChargedEvent,
  ExtraChargeDebitedEvent,
  RefundIssuedEvent,
} from '../../../domain/events/payment.events';
import {
  EVENT_BUS, IPaymentEventBus,
} from '../outbox-event-bus';
import {
  ProcessedEventOrmEntity,
  InvoiceOrmEntity,
  WalletOrmEntity,
  TransactionOrmEntity,
} from '../../persistence/typeorm/entities/payment.orm-entities';
import { Inject } from '@nestjs/common';
import { KIOSK_GUEST_USER_ID } from '../../../shared/constants';

// SessionReservedConsumer

/**
 * Listens for booking.deposit_requested from the Booking Service.
 *
 * Automatically deducts the deposit from the User's Wallet:
 * 1. Verifies that the wallet balance is greater than or equal to the depositAmount.
 * 2. If sufficient funds exist: deducts from the wallet, creates a completed Transaction, and emits a PaymentCompletedEvent.
 * 3. If funds are insufficient: emits a PaymentFailedEvent, which triggers the Booking Service to expire the booking.
 *
 * PaymentCompletedEvent with relatedType='booking' is consumed by the Booking Service.
 * Triggers automatic confirmWithPayment() and generates a QR Token.
 */
@Injectable()
export class SessionReservedConsumer {
  private readonly logger = new Logger(SessionReservedConsumer.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey: 'session.reserved',
    queue: 'billing-svc.session.reserved',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    eventId?:      string;
    bookingId:     string;
    userId:        string;
    chargerId:     string;
    depositAmount: number;
    correlationId?: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `session.reserved:${payload.bookingId}`;

    const exists = await this.peRepo.existsBy({ eventId });
    if (exists) {
      this.logger.debug(`[SAGA] Duplicate event ${eventId}, skipping`);
      return;
    }
    await this.peRepo.save({ eventId, eventType: 'session.reserved' });

    this.logger.log(
      `[SAGA] Booking reserved (bookingId=${payload.bookingId}, userId=${payload.userId}). ` +
      `Skipping automatic wallet deduction as per explicit payment requirement.`
    );
  }
}

// BookingCancelledConsumer

/**
 * Listens for booking.cancelled from the Booking Service.
 *
 * Refunds 100% of the deposit directly to the wallet:
 * - Whether the initial payment was made via VNPay or the wallet, the refund is always credited to the wallet.
 * - Keeps funds within the application's ecosystem.
 */
@Injectable()
export class BookingCancelledConsumer {
  private readonly logger = new Logger(BookingCancelledConsumer.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey: 'booking.cancelled',
    queue: 'billing-svc.session.cancelled',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    eventId?: string;
    bookingId: string;
    userId: string;
    chargerId: string;
    reason: string;
    depositTransactionId?: string;
    refundAmount: number;
  }): Promise<void> {
    if (!payload.depositTransactionId || payload.refundAmount <= 0) return;

    const eventId = payload.eventId ?? `booking.cancelled:${payload.bookingId}`;
    const exists  = await this.peRepo.existsBy({ eventId });
    if (exists) return;
    await this.peRepo.save({ eventId, eventType: 'booking.cancelled' });

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const wallet = await this.walletRepo.findByUserId(payload.userId);
      if (!wallet) {
        this.logger.error(`Wallet not found for user ${payload.userId} — cannot refund`);
        return;
      }

      const refundTxn = Transaction.create({
        userId:      payload.userId,
        type:        'refund',
        amount:      payload.refundAmount,
        method:      'wallet',
        relatedId:   payload.bookingId,
        relatedType: 'booking',
        meta:        { reason: 'booking_cancelled', originalTxId: payload.depositTransactionId },
      });
      await this.txRepo.save(refundTxn, manager);

      await this.walletRepo.credit(wallet.id, refundTxn.id, payload.refundAmount, manager);
      refundTxn.complete();
      await this.txRepo.save(refundTxn, manager);

      const event = new RefundCompletedEvent(
        refundTxn.id,
        payload.userId,
        payload.refundAmount,
        payload.bookingId,
        'booking_cancelled',
      );
      await this.eventBus.publishAll([event], manager);

      this.logger.log(
        `Refund OK: booking=${payload.bookingId} amount=${payload.refundAmount}VND → wallet user=${payload.userId}`,
      );
    });
  }
}

// BookingNoShowConsumer

/**
 * Listens for booking.no_show from the Booking Service.
 *
 * Processes No-Show penalties:
 * 1. Deducts the penalty fee (pre-calculated in the aggregate as 20% of the deposit).
 * 2. Refunds the remaining 80% to the wallet.
 */
@Injectable()
export class BookingNoShowConsumer {
  private readonly logger = new Logger(BookingNoShowConsumer.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey: 'booking.no_show',
    queue: 'billing-svc.session.no_show',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    eventId?: string;
    bookingId: string;
    userId: string;
    chargerId: string;
    penaltyAmount: number;
    refundAmount: number;
    depositTransactionId?: string;
  }): Promise<void> {
    if (!payload.depositTransactionId) return;

    const eventId = payload.eventId ?? `booking.no_show:${payload.bookingId}`;
    const exists  = await this.peRepo.existsBy({ eventId });
    if (exists) return;
    await this.peRepo.save({ eventId, eventType: 'booking.no_show' });

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const wallet = await this.walletRepo.findByUserId(payload.userId);
      if (!wallet) return;

      if (payload.refundAmount > 0) {
        const refundTxn = Transaction.create({
          userId:      payload.userId,
          type:        'refund',
          amount:      payload.refundAmount,
          method:      'wallet',
          relatedId:   payload.bookingId,
          relatedType: 'booking',
          meta:        {
            reason: 'no_show_partial_refund',
            penaltyAmount: payload.penaltyAmount,
            originalTxId:  payload.depositTransactionId,
          },
        });
        await this.txRepo.save(refundTxn, manager);
        await this.walletRepo.credit(wallet.id, refundTxn.id, payload.refundAmount, manager);
        refundTxn.complete();
        await this.txRepo.save(refundTxn, manager);

        const event = new RefundCompletedEvent(
          refundTxn.id,
          payload.userId,
          payload.refundAmount,
          payload.bookingId,
          'no_show_partial_refund',
        );
        await this.eventBus.publishAll([event], manager);
      }

      this.logger.warn(
        `No-Show penalty: booking=${payload.bookingId} user=${payload.userId} ` +
        `penalty=${payload.penaltyAmount}VND refund=${payload.refundAmount}VND`,
      );
    });
  }
}

// SessionCompletedBillingConsumer (Billing Reconciliation)

/**
 * Listens for session.completed from the session-service (after OCPP transmits StopTransaction).
 *
 * Flow:
 *   1. Calls the ev-infrastructure-service to calculate the exact fees (TOU + Idle Fee).
 *   2. Compares the total fee with the held deposit.
 *   3. Case 1: totalFee < deposit — Refunds the surplus to the wallet and emits a RefundIssuedEvent.
 *   4. Case 2: totalFee > deposit — Deducts additional funds from the wallet and emits an ExtraChargeDebitedEvent.
 *      If the wallet balance is insufficient: records the debt (arrears) and suspends the account.
 *   5. If idleFeeVnd > 0: emits an IdleFeeChargedEvent (separate notification).
 *   6. Generates the final invoice.
 */
@Injectable()
export class SessionCompletedBillingConsumer {
  private readonly logger = new Logger(SessionCompletedBillingConsumer.name);

  private readonly infraBaseUrl: string;

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(InvoiceOrmEntity)
    private readonly invoiceRepo: Repository<InvoiceOrmEntity>,
    @InjectRepository(WalletOrmEntity)
    private readonly walletOrmRepo: Repository<WalletOrmEntity>,
    private readonly dataSource: DataSource,
  ) {
    this.infraBaseUrl = process.env['EV_INFRA_BASE_URL'] ?? 'http://ev-infrastructure:3003';
  }

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'session.completed',
    queue:        'billing-svc.session.completed',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    eventId?:     string;
    sessionId:    string;
    userId:       string;
    chargerId:    string;
    stationId:    string;
    connectorType: string;
    bookingId?:   string;
    kwhConsumed:  number;
    idleMinutes:  number;
    startTime:    string;
    depositAmount?: number;
    depositTransactionId?: string;
    durationMinutes: number;
  }): Promise<void> {
    const eventId = payload.eventId ?? `session.completed:${payload.sessionId}`;
    const exists  = await this.peRepo.existsBy({ eventId });
    if (exists) return;
    await this.peRepo.save({ eventId, eventType: 'session.completed' });

    if (payload.userId === KIOSK_GUEST_USER_ID) {
      this.logger.log(`Session completed for kiosk user: session=${payload.sessionId}. Skipping wallet billing reconciliation.`);
      return;
    }

    let energyFeeVnd = 0;
    let idleFeeVnd   = 0;
    let totalFeeVnd  = 0;
    let ruleId: string | null = null;
    let chargeableIdleMinutes = 0;
    let idleFeePerMinuteVnd   = 1_000;
    let idleGraceMinutes      = 20;

    try {
      const feeBreakdown = await this.fetchSessionFee(payload);
      energyFeeVnd          = feeBreakdown.energyFeeVnd;
      idleFeeVnd            = feeBreakdown.idleFeeVnd;
      totalFeeVnd           = feeBreakdown.totalFeeVnd;
      ruleId                = feeBreakdown.ruleId;
      chargeableIdleMinutes = feeBreakdown.chargeableIdleMinutes;
      idleFeePerMinuteVnd   = feeBreakdown.idleFeePerMinuteVnd;
      idleGraceMinutes      = feeBreakdown.idleGraceMinutes;

      this.logger.log(
        `Pricing OK session=${payload.sessionId}: ` +
        `energy=${energyFeeVnd} idle=${idleFeeVnd} total=${totalFeeVnd} rule=${ruleId}`,
      );
    } catch (err) {
      this.logger.error(`Pricing API failed — using upstream values: ${err}`);
      energyFeeVnd = Math.ceil((payload.kwhConsumed ?? 0) * 3_500);
      if (energyFeeVnd < 1000) {
        energyFeeVnd = 1000;
      }
      idleFeeVnd   = Math.ceil(Math.max(0, (payload.idleMinutes ?? 0) - 20) * 1_000);
      totalFeeVnd  = energyFeeVnd + idleFeeVnd;
      chargeableIdleMinutes = Math.max(0, (payload.idleMinutes ?? 0) - 20);
    }

    const depositAmt = payload.depositAmount ?? 0;
    const diff       = totalFeeVnd - depositAmt;

    this.logger.log(
      `Reconcile session=${payload.sessionId} totalFee=${totalFeeVnd} deposit=${depositAmt} diff=${diff}`,
    );

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const wallet = await this.walletRepo.findByUserId(payload.userId);
      if (!wallet) {
        this.logger.error(`No wallet for user ${payload.userId} — session ${payload.sessionId}`);
        return;
      }

      const eventsToEmit: any[] = [];

      if (idleFeeVnd > 0) {
        const idleTxn = Transaction.create({
          userId:      payload.userId,
          type:        'payment',
          amount:      idleFeeVnd,
          method:      'wallet',
          relatedId:   payload.sessionId,
          relatedType: 'charging_session',
          meta: {
            reason: 'idle_fee',
            chargeableIdleMinutes,
            idleFeePerMinuteVnd,
            idleGraceMinutes,
          },
        });
        await this.txRepo.save(idleTxn, manager);
        idleTxn.complete();
        await this.txRepo.save(idleTxn, manager);

        eventsToEmit.push(new IdleFeeChargedEvent(
          payload.sessionId, payload.userId,
          idleFeeVnd, chargeableIdleMinutes,
          idleFeePerMinuteVnd, idleGraceMinutes,
          idleTxn.id,
        ));
      }

      if (diff < -1) {
        const refundAmt = Math.abs(diff);
        const refundTxn = Transaction.create({
          userId:      payload.userId,
          type:        'refund',
          amount:      refundAmt,
          method:      'wallet',
          relatedId:   payload.sessionId,
          relatedType: 'charging_session',
          meta: { reason: 'deposit_overpaid', depositAmount: depositAmt, totalFeeVnd },
        });
        await this.txRepo.save(refundTxn, manager);
        await this.walletRepo.credit(wallet.id, refundTxn.id, refundAmt, manager);
        refundTxn.complete();
        await this.txRepo.save(refundTxn, manager);

        eventsToEmit.push(new RefundIssuedEvent(
          payload.sessionId, payload.userId,
          refundAmt, depositAmt, totalFeeVnd, refundTxn.id,
        ));

        this.logger.log(`Refunded surplus: ${refundAmt}VND to wallet of user=${payload.userId}`);

      } else if (diff > 1) {
        const balance = await this.walletRepo.getBalance(wallet.id, manager);

        if (balance >= diff) {
          await this.walletRepo.lockForUpdate(wallet.id, manager);
          const chargeTxn = Transaction.create({
            userId:      payload.userId,
            type:        'payment',
            amount:      diff,
            method:      'wallet',
            relatedId:   payload.sessionId,
            relatedType: 'charging_session',
            meta: { reason: 'deposit_underpaid', depositAmount: depositAmt, totalFeeVnd },
          });
          await this.txRepo.save(chargeTxn, manager);
          await this.walletRepo.debit(wallet.id, chargeTxn.id, diff, manager);
          chargeTxn.complete();
          await this.txRepo.save(chargeTxn, manager);

          eventsToEmit.push(new ExtraChargeDebitedEvent(
            payload.sessionId, payload.userId,
            diff, depositAmt, totalFeeVnd, chargeTxn.id,
          ));

          this.logger.log(`Deducted extra: ${diff}VND from wallet of user=${payload.userId}`);
        } else {
          const arrearsAmount = diff - balance;
          this.logger.error(
            `Insufficient funds: user=${payload.userId}, deficit=${diff}VND, balance=${balance}VND — recorded arrears: ${arrearsAmount}VND`,
          );

          if (balance > 1) {
            const partialTxn = Transaction.create({
              userId:      payload.userId,
              type:        'payment',
              amount:      balance,
              method:      'wallet',
              relatedId:   payload.sessionId,
              relatedType: 'charging_session',
              meta: { reason: 'partial_payment', arrearsAmount, totalFeeVnd },
            });
            await this.txRepo.save(partialTxn, manager);
            await this.walletRepo.debit(wallet.id, partialTxn.id, balance, manager);
            partialTxn.complete();
            await this.txRepo.save(partialTxn, manager);
          }

          eventsToEmit.push(new WalletArrearsCreatedEvent(
            payload.userId, wallet.id, arrearsAmount, payload.sessionId,
          ));

          eventsToEmit.push(new ExtraChargeDebitedEvent(
            payload.sessionId, payload.userId,
            diff, depositAmt, totalFeeVnd, 'arrears',
          ));
        }
      }
      try {
        const invoice2 = manager.create(InvoiceOrmEntity, {
          id:            uuidv4(),
          transactionId: payload.depositTransactionId ?? uuidv4(),
          userId:        payload.userId,
          totalAmount:   totalFeeVnd,
          dueDate:       null as any,
          status:        'paid',
        });
        await manager.save(invoice2);
      } catch {
        // Ignores unique constraint violations if the invoice already exists.
      }

      // Publish PaymentCompletedEvent to transition session stop -> billed -> completed
      eventsToEmit.push(new PaymentCompletedEvent(
        payload.depositTransactionId ?? uuidv4(),
        payload.userId,
        totalFeeVnd,
        payload.sessionId,
        'charging_session',
      ));

      // Publish all events.
      if (eventsToEmit.length > 0) {
        await this.eventBus.publishAll(eventsToEmit, manager);
      }
    });
  }

  private async fetchSessionFee(payload: {
    chargerId: string;
    stationId: string;
    connectorType: string;
    startTime: string;
    kwhConsumed: number;
    idleMinutes: number;
  }): Promise<{
    energyFeeVnd: number;
    idleFeeVnd: number;
    totalFeeVnd: number;
    ruleId: string | null;
    chargeableIdleMinutes: number;
    idleFeePerMinuteVnd: number;
    idleGraceMinutes: number;
  }> {
    const url = `${this.infraBaseUrl}/api/v1/stations/${payload.stationId}/chargers/${payload.chargerId}/pricing/calculate-session-fee`;

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorType: payload.connectorType,
        startTime:     payload.startTime,
        kwhConsumed:   payload.kwhConsumed,
        idleMinutes:   payload.idleMinutes,
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`Pricing API HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json() as any;
  }
}

// WalletTopupConsumer (automatic debt settlement)

/**
 * When a user successfully tops up:
 * 1. If the user has outstanding debt: automatically settles it.
 * 2. If debt is 0: unlocks the account (emits WalletArrearsClearedEvent).
 */
@Injectable()
export class WalletTopupArrearsClearConsumer {
  private readonly logger = new Logger(WalletTopupArrearsClearConsumer.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'wallet.topup.completed',
    queue:        'payment-svc.wallet.topup.arrears',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    eventId?: string;
    walletId: string;
    userId: string;
    amount: number;
    transactionId: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `wallet.topup.arrears:${payload.transactionId}`;
    const exists  = await this.peRepo.existsBy({ eventId });
    if (exists) return;
    await this.peRepo.save({ eventId, eventType: 'wallet.topup.arrears.check' });

    await this.dataSource.transaction(async (manager) => {
      const wallet = await this.walletRepo.findByUserId(payload.userId);
      if (!wallet) return;

      const currentBalance = await this.walletRepo.getBalance(wallet.id, manager);

      // Emits event for other services to check for arrears.
      // Only emitted if the top-up amount is significant (> 1000 VND).
      if (payload.amount > 1000) {
        const clearEvent = new WalletArrearsClearedEvent(payload.userId, wallet.id);
        await this.eventBus.publishAll([clearEvent], manager);

        this.logger.log(
          `Wallet topup: user=${payload.userId} amount=${payload.amount}VND ` +
          `balance=${currentBalance}VND — WalletArrearsClearedEvent emitted for downstream check`,
        );
      }
    });
  }
}




