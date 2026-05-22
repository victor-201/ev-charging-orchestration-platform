import { DomainException } from '../exceptions/domain.exception';

/**
 * Value Object: BookingTimeRange
 * Enforces all time invariants at construction time.
 * Immutable after creation.
 */
export class BookingTimeRange {
  readonly startTime: Date;
  readonly endTime: Date;

  private static readonly MIN_DURATION_MS = 15 * 60 * 1000;   // 15 min
  private static readonly MAX_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

  constructor(startTime: Date, endTime: Date) {
    if (!(startTime instanceof Date) || !(endTime instanceof Date)) {
      throw new DomainException('startTime and endTime must be Date objects');
    }
    if (startTime >= endTime) {
      throw new DomainException('end_time must be after start_time');
    }
    const durationMs = endTime.getTime() - startTime.getTime();
    if (durationMs < BookingTimeRange.MIN_DURATION_MS) {
      throw new DomainException('Minimum booking duration is 15 minutes');
    }
    if (durationMs > BookingTimeRange.MAX_DURATION_MS) {
      throw new DomainException('Maximum booking duration is 4 hours');
    }
    this.startTime = startTime;
    this.endTime = endTime;
  }

  /** Returns true if this range overlaps with another */
  overlaps(other: BookingTimeRange): boolean {
    return this.startTime < other.endTime && this.endTime > other.startTime;
  }

  durationMinutes(): number {
    return (this.endTime.getTime() - this.startTime.getTime()) / 60_000;
  }

  equals(other: BookingTimeRange): boolean {
    return (
      this.startTime.getTime() === other.startTime.getTime() &&
      this.endTime.getTime() === other.endTime.getTime()
    );
  }
}
