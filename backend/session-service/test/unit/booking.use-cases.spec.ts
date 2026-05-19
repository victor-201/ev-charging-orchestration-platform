import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Booking } from '../../src/domain/aggregates/booking.aggregate';
import { BookingTimeRange } from '../../src/domain/value-objects/booking-time-range.vo';
import { BookingStatus } from '../../src/domain/value-objects/booking-status.vo';
import { BadRequestException } from '@nestjs/common';
import {
  InvalidBookingStateException,
  BookingConflictException,
} from '../../src/domain/exceptions/booking.exceptions';
import { PriorityQueueService } from '../../src/domain/services/priority-queue.service';
import { SchedulingEngine, ChargerCandidate } from '../../src/domain/services/scheduling-engine.service';
import { CreateBookingUseCase } from '../../src/application/use-cases/create-booking.use-case';
import {
  CancelBookingUseCase,
  AutoConfirmBookingUseCase,
  AutoCompleteBookingUseCase,
} from '../../src/application/use-cases/booking-lifecycle.use-case';
import {
  BOOKING_REPOSITORY,
} from '../../src/domain/repositories/booking.repository.interface';
import { CHARGER_REPOSITORY } from '../../src/domain/repositories/charger.repository.interface';
import { EVENT_BUS } from '../../src/infrastructure/messaging/event-bus.interface';
import { ConfigService } from '@nestjs/config';
import { PricingHttpClient } from '../../src/infrastructure/http/pricing.http-client';

// Mocks

const mockBookingRepo = {
  save:                jest.fn(),
  findById:            jest.fn(),
  findByUserAndStatus: jest.fn(),
  findByUser:          jest.fn(),
  findActiveByCharger: jest.fn(),
  hasOverlap:          jest.fn(),
  findExpired:         jest.fn(),
};

const mockChargerRepo = {
  findById:               jest.fn().mockResolvedValue({
    id: 'charger-uuid-1',
    stationId: 'station-uuid-1',
    connectorType: 'CCS2',
    connectors: [{ connectorType: 'CCS2', maxPowerKw: 50 }],
    maxPowerKw: 50,
    status: 'available',
  }),
  findAvailableByStation: jest.fn(),
  isAvailable:            jest.fn(),
  lockForUpdate:          jest.fn(),
  updateStatus:           jest.fn(),
};

const mockPricingClient = {
  getPricing: jest.fn().mockResolvedValue({
    pricePerKwhVnd:        3_858,
    estimatedTotalVnd:     50_000,
    recommendedDepositVnd: 60_000,
    isPeakHour:            false,
    connectorType:         'CCS2',
  }),
};

const mockEventBus   = { publishAll: jest.fn() };
const mockDataSource = {
  transaction: jest.fn().mockImplementation((cb: (m: any) => any) => cb({})),
};

// Helper factories

const FUTURE_START = new Date(Date.now() + 60 * 60 * 1000);      // +1h
const FUTURE_END   = new Date(Date.now() + 2 * 60 * 60 * 1000);  // +2h
const CHARGER_ID   = 'charger-uuid-1';
const USER_ID      = 'user-uuid-1';
const DEPOSIT      = 50_000;

function makeTimeRange(start = FUTURE_START, end = FUTURE_END): BookingTimeRange {
  return new BookingTimeRange(start, end);
}

function makeBooking(status = BookingStatus.PENDING_PAYMENT): Booking {
  return Booking.reconstitute({
    id:                  'booking-uuid-1',
    userId:              USER_ID,
    chargerId:           CHARGER_ID,
    timeRange:           makeTimeRange(),
    status,
    depositAmount:       DEPOSIT,
    connectorType:       'CCS2',
    pricePerKwhSnapshot: 3_858,
    createdAt:           new Date(),
    updatedAt:           new Date(),
  });
}

// Domain: BookingTimeRange

describe('BookingTimeRange', () => {
  it('should create valid time range', () => {
    const tr = makeTimeRange();
    expect(tr.startTime).toBeDefined();
    expect(tr.endTime).toBeDefined();
    expect(tr.durationMinutes()).toBeCloseTo(60, 0);
  });

  it('should throw if end <= start', () => {
    expect(() => new BookingTimeRange(FUTURE_END, FUTURE_START)).toThrow();
  });

  it('should throw if start is in the past', () => {
    const past = new Date(Date.now() - 120_000);
    expect(() => new BookingTimeRange(past, FUTURE_END)).toThrow();
  });

  it('should detect overlaps correctly', () => {
    const tr1     = new BookingTimeRange(FUTURE_START, FUTURE_END);
    const overlap = new BookingTimeRange(
      new Date(FUTURE_START.getTime() + 30 * 60 * 1000),
      new Date(FUTURE_END.getTime()   + 30 * 60 * 1000),
    );
    expect(tr1.overlaps(overlap)).toBe(true);
  });

  it('should not detect overlap for adjacent slots', () => {
    const tr1  = new BookingTimeRange(FUTURE_START, FUTURE_END);
    const next = new BookingTimeRange(FUTURE_END, new Date(FUTURE_END.getTime() + 60 * 60 * 1000));
    expect(tr1.overlaps(next)).toBe(false);
  });
});

// Domain: Booking Aggregate FSM (Auto-confirm)

describe('Booking Aggregate FSM - Auto-confirm model', () => {
  /**
   * New FSM: PENDING_PAYMENT → CONFIRMED → COMPLETED
   * - confirmWithPayment(txnId, qrToken) replaces manual confirm()
   * - markNoShow() for penalty
   * - expire() for payment timeout
   */

  it('creates in PENDING_PAYMENT with depositAmount set', () => {
    const b = Booking.create({
      userId:              USER_ID,
      chargerId:           CHARGER_ID,
      timeRange:           makeTimeRange(),
      depositAmount:       DEPOSIT,
      connectorType:       'CCS2',
      pricePerKwhSnapshot: 3_858,
    });
    expect(b.status).toBe(BookingStatus.PENDING_PAYMENT);
    expect(b.depositAmount).toBe(DEPOSIT);
    expect(b.domainEvents[0].eventType).toBe('session.booking_created_v1');
  });

  it('PENDING_PAYMENT → CONFIRMED via confirmWithPayment()', () => {
    const b = makeBooking(BookingStatus.PENDING_PAYMENT);
    b.confirmWithPayment('txn-001');
    expect(b.status).toBe(BookingStatus.CONFIRMED);
    expect(b.depositTransactionId).toBe('txn-001');
    expect(b.qrToken).not.toBeNull();
    expect(b.domainEvents[0].eventType).toBe('booking.confirmed');
  });

  it('CONFIRMED → COMPLETED via complete()', () => {
    const b = makeBooking(BookingStatus.CONFIRMED);
    b.complete();
    expect(b.status).toBe(BookingStatus.COMPLETED);
    expect(b.domainEvents[0].eventType).toBe('booking.completed');
  });

  it('PENDING_PAYMENT → CANCELLED via cancel()', () => {
    const b = makeBooking(BookingStatus.PENDING_PAYMENT);
    b.cancel('user changed mind');
    expect(b.status).toBe(BookingStatus.CANCELLED);
    expect(b.domainEvents[0].eventType).toBe('booking.cancelled');
  });

  it('CONFIRMED → CANCELLED via cancel()', () => {
    const b = makeBooking(BookingStatus.CONFIRMED);
    b.cancel('user changed mind');
    expect(b.status).toBe(BookingStatus.CANCELLED);
  });

  it('PENDING_PAYMENT → EXPIRED via expire()', () => {
    const b = makeBooking(BookingStatus.PENDING_PAYMENT);
    b.expire();
    expect(b.status).toBe(BookingStatus.EXPIRED);
    expect(b.domainEvents[0].eventType).toBe('booking.expired');
  });

  it('CONFIRMED → NO_SHOW via markNoShow()', () => {
    const b = makeBooking(BookingStatus.CONFIRMED);
    b.markNoShow();
    expect(b.status).toBe(BookingStatus.NO_SHOW);
    expect(b.domainEvents[0].eventType).toBe('booking.no_show');
  });

  it('cannot confirmWithPayment if already CONFIRMED', () => {
    const b = makeBooking(BookingStatus.CONFIRMED);
    expect(() => b.confirmWithPayment('txn-2')).toThrow(InvalidBookingStateException);
  });

  it('cannot complete from PENDING_PAYMENT', () => {
    const b = makeBooking(BookingStatus.PENDING_PAYMENT);
    expect(() => b.complete()).toThrow(InvalidBookingStateException);
  });

  it('cannot cancel COMPLETED booking (terminal)', () => {
    const b = makeBooking(BookingStatus.COMPLETED);
    expect(() => b.cancel('too late')).toThrow(InvalidBookingStateException);
  });

  it('clears domain events', () => {
    const b = makeBooking();
    b.clearDomainEvents();
    expect(b.domainEvents).toHaveLength(0);
  });
});

// CreateBookingUseCase

describe('CreateBookingUseCase', () => {
  let useCase: CreateBookingUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateBookingUseCase,
        { provide: BOOKING_REPOSITORY,    useValue: mockBookingRepo },
        { provide: CHARGER_REPOSITORY,    useValue: mockChargerRepo },
        { provide: EVENT_BUS,             useValue: mockEventBus },
        { provide: DataSource,            useValue: mockDataSource },
        // PricingHttpClient uses string token (not class token)
        { provide: PricingHttpClient,     useValue: mockPricingClient },
        { provide: 'PricingHttpClient',   useValue: mockPricingClient },
      ],
    }).compile();
    useCase = module.get(CreateBookingUseCase);
  });

  const cmd = {
    userId:        USER_ID,
    chargerId:     CHARGER_ID,
    stationId:     'station-uuid-1',
    connectorType: 'CCS2',
    startTime:     FUTURE_START,
    endTime:       FUTURE_END,
  };

  it('creates booking in PENDING_PAYMENT when no conflict', async () => {
    mockChargerRepo.lockForUpdate.mockResolvedValue(undefined);
    mockBookingRepo.hasOverlap.mockResolvedValue(false);
    mockBookingRepo.save.mockResolvedValue(undefined);
    mockEventBus.publishAll.mockResolvedValue(undefined);

    const booking = await useCase.execute(cmd);

    expect(booking.status).toBe(BookingStatus.PENDING_PAYMENT);
    expect(booking.userId).toBe(USER_ID);
    expect(mockBookingRepo.hasOverlap).toHaveBeenCalled();
  });

  it('throws BookingConflictException when charger has overlap', async () => {
    mockChargerRepo.lockForUpdate.mockResolvedValue(undefined);
    mockBookingRepo.hasOverlap.mockResolvedValue(true);

    await expect(useCase.execute(cmd)).rejects.toThrow(BookingConflictException);
    expect(mockBookingRepo.save).not.toHaveBeenCalled();
  });

  it('throws when start time is in the past', async () => {
    const past = new Date(Date.now() - 1000);
    await expect(useCase.execute({ ...cmd, startTime: past })).rejects.toThrow();
  });

  it('acquires FOR UPDATE lock before overlap check', async () => {
    mockChargerRepo.lockForUpdate.mockResolvedValue(undefined);
    mockBookingRepo.hasOverlap.mockResolvedValue(false);
    mockBookingRepo.save.mockResolvedValue(undefined);
    mockEventBus.publishAll.mockResolvedValue(undefined);

    await useCase.execute(cmd);

    const lockOrder    = mockChargerRepo.lockForUpdate.mock.invocationCallOrder[0];
    const overlapOrder = mockBookingRepo.hasOverlap.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(overlapOrder);
  });

  it('throws BadRequestException when charger is offline', async () => {
    mockChargerRepo.findById.mockResolvedValueOnce({
      id: 'charger-uuid-1',
      stationId: 'station-uuid-1',
      connectorType: 'CCS2',
      connectors: [{ connectorType: 'CCS2', maxPowerKw: 50 }],
      maxPowerKw: 50,
      status: 'offline',
    });

    await expect(useCase.execute(cmd)).rejects.toThrow(
      new BadRequestException('Charger charger-uuid-1 is offline'),
    );
  });
});

// CancelBookingUseCase

describe('CancelBookingUseCase', () => {
  let useCase: CancelBookingUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancelBookingUseCase,
        { provide: BOOKING_REPOSITORY, useValue: mockBookingRepo },
        { provide: EVENT_BUS,          useValue: mockEventBus },
        { provide: DataSource,         useValue: mockDataSource },
      ],
    }).compile();
    useCase = module.get(CancelBookingUseCase);
  });

  it('cancels a PENDING_PAYMENT booking', async () => {
    mockBookingRepo.findById.mockResolvedValue(makeBooking(BookingStatus.PENDING_PAYMENT));
    mockBookingRepo.save.mockResolvedValue(undefined);
    mockEventBus.publishAll.mockResolvedValue(undefined);

    await expect(
      useCase.execute({ bookingId: 'booking-uuid-1', userId: USER_ID, reason: 'test' }),
    ).resolves.toBeUndefined();

    expect(mockBookingRepo.save).toHaveBeenCalled();
  });

  it('cancels a CONFIRMED booking', async () => {
    mockBookingRepo.findById.mockResolvedValue(makeBooking(BookingStatus.CONFIRMED));
    mockBookingRepo.save.mockResolvedValue(undefined);
    mockEventBus.publishAll.mockResolvedValue(undefined);

    await expect(
      useCase.execute({ bookingId: 'booking-uuid-1', userId: USER_ID, reason: 'test' }),
    ).resolves.toBeUndefined();
  });

  it('throws when booking not found', async () => {
    mockBookingRepo.findById.mockResolvedValue(null);

    const { BookingNotFoundException } = await import('../../src/domain/exceptions/booking.exceptions');
    await expect(
      useCase.execute({ bookingId: 'nonexistent', userId: USER_ID, reason: '' }),
    ).rejects.toThrow(BookingNotFoundException);
  });
});

// SchedulingEngine

describe('SchedulingEngine', () => {
  let engine: SchedulingEngine;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingEngine,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockImplementation((_k: string, def?: string) => def ?? '0.35') },
        },
      ],
    }).compile();
    engine = module.get(SchedulingEngine);
  });

  const makeCandidate = (override?: Partial<ChargerCandidate>): ChargerCandidate => ({
    chargerId:      'c-1',
    stationId:      's-1',
    currentLoad:    0.3,
    availableSlots: 3,
    distanceKm:     2.0,
    isPeakHour:     false,
    ...override,
  });

  it('calculates a positive score for normal conditions', () => {
    expect(engine.calculateScore(makeCandidate({ isPeakHour: false }))).toBeGreaterThan(0);
  });

  it('ranks lower-load chargers higher', () => {
    const low  = makeCandidate({ chargerId: 'c-low',  currentLoad: 0.1, isPeakHour: false });
    const high = makeCandidate({ chargerId: 'c-high', currentLoad: 0.9, isPeakHour: false });
    expect(engine.rank([low, high])[0].chargerId).toBe('c-low');
  });

  it('penalises peak hours (lower score)', () => {
    const off = engine.calculateScore(makeCandidate({ isPeakHour: false }));
    const on  = engine.calculateScore(makeCandidate({ isPeakHour: true }));
    expect(off).toBeGreaterThan(on);
  });

  it('ranks closer charger higher (same load)', () => {
    const near = makeCandidate({ chargerId: 'near', distanceKm: 0.5,  isPeakHour: false });
    const far  = makeCandidate({ chargerId: 'far',  distanceKm: 15.0, isPeakHour: false });
    expect(engine.rank([far, near])[0].chargerId).toBe('near');
  });

  it('getSuggestions returns at most N results', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => makeCandidate({ chargerId: `c-${i}` }));
    const results = engine.getSuggestions(candidates, 3);
    expect(results.length).toBe(3);
    expect(results[0].rank).toBe(1);
  });
});

// PriorityQueueService

describe('PriorityQueueService', () => {
  let service: PriorityQueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriorityQueueService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get(PriorityQueueService);
  });

  const makeEntry = (userId: string, chargerId: string, userPriority = 5, urgencyScore = 0) => ({
    id:            `${userId}-${chargerId}`,
    userId,
    chargerId,
    connectorType: 'CCS',
    requestedAt:   new Date(),
    userPriority,
    urgencyScore,
    status:        'waiting' as const,
  });

  it('enqueues and peeks correctly', () => {
    service.enqueue(makeEntry('u1', 'c1', 8));
    service.enqueue(makeEntry('u2', 'c1', 3));
    expect(service.peek('c1')?.userId).toBe('u1');
  });

  it('returns correct queue positions', () => {
    service.enqueue(makeEntry('u1', 'c1', 8));
    service.enqueue(makeEntry('u2', 'c1', 3));
    expect(service.getPosition('u1', 'c1')).toBe(1);
    expect(service.getPosition('u2', 'c1')).toBe(2);
  });

  it('dequeues highest priority entry', () => {
    service.enqueue(makeEntry('u1', 'c1', 8));
    service.enqueue(makeEntry('u2', 'c1', 3));
    expect(service.dequeueForCharger('c1')?.userId).toBe('u1');
    expect(service.size('c1')).toBe(1);
  });

  it('removes entry by user', () => {
    service.enqueue(makeEntry('u1', 'c1'));
    service.enqueue(makeEntry('u2', 'c1'));
    service.removeByUser('u1', 'c1');
    expect(service.getPosition('u1', 'c1')).toBe(-1);
    expect(service.size('c1')).toBe(1);
  });

  it('anti-starvation: long wait overtakes low priority', () => {
    const oldEntry = makeEntry('u1', 'c1', 3);
    oldEntry.requestedAt = new Date(Date.now() - 120 * 60_000); // 2h ago
    const newEntry = makeEntry('u2', 'c1', 9);
    service.enqueue(oldEntry);
    service.enqueue(newEntry);
    service.rebalance();
    expect(service.peek('c1')?.userId).toBe('u1');
  });

  it('loads from DB and builds heap correctly', () => {
    const entries = [makeEntry('u3', 'c2', 2), makeEntry('u4', 'c2', 7), makeEntry('u5', 'c2', 5)];
    service.loadFromDb(entries);
    expect(service.size('c2')).toBe(3);
    expect(service.peek('c2')?.userId).toBe('u4');
  });
});
