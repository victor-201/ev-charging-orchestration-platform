/**
 * Domain Events for Charging Service
 *
 * All events have string literal eventType for routing via RabbitMQ.
 * occurredAt is set at event creation time (domain time, not publish time).
 */
export abstract class ChargingDomainEvent {
  readonly occurredAt: Date = new Date();
  abstract readonly eventType: string;
}

// Session Events

export class SessionStartedEvent extends ChargingDomainEvent {
  readonly eventType = 'session.started';

  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
    public readonly chargerId: string,
    public readonly stationId: string,
    public readonly bookingId: string | null,
    public readonly startTime: Date,
    public readonly startMeterWh: number,
  ) {
    super();
  }
}

export class SessionActivatedEvent extends ChargingDomainEvent {
  readonly eventType = 'session.activated';

  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
    public readonly chargerId: string,
  ) {
    super();
  }
}

export class SessionTelemetryEvent extends ChargingDomainEvent {
  readonly eventType = 'session.telemetry';

  constructor(
    public readonly sessionId: string,
    public readonly chargerId: string,
    public readonly powerKw: number | null,
    public readonly meterWh: number | null,
    public readonly socPercent: number | null,
    public readonly recordedAt: Date,
  ) {
    super();
  }
}

export class SessionCompletedEvent extends ChargingDomainEvent {
  readonly eventType = 'session.completed';

  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
    public readonly chargerId: string,
    public readonly stationId: string,
    public readonly bookingId: string | null,
    public readonly kwhConsumed: number,
    public readonly endTime: Date,
    /** Duration in minutes */
    public readonly durationMinutes: number,
    /** Actual energy fee (VND) */
    public readonly energyFeeVnd: number = 0,
    /** Idle fee (VND) */
    public readonly idleFeeVnd: number = 0,
    /** Deposit amount previously held (VND) - used for reconciliation */
    public readonly depositAmount: number = 0,
    /** Deposit transaction ID */
    public readonly depositTransactionId: string | null = null,
  ) {
    super();
  }
}

export class SessionInterruptedEvent extends ChargingDomainEvent {
  readonly eventType = 'session.interrupted';

  constructor(
    public readonly sessionId: string,
    public readonly userId: string,
    public readonly chargerId: string,
    public readonly reason: string,
  ) {
    super();
  }
}

export class SessionErrorEvent extends ChargingDomainEvent {
  readonly eventType = 'session.error';

  constructor(
    public readonly sessionId: string,
    public readonly chargerId: string,
    public readonly errorCode: string,
  ) {
    super();
  }
}

// Charger State Events

export class ChargerStatusChangedEvent extends ChargingDomainEvent {
  readonly eventType = 'charger.status.changed';

  constructor(
    public readonly chargerId: string,
    public readonly availability: string,
    public readonly errorCode: string | null,
  ) {
    super();
  }
}
