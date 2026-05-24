import { DomainEvent } from './domain-event.base';

// session.booking_created

export class BookingCreatedEvent extends DomainEvent {
  readonly eventType = 'session.booking_created';

  constructor(
    public readonly bookingId: string,
    public readonly userId: string,
    public readonly chargerId: string,
    public readonly startTime: Date,
    public readonly endTime: Date,
  ) {
    super();
  }
}

// Deposit Requested (auto-trigger after booking.create)

export class SessionReservedEvent extends DomainEvent {
  readonly eventType = 'session.reserved';

  constructor(
    public readonly bookingId: string,
    public readonly userId: string,
    public readonly chargerId: string,
    public readonly depositAmount: number,
  ) {
    super();
  }
}

// Booking Confirmed (auto after successful payment)

export class BookingConfirmedEvent extends DomainEvent {
  readonly eventType = 'booking.confirmed';

  constructor(
    public readonly bookingId: string,
    public readonly userId: string,
    public readonly chargerId: string,
    public readonly qrToken: string,
    public readonly depositAmount: number,
    public readonly startTime: Date,
    public readonly endTime: Date,
  ) {
    super();
  }
}

// Booking Cancelled (refund 100% deposit to wallet)

export class BookingCancelledEvent extends DomainEvent {
  readonly eventType = 'booking.cancelled';

  constructor(
    public readonly bookingId: string,
    public readonly userId: string,
    public readonly chargerId: string,
    public readonly reason: string,
    public readonly depositTransactionId: string | null,
    public readonly refundAmount: number,
  ) {
    super();
  }
}

// Booking Completed (QR scanned, session started)

export class BookingCompletedEvent extends DomainEvent {
  readonly eventType = 'booking.completed';

  constructor(
    public readonly bookingId: string,
    public readonly userId: string,
    public readonly chargerId: string,
    public readonly depositAmount: number,
    public readonly depositTransactionId: string | null,
  ) {
    super();
  }
}

// Booking Expired (5 minutes unpaid)

export class BookingExpiredEvent extends DomainEvent {
  readonly eventType = 'booking.expired';

  constructor(
    public readonly bookingId: string,
    public readonly userId: string,
    public readonly chargerId: string,
  ) {
    super();
  }
}

// Booking No-Show (20% deposit penalty)

export class BookingNoShowEvent extends DomainEvent {
  readonly eventType = 'booking.no_show';

  constructor(
    public readonly bookingId: string,
    public readonly userId: string,
    public readonly chargerId: string,
    public readonly penaltyAmount: number,
    public readonly refundAmount: number,
    public readonly depositTransactionId: string | null,
  ) {
    super();
  }
}

