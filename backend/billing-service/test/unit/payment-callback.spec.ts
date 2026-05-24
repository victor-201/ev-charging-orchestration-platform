/**
 * Tests: VNPay Callback Verification + Idempotency
 *
 * No database required — mocks all dependencies.
 * Test focus: domain logic and security invariants.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { HandleVNPayCallbackUseCase } from '../../src/application/use-cases/payment.use-cases';
import { VNPayService } from '../../src/infrastructure/vnpay/vnpay.service';
import { TRANSACTION_REPOSITORY } from '../../src/domain/repositories/transaction.repository.interface';
import { WALLET_REPOSITORY } from '../../src/domain/repositories/wallet.repository.interface';
import { EVENT_BUS } from '../../src/infrastructure/messaging/outbox-event-bus';
import {
  ProcessedEventOrmEntity,
  InvoiceOrmEntity,
} from '../../src/infrastructure/persistence/typeorm/entities/payment.orm-entities';
import { Transaction } from '../../src/domain/entities/transaction.aggregate';

// Helpers

function makePendingTransaction(overrides?: Partial<any>): Transaction {
  return Transaction.reconstitute({
    id:            'tx-001',
    userId:        'user-001',
    type:          'payment',
    amount:        100000,
    currency:      'VND',
    method:        'bank_transfer',
    relatedId:     'booking-001',
    relatedType:   'booking',
    status:        'pending',
    externalId:    null,
    referenceCode: 'EVABCDEF12345678',
    meta:          { bookingId: 'booking-001' },
    createdAt:     new Date(),
    updatedAt:     new Date(),
    ...overrides,
  });
}

function makeValidReturnParams(overrides?: Record<string, string>) {
  return {
    vnp_Amount:            '10000000',   // 100,000 VND × 100
    vnp_BankCode:          'NCB',
    vnp_BankTranNo:        'VNP14345678',
    vnp_CardType:          'ATM',
    vnp_OrderInfo:         'Thanh toan dat san EV booking-001',
    vnp_PayDate:           '20260412143000',
    vnp_ResponseCode:      '00',
    vnp_TmnCode:           'EVCHARGE01',
    vnp_TransactionNo:     '14345678',
    vnp_TransactionStatus: '00',
    vnp_TxnRef:            'EVABCDEF12345678',
    vnp_SecureHash:        'valid_hash',
    ...overrides,
  };
}

import { Logger } from '@nestjs/common';

// Helpers

describe('HandleVNPayCallbackUseCase', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  let useCase: HandleVNPayCallbackUseCase;
  let vnpayService: jest.Mocked<VNPayService>;
  let txRepo: any;
  let walletRepo: any;
  let eventBus: any;
  let processedRepo: any;
  let invoiceRepo: any;
  let dataSource: any;

  beforeEach(async () => {
    // Mock transaction manager
    const mockManager = {
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((EntityClass, data) => ({ ...data })),
    };

    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: mockManager,
    };

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)),
    };

    txRepo = {
      findByReferenceCode: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
    };

    eventBus = {
      publishAll: jest.fn().mockResolvedValue(undefined),
    };

    processedRepo = {
      existsBy: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockResolvedValue(undefined),
    };

    invoiceRepo = {
      save: jest.fn().mockResolvedValue(undefined),
    };

    walletRepo = {
      findByUserId: jest.fn(),
      credit: jest.fn().mockResolvedValue(undefined),
    };

    vnpayService = {
      buildPaymentUrl: jest.fn(),
      verifyCallback:  jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HandleVNPayCallbackUseCase,
        { provide: TRANSACTION_REPOSITORY, useValue: txRepo },
        { provide: WALLET_REPOSITORY,      useValue: walletRepo },
        { provide: EVENT_BUS,              useValue: eventBus },
        { provide: VNPayService,           useValue: vnpayService },
        { provide: DataSource,             useValue: dataSource },
        { provide: getRepositoryToken(ProcessedEventOrmEntity), useValue: processedRepo },
        { provide: getRepositoryToken(InvoiceOrmEntity),        useValue: invoiceRepo },
      ],
    }).compile();

    useCase = module.get(HandleVNPayCallbackUseCase);
  });

  // Test 1: Checksum invalid — throws and aborts processing.
  it('SECURITY: rejects callback with invalid checksum', async () => {
    vnpayService.verifyCallback.mockImplementation(() => {
      throw new Error('INVALID_CHECKSUM');
    });

    await expect(useCase.execute(makeValidReturnParams() as any))
      .rejects.toThrow('INVALID_CHECKSUM');

    // Should not invoke processedRepo or txRepo
    expect(processedRepo.existsBy).not.toHaveBeenCalled();
    expect(txRepo.findByReferenceCode).not.toHaveBeenCalled();
  });

  // Test 2: Happy path — valid callback, transaction completed.
  it('SUCCESS: valid callback — transaction completed, invoice created, event published', async () => {
    const tx = makePendingTransaction();
    vnpayService.verifyCallback.mockReturnValue({
      isSuccess:     true,
      responseCode:  '00',
      transactionNo: '14345678',
      bankCode:      'NCB',
      amount:        100000,
      txnRef:        'EVABCDEF12345678',
      orderInfo:     'test',
      payDate:       '20260412143000',
    });
    txRepo.findByReferenceCode.mockResolvedValue(tx);

    const result = await useCase.execute(makeValidReturnParams() as any);

    expect(result.status).toBe('success');
    expect(result.transactionId).toBe('tx-001');
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    // Invoice created
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  // Test 2b: Happy path for TOPUP — credits wallet and publishes WalletTopupCompletedEvent
  it('SUCCESS: valid topup callback — wallet credited and topup event published', async () => {
    const tx = makePendingTransaction({ type: 'topup' });
    const mockWallet = { id: 'wallet-001', userId: 'user-001', balance: 0, currency: 'VND' };
    
    vnpayService.verifyCallback.mockReturnValue({
      isSuccess:     true,
      responseCode:  '00',
      transactionNo: '14345678',
      bankCode:      'NCB',
      amount:        100000,
      txnRef:        'EVABCDEF12345678',
      orderInfo:     'test',
      payDate:       '20260412143000',
    });
    txRepo.findByReferenceCode.mockResolvedValue(tx);
    walletRepo.findByUserId.mockResolvedValue(mockWallet);

    const result = await useCase.execute(makeValidReturnParams() as any);

    expect(result.status).toBe('success');
    expect(result.transactionId).toBe('tx-001');
    expect(walletRepo.findByUserId).toHaveBeenCalledWith('user-001');
    expect(walletRepo.credit).toHaveBeenCalledWith('wallet-001', 'tx-001', 100000, expect.anything());
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    const [events] = eventBus.publishAll.mock.calls[0];
    expect(events).toHaveLength(2); // PaymentCompletedEvent and WalletTopupCompletedEvent
    expect(events[0].eventType).toBe('payment.completed');
    expect(events[1].eventType).toBe('wallet.topup.completed');
  });

  // Test 3: Payment failed (VNPay response != '00')
  it('FAILURE: callback with responseCode != 00 — transaction failed, emits PaymentFailedEvent', async () => {
    const tx = makePendingTransaction();
    vnpayService.verifyCallback.mockReturnValue({
      isSuccess:     false,
      responseCode:  '51',  // Insufficient funds
      transactionNo: '14345679',
      bankCode:      'NCB',
      amount:        100000,
      txnRef:        'EVABCDEF12345678',
      orderInfo:     'test',
      payDate:       '20260412143000',
    });
    txRepo.findByReferenceCode.mockResolvedValue(tx);

    const result = await useCase.execute(makeValidReturnParams({ vnp_ResponseCode: '51' }) as any);

    expect(result.status).toBe('failed');
    expect(eventBus.publishAll).toHaveBeenCalled();
    // Verifies event type as PaymentFailedEvent
    const [events] = eventBus.publishAll.mock.calls[0];
    expect(events[0].eventType).toBe('payment.failed');
  });

  // Test 4: Idempotency — duplicate callback
  it('IDEMPOTENCY: duplicate callback — returns cached result without reprocessing', async () => {
    const tx = makePendingTransaction({ status: 'completed' });
    vnpayService.verifyCallback.mockReturnValue({
      isSuccess:     true,
      responseCode:  '00',
      transactionNo: '14345678',
      bankCode:      'NCB',
      amount:        100000,
      txnRef:        'EVABCDEF12345678',
      orderInfo:     'test',
      payDate:       '20260412143000',
    });
    processedRepo.existsBy.mockResolvedValue(true); // Already processed
    txRepo.findByReferenceCode.mockResolvedValue(tx);

    const result = await useCase.execute(makeValidReturnParams() as any);

    // Return cached result
    expect(result.status).toBe('success');
    // Does NOT invoke dataSource.transaction (prevents reprocessing)
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });

  // Test 5: Transaction not found
  it('ERROR: transaction does not exist — throws error', async () => {
    vnpayService.verifyCallback.mockReturnValue({
      isSuccess:     true,
      responseCode:  '00',
      transactionNo: '14345678',
      bankCode:      'NCB',
      amount:        100000,
      txnRef:        'UNKNOWN_REF',
      orderInfo:     'test',
      payDate:       '20260412143000',
    });
    txRepo.findByReferenceCode.mockResolvedValue(null);

    await expect(useCase.execute(makeValidReturnParams() as any))
      .rejects.toThrow('Transaction not found');
  });
});
