import * as crypto from 'crypto';
import { BookingTimeRange } from '../value-objects/booking-time-range.vo';
import {
  BookingStatus,
  TERMINAL_STATUSES,
} from '../value-objects/booking-status.vo';
import {
  BookingCreatedEvent,
  BookingConfirmedEvent,
  BookingCancelledEvent,
  BookingCompletedEvent,
  BookingExpiredEvent,
  BookingNoShowEvent,
} from '../events/session.events';
import { SessionReservedEventV1 } from '../events/saga.events';
import { DomainEvent } from '../events/domain-event.base';
import {
  InvalidBookingStateException,
} from '../exceptions/booking.exceptions';

/**
 * Booking Aggregate Root
 * States: PENDING -> CONFIRMED -> COMPLETED
 *               -> CANCELLED
 *               -> EXPIRED  (by scheduler)
 *               -> NO_SHOW  (confirmed but session not started in time)
 */
/**
 * Booking Aggregate Root - VinFast EV Station Standard
 *
 * State Machine:
 *   PENDING_PAYMENT -> (payment success) -> CONFIRMED -> (session started) -> COMPLETED
 *                   -> (payment timeout 5min) -> EXPIRED
 *   CONFIRMED       -> (user cancel) -> CANCELLED  (refund 100% deposit to wallet)
 *   CONFIRMED       -> (no-show 10min) -> NO_SHOW   (penalty 20% deposit, refund 80%)
 *
 * QR Token: one-time, only valid during booking time window.
 * Deposit: locks deposit when creating booking, reconciles after charging ends.
 */
export class Booking {
  private _status: BookingStatus;
  private _domainEvents: DomainEvent[] = [];
  private _idempotencyKey: string | null;
  private _expiredAt: Date | null;
  private _noShowAt: Date | null;
  private _qrToken: string | null;
  private _depositAmount: number | null;
  private _depositTransactionId: string | null;
  private _penaltyAmount: number | null;

  readonly id: string;
  readonly userId: string;
  readonly chargerId: string;
  readonly timeRange: BookingTimeRange;
  readonly createdAt: Date;
  /** Booked connector type - validated by charging-service QR */
  readonly connectorType: string | null;
  /** Price VND/kWh at booking time - used for billing reconciliation */
  readonly pricePerKwhSnapshot: number | null;
  private _updatedAt: Date;

  /** Temporary hold time: 5 minutes from creation if unpaid -> EXPIRED */
  static readonly PAYMENT_HOLD_MINUTES = 5;
  /** Grace period for No-Show: 10 minutes after startTime */
  static readonly NO_SHOW_GRACE_MINUTES = 10;
  /** No-Show penalty fee: 20% deposit */
  static readonly NO_SHOW_PENALTY_PERCENT = 20;

  private constructor(props: {
    id: string;
    userId: string;
    chargerId: string;
    timeRange: BookingTimeRange;
    status?: BookingStatus;
    idempotencyKey?: string | null;
    expiredAt?: Date | null;
    noShowAt?: Date | null;
    qrToken?: string | null;
    depositAmount?: number | null;
    depositTransactionId?: string | null;
    penaltyAmount?: number | null;
    connectorType?: string | null;
    pricePerKwhSnapshot?: number | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = props.id;
    this.userId = props.userId;
    this.chargerId = props.chargerId;
    this.timeRange = props.timeRange;
    this.connectorType = props.connectorType ?? null;
    this.pricePerKwhSnapshot = props.pricePerKwhSnapshot ?? null;
    this._status = props.status ?? BookingStatus.PENDING_PAYMENT;
    this._idempotencyKey = props.idempotencyKey ?? null;
    this._expiredAt = props.expiredAt ?? null;
    this._noShowAt = props.noShowAt ?? null;
    this._qrToken = props.qrToken ?? null;
    this._depositAmount = props.depositAmount ?? null;
    this._depositTransactionId = props.depositTransactionId ?? null;
    this._penaltyAmount = props.penaltyAmount ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  static create(props: {
    userId:              string;
    chargerId:           string;
    timeRange:           BookingTimeRange;
    depositAmount:       number;
    connectorType:       string;
    pricePerKwhSnapshot: number;
    idempotencyKey?:     string;
  }): Booking {
    const booking = new Booking({
      id:                  crypto.randomUUID(),
      userId:              props.userId,
      chargerId:           props.chargerId,
      timeRange:           props.timeRange,
      depositAmount:       props.depositAmount,
      connectorType:       props.connectorType,
      pricePerKwhSnapshot: props.pricePerKwhSnapshot,
      idempotencyKey:      props.idempotencyKey ?? null,
    });

    booking._domainEvents.push(
      new BookingCreatedEvent(
        booking.id,
        booking.userId,
        booking.chargerId,
        booking.timeRange.startTime,
        booking.timeRange.endTime,
      ),
    );

    booking._domainEvents.push(
      new SessionReservedEventV1(
        booking.id,
        booking.userId,
        booking.chargerId,
        booking.depositAmount ?? 0,
      ),
    );


    return booking;
  }

  static reconstitute(props: {
    id: string;
    userId: string;
    chargerId: string;
    timeRange: BookingTimeRange;
    status: BookingStatus;
    idempotencyKey?: string | null;
    expiredAt?: Date | null;
    noShowAt?: Date | null;
    qrToken?: string | null;
    depositAmount?: number | null;
    sessionDepositTransactionId?: string | null; // wait, let's check the property name
    depositTransactionId?: string | null;
    penaltyAmount?: number | null;
    connectorType?: string | null;
    pricePerKwhSnapshot?: number | null;
    createdAt: Date;
    updatedAt: Date;
  }): Booking {
    return new Booking(props);
  }

  /**
   * Automatically confirm after successful payment - generate QR Token.
   * NO manual admin confirmation required.
   */
  confirmWithPayment(depositTransactionId: string): void {
    if (this._status !== BookingStatus.PENDING_PAYMENT) {
      throw new InvalidBookingStateException(this._status, 'confirm');
    }
    this._status = BookingStatus.CONFIRMED;
    this._depositTransactionId = depositTransactionId;
    this._qrToken = this.generateQrToken();
    this._updatedAt = new Date();
    this._domainEvents.push(
      new BookingConfirmedEvent(
        this.id,
        this.userId,
        this.chargerId,
        this._qrToken,
        this._depositAmount ?? 0,
        this.timeRange.startTime,
        this.timeRange.endTime,
      ),
    );
  }

  cancel(reason: string): void {
    if (TERMINAL_STATUSES.includes(this._status)) {
      throw new InvalidBookingStateException(this._status, 'cancel');
    }
    this._status = BookingStatus.CANCELLED;
    this._updatedAt = new Date();
    this._domainEvents.push(
      new BookingCancelledEvent(
        this.id,
        this.userId,
        this.chargerId,
        reason,
        this._depositTransactionId,
        this._depositAmount ?? 0,
      ),
    );
  }

  /**
   * Automatically complete when charging session starts (QR scanned at charger).
   */
  complete(): void {
    if (this._status !== BookingStatus.CONFIRMED) {
      throw new InvalidBookingStateException(this._status, 'complete');
    }
    this._status = BookingStatus.COMPLETED;
    this._updatedAt = new Date();
    this._domainEvents.push(
      new BookingCompletedEvent(
        this.id,
        this.userId,
        this.chargerId,
        this._depositAmount ?? 0,
        this._depositTransactionId,
      ),
    );
  }

  /**
   * Auto-expire: PENDING_PAYMENT bookings unpaid after 5 mins -> EXPIRED
   * No deposit to refund because payment was not successful.
   */
  expire(): void {
    if (this._status !== BookingStatus.PENDING_PAYMENT) {
      throw new InvalidBookingStateException(this._status, 'expire');
    }
    this._status = BookingStatus.EXPIRED;
    this._expiredAt = new Date();
    this._updatedAt = new Date();
    this._domainEvents.push(
      new BookingExpiredEvent(this.id, this.userId, this.chargerId),
    );
  }

  /**
   * No-show: CONFIRMED but session didn't start within 10 mins after startTime.
   * Calculate 20% deposit penalty, refund remaining 80% to wallet.
   */
  markNoShow(): void {
    if (this._status !== BookingStatus.CONFIRMED) {
      throw new InvalidBookingStateException(this._status, 'mark_no_show');
    }
    const deposit = this._depositAmount ?? 0;
    const penaltyRate = Booking.NO_SHOW_PENALTY_PERCENT / 100;
    this._penaltyAmount = Math.floor(deposit * penaltyRate);
    const refundAmount = deposit - this._penaltyAmount;

    this._status = BookingStatus.NO_SHOW;
    this._noShowAt = new Date();
    this._updatedAt = new Date();
    this._domainEvents.push(
      new BookingNoShowEvent(
        this.id,
        this.userId,
        this.chargerId,
        this._penaltyAmount,
        refundAmount,
        this._depositTransactionId,
      ),
    );
  }

  get status(): BookingStatus { return this._status; }
  get updatedAt(): Date { return this._updatedAt; }
  get idempotencyKey(): string | null { return this._idempotencyKey; }
  get expiredAt(): Date | null { return this._expiredAt; }
  get noShowAt(): Date | null { return this._noShowAt; }
  get qrToken(): string | null { return this._qrToken; }
  get depositAmount(): number | null { return this._depositAmount; }
  get depositTransactionId(): string | null { return this._depositTransactionId; }
  get penaltyAmount(): number | null { return this._penaltyAmount; }
  get domainEvents(): DomainEvent[] { return [...this._domainEvents]; }
  clearDomainEvents(): void { this._domainEvents = []; }

  /**
   * Checks if QR token is valid at the given `at` time.
   * Valid if: startTime - 15min <= at <= endTime + 5min
   * VinFast allows entering 15 mins early, plus 5 mins buffer for setup.
   */
  isQrValidAt(at: Date): boolean {
    const EARLY_ENTRY_MS = 15 * 60_000;  // 15 mins before time
    const LATE_BUFFER_MS =  5 * 60_000;  // 5 mins after end time
    const earliest = this.timeRange.startTime.getTime() - EARLY_ENTRY_MS;
    const latest   = this.timeRange.endTime.getTime()   + LATE_BUFFER_MS;
    return at.getTime() >= earliest && at.getTime() <= latest;
  }

  private generateQrToken(): string {
    // Token: bookingId (8 chars) + random 16 chars hex - one-time, non-reusable
    const rand = crypto.randomBytes(8).toString('hex');
    const shortId = this.id.replace(/-/g, '').substring(0, 8).toUpperCase();
    return `EV-${shortId}-${rand.toUpperCase()}`;
  }
}
