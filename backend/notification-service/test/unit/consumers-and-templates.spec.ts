/**
 * Tests: Consumer idempotency + event -> notification routing
 *
 * Test:
 * - Duplicate event is ignored
 * - Correct templates are applied
 * - push + in_app routing per event type
 * - queue.updated only in_app (no push)
 */
import { BookingNotificationConsumer, QueueNotificationConsumer } from '../../src/infrastructure/messaging/consumers/notification.consumers';
import { DeliveryEngine } from '../../src/domain/services/delivery.engine';
import type { BookingCreatedEvent, QueueUpdatedEvent } from '../../src/domain/events/notification.events';
import { NOTIFICATION_TEMPLATES } from '../../src/domain/events/notification.events';
import { Logger } from '@nestjs/common';

// Helpers

function makeBookingConsumer(alreadyProcessed = false) {
  const peRepo = {
    existsBy: jest.fn().mockResolvedValue(alreadyProcessed),
    save:     jest.fn().mockResolvedValue(undefined),
  };

  const engine: jest.Mocked<Pick<DeliveryEngine, 'isProcessed' | 'markProcessed' | 'dispatch'>> = {
    isProcessed:  jest.fn().mockResolvedValue(alreadyProcessed),
    markProcessed: jest.fn().mockResolvedValue(undefined),
    dispatch:     jest.fn().mockResolvedValue({ id: 'notif-001' } as any),
  };

  const consumer = new BookingNotificationConsumer(peRepo as any, engine as any);
  return { consumer, engine, peRepo };
}

function makeQueueConsumer() {
  const peRepo = {
    existsBy: jest.fn().mockResolvedValue(false),
    save:     jest.fn().mockResolvedValue(undefined),
  };

  const engine: jest.Mocked<Pick<DeliveryEngine, 'isProcessed' | 'markProcessed' | 'dispatch'>> = {
    isProcessed:   jest.fn().mockResolvedValue(false),
    markProcessed: jest.fn().mockResolvedValue(undefined),
    dispatch:      jest.fn().mockResolvedValue({ id: 'notif-002' } as any),
  };

  const consumer = new QueueNotificationConsumer(peRepo as any, engine as any);
  return { consumer, engine };
}

// Global Log Suppression for this test file
beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Booking Consumer Tests

describe('BookingNotificationConsumer', () => {

  const bookingCreatedPayload: BookingCreatedEvent = {
    eventType: 'booking.created',
    eventId:   'evt-book-001',
    bookingId: '12345678-aaaa-bbbb-cccc-000000000001',
    userId:    'user-001',
    chargerId: 'ch-001',
    startTime: '2026-04-13T08:00:00Z',
    endTime:   '2026-04-13T09:00:00Z',
  };

  it('booking.created -> calls engine.dispatch', async () => {
    const { consumer, engine } = makeBookingConsumer(false);
    await consumer.onBookingCreated(bookingCreatedPayload);
    expect(engine.dispatch).toHaveBeenCalledTimes(1);
  });

  it('booking.created -> channels = [in_app, push]', async () => {
    const { consumer, engine } = makeBookingConsumer(false);
    await consumer.onBookingCreated(bookingCreatedPayload);
    const call = engine.dispatch.mock.calls[0][0];
    expect(call.channels).toContain('in_app');
    expect(call.channels).toContain('push');
  });

  it('booking.created -> title is correct according to template', async () => {
    const { consumer, engine } = makeBookingConsumer(false);
    await consumer.onBookingCreated(bookingCreatedPayload);
    const call = engine.dispatch.mock.calls[0][0];
    expect(call.title).toBe(NOTIFICATION_TEMPLATES['booking.created'].title(bookingCreatedPayload));
  });

  it('booking.created -> body contains formatted bookingId', async () => {
    const { consumer, engine } = makeBookingConsumer(false);
    await consumer.onBookingCreated(bookingCreatedPayload);
    const call = engine.dispatch.mock.calls[0][0];
    expect(call.body).toContain('12345678');  // first 8 chars of bookingId
  });

  it('booking.created -> metadata contains bookingId', async () => {
    const { consumer, engine } = makeBookingConsumer(false);
    await consumer.onBookingCreated(bookingCreatedPayload);
    const call = engine.dispatch.mock.calls[0][0];
    expect(call.metadata).toEqual(expect.objectContaining({ bookingId: bookingCreatedPayload.bookingId }));
  });

  it('IDEMPOTENCY: duplicate event -> dispatch is NOT called', async () => {
    const { consumer, engine } = makeBookingConsumer(true);  // already processed
    await consumer.onBookingCreated(bookingCreatedPayload);
    expect(engine.dispatch).not.toHaveBeenCalled();
  });

  it('IDEMPOTENCY: markProcessed is called after dispatch', async () => {
    const { consumer, engine } = makeBookingConsumer(false);
    await consumer.onBookingCreated(bookingCreatedPayload);
    expect(engine.markProcessed).toHaveBeenCalledWith('evt-book-001', 'booking.created', expect.anything());
  });

  it('eventId fallback from bookingId when eventId is missing', async () => {
    const { consumer, engine } = makeBookingConsumer(false);
    const payloadNoId = { ...bookingCreatedPayload, eventId: undefined as any };
    await consumer.onBookingCreated(payloadNoId);
    // Should still process with fallback eventId
    expect(engine.dispatch).toHaveBeenCalledTimes(1);
    expect(engine.markProcessed).toHaveBeenCalledWith(
      `booking.created:${bookingCreatedPayload.bookingId}`,
      'booking.created',
      expect.anything(),
    );
  });

  it('booking.confirmed -> has realtimePayload.bookingUpdate', async () => {
    const { consumer, engine } = makeBookingConsumer(false);
    await consumer.onBookingConfirmed({
      eventType: 'booking.confirmed', eventId: 'evt-conf-001',
      bookingId: 'b-002', userId: 'user-001', chargerId: 'ch-001',
    });
    const call = engine.dispatch.mock.calls[0][0];
    expect(call.realtimePayload?.bookingUpdate).toBeDefined();
    expect((call.realtimePayload?.bookingUpdate as any).status).toBe('confirmed');
  });
});

// Queue Consumer Tests

describe('QueueNotificationConsumer', () => {

  const queuePayload: QueueUpdatedEvent = {
    eventType:            'queue.updated',
    eventId:              'evt-q-001',
    queueId:              'queue-001',
    userId:               'user-002',
    chargerId:            'ch-001',
    stationId:            'st-001',
    position:             2,
    estimatedWaitMinutes: 10,
    status:               'waiting',
  };

  it('queue.updated -> channels = [in_app] ONLY (no push)', async () => {
    const { consumer, engine } = makeQueueConsumer();
    await consumer.onQueueUpdated(queuePayload);
    const call = engine.dispatch.mock.calls[0][0];
    expect(call.channels).toContain('in_app');
    expect(call.channels).not.toContain('push');
    expect(call.channels).not.toContain('email');
  });

  it('queue.updated -> has realtimePayload.queueUpdate', async () => {
    const { consumer, engine } = makeQueueConsumer();
    await consumer.onQueueUpdated(queuePayload);
    const call = engine.dispatch.mock.calls[0][0];
    expect(call.realtimePayload?.queueUpdate).toBeDefined();
    const qu = call.realtimePayload?.queueUpdate as any;
    expect(qu.position).toBe(2);
    expect(qu.estimatedWaitMinutes).toBe(10);
    expect(qu.chargerId).toBe('ch-001');
  });

  it('queue.called -> body says "It\'s your turn!"', async () => {
    const { consumer, engine } = makeQueueConsumer();
    await consumer.onQueueUpdated({ ...queuePayload, status: 'called', eventId: 'evt-q-002' });
    const call = engine.dispatch.mock.calls[0][0];
    expect(call.body).toContain("It's your turn!");
  });

  it('queue.waiting -> body contains position and estimatedWait', async () => {
    const { consumer, engine } = makeQueueConsumer();
    await consumer.onQueueUpdated(queuePayload);
    const call = engine.dispatch.mock.calls[0][0];
    expect(call.body).toContain('2');   // position
    expect(call.body).toContain('10');  // wait minutes
  });
});

// Template Registry

describe('NOTIFICATION_TEMPLATES', () => {
  it('all event types have templates', () => {
    const types = [
      'booking.created', 'booking.confirmed', 'booking.cancelled',
      'payment.completed', 'payment.failed',
      'session.started', 'session.completed',
      'queue.updated',
    ];
    for (const type of types) {
      expect(NOTIFICATION_TEMPLATES[type]).toBeDefined();
      expect(typeof NOTIFICATION_TEMPLATES[type].title).toBe('function');
      expect(typeof NOTIFICATION_TEMPLATES[type].body).toBe('function');
    }
  });

  it('payment.completed body contains formatted amount', () => {
    const tpl = NOTIFICATION_TEMPLATES['payment.completed'];
    const body = tpl.body({ amount: 250000, transactionId: 'tx-001', userId: 'u', eventType: 'payment.completed', eventId: 'e' });
    expect(body).toContain('250');  // at minimum the number appears
  });

  it('session.completed body contains kwhConsumed', () => {
    const tpl = NOTIFICATION_TEMPLATES['session.completed'];
    const body = tpl.body({
      sessionId: 's', userId: 'u', chargerId: 'c',
      kwhConsumed: 15.75, durationMinutes: 90,
      endTime: '2026-04-13T10:00:00Z',
      eventType: 'session.completed', eventId: 'e',
    });
    expect(body).toContain('15.75');
    expect(body).toContain('90');
  });
});
