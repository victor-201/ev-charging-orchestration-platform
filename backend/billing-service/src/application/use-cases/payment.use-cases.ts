import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../../domain/entities/transaction.aggregate';
import { Wallet, WalletDomainException } from '../../domain/entities/wallet.aggregate';
import {
  PaymentCompletedEvent, PaymentFailedEvent,
  WalletTopupCompletedEvent, WalletArrearsClearedEvent,
} from '../../domain/events/payment.events';
import {
  IWalletRepository, WALLET_REPOSITORY,
} from '../../domain/repositories/wallet.repository.interface';
import {
  ITransactionRepository, TRANSACTION_REPOSITORY,
} from '../../domain/repositories/transaction.repository.interface';
import { VNPayService, VNPayReturnParams } from '../../infrastructure/vnpay/vnpay.service';
import {
  EVENT_BUS, IPaymentEventBus,
} from '../../infrastructure/messaging/outbox-event-bus';
import {
  ProcessedEventOrmEntity, InvoiceOrmEntity, TransactionOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/payment.orm-entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';



/**
 * Creates a pending Transaction and returns a VNPay payment URL.
 * No wallet deduction at this stage — payment is confirmed via VNPay callback.
 *
 * Flow:
 *  1. Create Transaction (pending)
 *  2. Attach VNPay reference code
 *  3. Save atomically
 *  4. Return VNPay payment URL
 */
@Injectable()
export class CreatePaymentUseCase {
  private readonly logger = new Logger(CreatePaymentUseCase.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    private readonly vnpay: VNPayService,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async execute(cmd: {
    userId: string;
    bookingId: string;
    amount: number;  // VND
    ipAddr?: string;
    bankCode?: string;
    relatedType?: string;
  }): Promise<{ transactionId: string; paymentUrl: string }> {
    const returnUrl = this.config.get('VNPAY_RETURN_URL', 'http://localhost:3005/api/v1/payments/vnpay-return');

    const finalAmount = Math.max(cmd.amount, 10000);

    // Create transaction record
    const txn = Transaction.create({
      userId:      cmd.userId,
      type:        'payment',
      amount:      finalAmount,
      method:      'bank_transfer',
      relatedId:   cmd.bookingId,
      relatedType: cmd.relatedType as any ?? 'booking',
    });

    // Generate unique txn ref for VNPay (max 100 chars)
    const txnRef = `EV${txn.id.replace(/-/g, '').substring(0, 16).toUpperCase()}`;
    const orderInfo = `EV booking payment ${cmd.bookingId.substring(0, 8)}`;

    const paymentUrl = this.vnpay.buildPaymentUrl({
      amount:    finalAmount,
      orderInfo,
      orderType: 'billpayment',
      txnRef,
      returnUrl,
      ipAddr:    cmd.ipAddr,
      bankCode:  cmd.bankCode,
    });

    txn.attachVNPayRef(txnRef, { bookingId: cmd.bookingId, orderInfo });

    await this.txRepo.save(txn);

    this.logger.log(`Payment initiated: tx=${txn.id} ref=${txnRef} amount=${finalAmount}`);
    return { transactionId: txn.id, paymentUrl };
  }
}



/**
 * Processes VNPay return/IPN callback.
 *
 * Security:
 * - Validates HMAC SHA512 checksum (rejects if invalid)
 * - Idempotent: processed_events table prevents double-processing
 *
 * Flow:
 *  1. Verify checksum → throw if invalid
 *  2. Idempotency check (processed_events)
 *  3. Find transaction by referenceCode
 *  4. Update status (completed / failed)
 *  5. Publish PaymentCompleted or PaymentFailed event to outbox
 *  6. Generate invoice
 *  7. Mark event as processed
 */
@Injectable()
export class HandleVNPayCallbackUseCase {
  private readonly logger = new Logger(HandleVNPayCallbackUseCase.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    private readonly vnpay: VNPayService,
    private readonly dataSource: DataSource,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(InvoiceOrmEntity)
    private readonly invoiceRepo: Repository<InvoiceOrmEntity>,
  ) {}

  async execute(params: VNPayReturnParams): Promise<{ status: 'success' | 'failed'; transactionId: string }> {
    // ── STEP 1: Validate checksum (security gate) ──────────────────────────
    const result = this.vnpay.verifyCallback(params); // throws on invalid

    const eventId = `vnpay:${result.txnRef}:${result.payDate}`;

    // ── STEP 2: Idempotency check ──────────────────────────────────────────
    const alreadyProcessed = await this.processedRepo.existsBy({ eventId });
    if (alreadyProcessed) {
      this.logger.warn(`Duplicate VNPay callback: ${eventId}`);
      const tx = await this.txRepo.findByReferenceCode(result.txnRef);
      return { status: tx?.status === 'completed' ? 'success' : 'failed', transactionId: tx?.id ?? '' };
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      // ── STEP 3: Find transaction ─────────────────────────────────────────
      const tx = await this.txRepo.findByReferenceCode(result.txnRef);
      if (!tx) {
        this.logger.error(`Transaction not found for txnRef=${result.txnRef}`);
        throw new Error(`Transaction not found: ${result.txnRef}`);
      }

      // ── STEP 4: Update transaction status ───────────────────────────────
      const events = [];
      if (result.isSuccess) {
        tx.complete(result.transactionNo);
        events.push(new PaymentCompletedEvent(
          tx.id, tx.userId, tx.amount, tx.relatedId, tx.relatedType,
        ));
        if (tx.type === 'topup') {
          const wallet = await this.walletRepo.findByUserId(tx.userId);
          if (wallet) {
            await this.walletRepo.lockForUpdate(wallet.id, manager);
            await this.walletRepo.credit(wallet.id, tx.id, tx.amount, manager);
            events.push(new WalletTopupCompletedEvent(
              wallet.id,
              tx.userId,
              tx.amount,
              tx.id,
            ));
          }
        }

        // ── Arrears direct payment: mark all unpaid/overdue invoices as paid ──
        if (tx.type === 'payment' && (tx.relatedType === 'arrears' || (tx.meta as any)?.type === 'arrears')) {
          const unpaidInvoices = await manager.find(InvoiceOrmEntity, {
            where: [
              { userId: tx.userId, status: 'unpaid' },
              { userId: tx.userId, status: 'overdue' },
            ],
          });
          for (const invoice of unpaidInvoices) {
            invoice.status = 'paid';
            await manager.save(InvoiceOrmEntity, invoice);
          }
          const wallet = await this.walletRepo.findByUserId(tx.userId);
          if (wallet) {
            events.push(new WalletArrearsClearedEvent(tx.userId, wallet.id));
          }
          this.logger.log(`Arrears settled via VNPay: user=${tx.userId} amount=${tx.amount} invoices=${unpaidInvoices.length}`);
        }
      } else {
        tx.fail(`VNPay responseCode=${result.responseCode}`);
        events.push(new PaymentFailedEvent(tx.id, tx.userId, `VNPay code ${result.responseCode}`));
      }

      await this.txRepo.save(tx, manager);

      // ── STEP 5: Publish to outbox ────────────────────────────────────────
      await this.eventBus.publishAll(events, manager);

      // ── STEP 6: Generate invoice (if payment success) ────────────────────
      if (result.isSuccess) {
        const invoice = manager.create(InvoiceOrmEntity, {
          id:            uuidv4(),
          transactionId: tx.id,
          userId:        tx.userId,
          totalAmount:   tx.amount,
          dueDate:       null,
          status:        'paid',
        });
        await manager.save(InvoiceOrmEntity, invoice);
      }

      // ── STEP 7: Mark as processed ────────────────────────────────────────
      await manager.save(ProcessedEventOrmEntity, {
        eventId,
        eventType: 'vnpay.callback',
      });

      this.logger.log(`VNPay callback processed: tx=${tx.id} success=${result.isSuccess}`);
      return { status: result.isSuccess ? 'success' : 'failed', transactionId: tx.id };
    });
  }
}



/**
 * Initiate VNPay payment to top up wallet balance.
 * Actual credit happens in HandleVNPayCallbackUseCase after payment confirmed.
 */
@Injectable()
export class WalletTopupInitUseCase {
  private readonly logger = new Logger(WalletTopupInitUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    private readonly vnpay: VNPayService,
    private readonly config: ConfigService,
  ) {}

  async execute(cmd: {
    userId: string;
    amount: number;
    ipAddr?: string;
    bankCode?: string;
  }): Promise<{ transactionId: string; paymentUrl: string }> {
    let wallet = await this.walletRepo.findByUserId(cmd.userId);
    if (!wallet) {
      wallet = Wallet.create({ userId: cmd.userId });
      await this.walletRepo.save(wallet);
    }

    wallet.validateCredit(cmd.amount);

    const finalAmount = Math.max(cmd.amount, 10000);

    const txn = Transaction.create({
      userId: cmd.userId,
      type:   'topup',
      amount: finalAmount,
      method: 'bank_transfer',
    });

    const txnRef   = `TOPUP${txn.id.replace(/-/g, '').substring(0, 14).toUpperCase()}`;
    const returnUrl = this.config.get('VNPAY_RETURN_URL', 'http://localhost:3005/api/v1/payments/vnpay-return');

    const paymentUrl = this.vnpay.buildPaymentUrl({
      amount:    finalAmount,
      orderInfo: `EV wallet topup user ${cmd.userId.substring(0, 8)}`,
      orderType: 'topup',
      txnRef,
      returnUrl,
      ipAddr:    cmd.ipAddr,
      bankCode:  cmd.bankCode,
    });

    txn.attachVNPayRef(txnRef, { walletId: wallet.id, type: 'topup' });
    await this.txRepo.save(txn);

    return { transactionId: txn.id, paymentUrl };
  }
}



@Injectable()
export class WalletPayUseCase {
  private readonly logger = new Logger(WalletPayUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    private readonly dataSource: DataSource,
    @InjectRepository(InvoiceOrmEntity)
    private readonly invoiceRepo: Repository<InvoiceOrmEntity>,
  ) {}

  async execute(cmd: {
    userId: string;
    bookingId: string;
    amount: number;
  }): Promise<{ transactionId: string; balanceAfter: number }> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const wallet = await this.walletRepo.findByUserId(cmd.userId);
      if (!wallet) throw new Error('Wallet not found — user must create wallet first');

      // Lock wallet row first to serialize wallet updates
      await this.walletRepo.lockForUpdate(wallet.id, manager);

      // Check if there is already a completed transaction for this bookingId to prevent double charge
      const existingTx = await manager.findOne(TransactionOrmEntity, {
        where: { relatedId: cmd.bookingId, relatedType: 'booking', status: 'completed' },
      });
      if (existingTx) {
        const balance = await this.walletRepo.getBalance(wallet.id, manager);
        this.logger.warn(`Booking ${cmd.bookingId} has already been paid/completed (txId=${existingTx.id}). Skipping double debit.`);
        return { transactionId: existingTx.id, balanceAfter: balance };
      }

      // Get current balance
      const balance = await this.walletRepo.getBalance(wallet.id, manager);

      // Domain validation (throws InsufficientBalanceException)
      wallet.validateDebit(cmd.amount, balance);

      // Create transaction
      const txn = Transaction.create({
        userId:      cmd.userId,
        type:        'payment',
        amount:      cmd.amount,
        method:      'wallet',
        relatedId:   cmd.bookingId,
        relatedType: 'booking',
      });
      await this.txRepo.save(txn, manager);

      // Debit wallet via stored procedure (row-lock + ledger append atomic)
      const balanceAfter = await this.walletRepo.debit(wallet.id, txn.id, cmd.amount, manager);

      txn.complete();
      await this.txRepo.save(txn, manager);

      // Publish event
      const event = new PaymentCompletedEvent(txn.id, cmd.userId, cmd.amount, cmd.bookingId, 'booking');
      await this.eventBus.publishAll([event], manager);

      // Generate invoice
      await manager.save(InvoiceOrmEntity, manager.create(InvoiceOrmEntity, {
        id:            uuidv4(),
        transactionId: txn.id,
        userId:        cmd.userId,
        totalAmount:   cmd.amount,
        dueDate:       null,
        status:        'paid',
      }));

      this.logger.log(`Wallet payment completed: tx=${txn.id} amount=${cmd.amount} balance=${balanceAfter}`);
      return { transactionId: txn.id, balanceAfter };
    });
  }
}



@Injectable()
export class GetWalletBalanceUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: IWalletRepository,
    @InjectRepository(InvoiceOrmEntity)
    private readonly invoiceRepo: Repository<InvoiceOrmEntity>,
    @InjectRepository(TransactionOrmEntity)
    private readonly txRepo: Repository<TransactionOrmEntity>,
  ) {}

  async execute(userId: string): Promise<{
    walletId: string;
    balance: number;
    currency: string;
    hasArrears: boolean;
    arrearsAmount: number;
    totalTransactionsCount: number;
    totalTopUpAmount: number;
  }> {
    const wallet = await this.walletRepo.findByUserId(userId);
    if (!wallet) {
      return {
        walletId: '',
        balance: 0,
        currency: 'VND',
        hasArrears: false,
        arrearsAmount: 0,
        totalTransactionsCount: 0,
        totalTopUpAmount: 0.0,
      };
    }
    const balance = await this.walletRepo.getBalance(wallet.id);

    // Treat unpaid/overdue invoices as arrears
    const unpaidInvoices = await this.invoiceRepo.find({
      where: [
        { userId, status: 'unpaid' },
        { userId, status: 'overdue' },
      ],
    });

    const hasArrears = unpaidInvoices.length > 0;
    const arrearsAmount = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

    // Calculate database stats
    const totalTransactionsCount = await this.txRepo.count({
      where: { userId, status: 'completed' as any },
    });

    const topupSumResult = await this.txRepo
      .createQueryBuilder('t')
      .select('SUM(t.amount)', 'sum')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.type = :type', { type: 'topup' })
      .andWhere('t.status = :status', { status: 'completed' })
      .getRawOne();
    const totalTopUpAmount = Number(topupSumResult?.sum ?? 0);

    return {
      walletId: wallet.id,
      balance,
      currency: wallet.currency,
      hasArrears,
      arrearsAmount,
      totalTransactionsCount,
      totalTopUpAmount,
    };
  }
}



@Injectable()
export class GetTransactionHistoryUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
  ) {}

  async execute(
    userId: string,
    limit = 20,
    offset = 0,
    isAdmin = false,
    type?: string,
    status?: string,
  ): Promise<{ items: Transaction[]; total: number }> {
    if (isAdmin) {
      const [items, total] = await Promise.all([
        this.txRepo.findAll(limit, offset, type, status),
        this.txRepo.countAll(type, status),
      ]);
      return { items, total };
    }
    const [items, total] = await Promise.all([
      this.txRepo.findByUserId(userId, limit, offset, type, status),
      this.txRepo.countByUserId(userId, type, status),
    ]);
    return { items, total };
  }
}



@Injectable()
export class GetPaymentUseCase {
  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
  ) {}

  async execute(transactionId: string): Promise<Transaction | null> {
    return this.txRepo.findById(transactionId);
  }
}


// Strategy: try wallet first, fallback to VNPay gateway
// Idempotency: if idempotencyKey already processed → return cached result

@Injectable()
export class PaymentOrchestratorUseCase {
  private readonly logger = new Logger(PaymentOrchestratorUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    private readonly walletPay: WalletPayUseCase,
    private readonly createPayment: CreatePaymentUseCase,
    private readonly dataSource: DataSource,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
  ) {}

  async execute(cmd: {
    userId: string;
    sessionId: string;
    bookingId: string;
    amount: number;
    idempotencyKey: string;
    ipAddr?: string;
  }): Promise<{
    method: 'wallet' | 'gateway';
    transactionId: string;
    paymentUrl?: string;
    balanceAfter?: number;
    status: string;
  }> {
    // Idempotency: check if already processed
    const cached = await this.processedRepo.findOne({
      where: { eventId: `orchestrator:${cmd.idempotencyKey}` },
    });
    if (cached) {
      this.logger.warn(`Idempotent payment request: ${cmd.idempotencyKey}`);
      const tx = await this.txRepo.findByReferenceCode(cmd.idempotencyKey);
      return {
        method: tx?.method === 'wallet' ? 'wallet' : 'gateway',
        transactionId: tx?.id ?? '',
        status: tx?.status ?? 'unknown',
      };
    }

    // Try wallet payment first
    try {
      const wallet = await this.walletRepo.findByUserId(cmd.userId);
      if (wallet) {
        const balance = await this.walletRepo.getBalance(wallet.id);
        if (balance >= cmd.amount) {
          const result = await this.walletPay.execute({
            userId: cmd.userId,
            bookingId: cmd.bookingId,
            amount: cmd.amount,
          });

          await this.processedRepo.save({
            eventId: `orchestrator:${cmd.idempotencyKey}`,
            eventType: 'payment.orchestrated.wallet',
          });

          this.logger.log(`Payment orchestrated via wallet: ${result.transactionId}`);
          return { method: 'wallet', transactionId: result.transactionId, balanceAfter: result.balanceAfter, status: 'completed' };
        }
      }
    } catch (err) {
      this.logger.warn(`Wallet payment failed, falling back to gateway: ${err}`);
    }

    // Fallback: VNPay gateway
    const result = await this.createPayment.execute({
      userId: cmd.userId,
      bookingId: cmd.bookingId,
      amount: cmd.amount,
      ipAddr: cmd.ipAddr,
    });

    await this.processedRepo.save({
      eventId: `orchestrator:${cmd.idempotencyKey}`,
      eventType: 'payment.orchestrated.gateway',
    });

    this.logger.log(`Payment orchestrated via gateway: ${result.transactionId}`);
    return { method: 'gateway', transactionId: result.transactionId, paymentUrl: result.paymentUrl, status: 'pending' };
  }
}



@Injectable()
export class RefundUseCase {
  private readonly logger = new Logger(RefundUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    private readonly dataSource: DataSource,
    @InjectRepository(InvoiceOrmEntity)
    private readonly invoiceRepo: Repository<InvoiceOrmEntity>,
  ) {}

  async execute(cmd: {
    originalTransactionId: string;
    reason: string;
    refundedBy?: string;
  }): Promise<{ refundTransactionId: string }> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const originalTx = await this.txRepo.findById(cmd.originalTransactionId);
      if (!originalTx) throw new Error(`Transaction ${cmd.originalTransactionId} not found`);
      if (originalTx.status !== 'completed') {
        throw new Error(`Cannot refund transaction in status: ${originalTx.status}`);
      }

      const refundTxn = Transaction.create({
        userId:      originalTx.userId,
        type:        'refund',
        amount:      originalTx.amount,
        method:      originalTx.method,
        relatedId:   cmd.originalTransactionId,
        relatedType: 'charging_session',
      });

      await this.txRepo.save(refundTxn, manager);

      // If original was wallet payment → credit back
      if (originalTx.method === 'wallet') {
        const wallet = await this.walletRepo.findByUserId(originalTx.userId);
        if (wallet) {
          await this.walletRepo.credit(wallet.id, refundTxn.id, originalTx.amount, manager);
        }
      }

      refundTxn.complete();
      await this.txRepo.save(refundTxn, manager);

      const event = new WalletTopupCompletedEvent(
        refundTxn.id,
        originalTx.userId,
        originalTx.amount,
        `Refund: ${cmd.reason}`,
      );
      await this.eventBus.publishAll([event], manager);

      this.logger.log(`Refund processed: ${refundTxn.id} for original ${cmd.originalTransactionId}`);
      return { refundTransactionId: refundTxn.id };
    });
  }
}



@Injectable()
export class TransactionReconciliationJob {
  private readonly logger = new Logger(TransactionReconciliationJob.name);

  constructor(
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
  ) {}

  // Called from @Cron in module
  async run(): Promise<void> {
    this.logger.log('Running transaction reconciliation...');

    /**
     * Booking PAYMENT_HOLD_MINUTES = 5 minutes.
     * Booking deposit transactions must complete within 5 minutes.
     * Timeout = 7 minutes = 5-min hold + 2-min processing buffer.
     * Other transactions (topup, refund) are not affected as they
     * complete almost instantly via wallet or VNPay IPN.
     */
    const BOOKING_DEPOSIT_TIMEOUT_MS = 7 * 60_000; // 7 minutes
    const cutoff = new Date(Date.now() - BOOKING_DEPOSIT_TIMEOUT_MS);
    const stuckTxns = await this.txRepo.findPendingBefore(cutoff);

    for (const tx of stuckTxns) {
      tx.fail('Auto-cancelled: payment timeout after 7 minutes (booking expired)');
      await this.txRepo.save(tx);
      this.logger.warn(`Auto-cancelled stuck transaction: ${tx.id}`);
    }

    this.logger.log(`Reconciliation complete: cancelled ${stuckTxns.length} stuck transactions`);
  }
}


@Injectable()
export class PayArrearsUseCase {
  private readonly logger = new Logger(PayArrearsUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    @Inject(EVENT_BUS)              private readonly eventBus: IPaymentEventBus,
    private readonly dataSource: DataSource,
    @InjectRepository(InvoiceOrmEntity)
    private readonly invoiceRepo: Repository<InvoiceOrmEntity>,
  ) {}

  async execute(cmd: { userId: string }): Promise<{ success: boolean; clearedAmount: number }> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const wallet = await this.walletRepo.findByUserId(cmd.userId);
      if (!wallet) throw new Error('Wallet not found');

      // Lock wallet row
      await this.walletRepo.lockForUpdate(wallet.id, manager);

      // Find all unpaid/overdue invoices
      const unpaidInvoices = await manager.find(InvoiceOrmEntity, {
        where: [
          { userId: cmd.userId, status: 'unpaid' },
          { userId: cmd.userId, status: 'overdue' },
        ],
      });

      if (unpaidInvoices.length === 0) {
        return { success: true, clearedAmount: 0 };
      }

      const totalArrears = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
      const balance = await this.walletRepo.getBalance(wallet.id, manager);

      if (balance < totalArrears) {
        throw new WalletDomainException(`Insufficient balance to pay arrears. Required: ${totalArrears}, Available: ${balance}`);
      }

      // Create transaction
      const txn = Transaction.create({
        userId:      cmd.userId,
        type:        'payment',
        amount:      totalArrears,
        method:      'wallet',
        relatedId:   unpaidInvoices[0].id,
        relatedType: 'charging_session',
      });
      await this.txRepo.save(txn, manager);

      // Debit wallet
      const balanceAfter = await this.walletRepo.debit(wallet.id, txn.id, totalArrears, manager);

      txn.complete();
      await this.txRepo.save(txn, manager);

      // Mark invoices as paid
      for (const invoice of unpaidInvoices) {
        invoice.status = 'paid';
        await manager.save(InvoiceOrmEntity, invoice);
      }

      // Publish WalletArrearsClearedEvent
      const clearEvent = new WalletArrearsClearedEvent(cmd.userId, wallet.id);
      await this.eventBus.publishAll([clearEvent], manager);

      this.logger.log(`Arrears settled: user=${cmd.userId} amount=${totalArrears} balance=${balanceAfter}`);
      return { success: true, clearedAmount: totalArrears };
    });
  }
}


/**
 * Initiate a direct VNPay payment to settle all outstanding arrears.
 * The user pays the exact total debt via VNPay gateway;
 * their EVolt wallet balance is NOT affected.
 * HandleVNPayCallbackUseCase settles the invoices after the VNPay callback.
 */
@Injectable()
export class PayArrearsVNPayInitUseCase {
  private readonly logger = new Logger(PayArrearsVNPayInitUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY)      private readonly walletRepo: IWalletRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly txRepo: ITransactionRepository,
    private readonly vnpay: VNPayService,
    private readonly config: ConfigService,
    @InjectRepository(InvoiceOrmEntity)
    private readonly invoiceRepo: Repository<InvoiceOrmEntity>,
  ) {}

  async execute(cmd: {
    userId: string;
    ipAddr?: string;
    bankCode?: string;
  }): Promise<{ transactionId: string; paymentUrl: string; totalArrears: number }> {
    // Fetch all outstanding invoices
    const unpaidInvoices = await this.invoiceRepo.find({
      where: [
        { userId: cmd.userId, status: 'unpaid' },
        { userId: cmd.userId, status: 'overdue' },
      ],
    });

    if (unpaidInvoices.length === 0) {
      throw new Error('NO_ARREARS: User has no outstanding arrears to pay');
    }

    const totalArrears = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    const finalAmount = Math.max(totalArrears, 10000);

    // Create a pending transaction to track this arrears payment
    // NOTE: relatedId is null because arrears don't link to a single booking/session UUID.
    // The arrears context is stored in meta.
    const txn = Transaction.create({
      userId:      cmd.userId,
      type:        'payment',
      amount:      finalAmount,
      method:      'bank_transfer',
      relatedId:   undefined,      // NOT a UUID, leave null
      relatedType: undefined,      // 'arrears' not in DB enum, stored in meta
    });

    const txnRef   = `ARREARS${txn.id.replace(/-/g, '').substring(0, 12).toUpperCase()}`;
    const returnUrl = this.config.get('VNPAY_RETURN_URL', 'http://localhost:3005/api/v1/payments/vnpay-return');

    const paymentUrl = this.vnpay.buildPaymentUrl({
      amount:    finalAmount,
      orderInfo: `EV arrears payment user ${cmd.userId.substring(0, 8)}`,
      orderType: 'billpayment',
      txnRef,
      returnUrl,
      ipAddr:   cmd.ipAddr,
      bankCode: cmd.bankCode,
    });

    txn.attachVNPayRef(txnRef, { type: 'arrears', invoiceCount: unpaidInvoices.length, vnpayTxnRef: txnRef });
    await this.txRepo.save(txn);

    this.logger.log(`Arrears VNPay initiated: user=${cmd.userId} total=${finalAmount} txnRef=${txnRef}`);
    return { transactionId: txn.id, paymentUrl, totalArrears };
  }
}
