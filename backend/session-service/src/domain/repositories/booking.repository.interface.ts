import { Booking } from '../aggregates/booking.aggregate';
import { BookingStatus } from '../value-objects/booking-status.vo';
import { EntityManager } from 'typeorm';

export interface AvailabilitySlot {
  startTime: Date;
  endTime: Date;
  isBooked: boolean;
}

export interface IBookingRepository {
  save(booking: Booking, manager?: EntityManager): Promise<void>;
  findById(id: string): Promise<Booking | null>;
  findByUserAndStatus(userId: string, status: BookingStatus): Promise<Booking[]>;
  findActiveByCharger(chargerId: string): Promise<Booking[]>;
  /** List of active bookings for the day - used to calculate availability slots */
  findByChargerAndDate(chargerId: string, date: Date): Promise<Booking[]>;
  /** Overlap check - for use inside transactions */
  hasOverlap(
    chargerId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
    manager?: EntityManager,
  ): Promise<boolean>;
  /** Find PENDING_PAYMENT bookings created before cutoff (5-min expire) */
  findPendingPaymentBefore(cutoff: Date): Promise<Booking[]>;
  /** Find CONFIRMED bookings whose startTime < cutoff (for no-show detection) */
  findConfirmedStartedBefore(cutoff: Date): Promise<Booking[]>;
  /** Get queue position for a user+charger */
  getQueuePosition(userId: string, chargerId: string): Promise<number>;
  /** Find booking by idempotency key */
  findByIdempotencyKey(key: string): Promise<Booking | null>;
  /** Find by deposit transaction ID - for payment callback lookup */
  findByDepositTransactionId(transactionId: string): Promise<Booking | null>;
  /** Paginated list of user bookings */
  findByUser(userId: string, limit?: number, offset?: number): Promise<{ items: Booking[]; total: number }>;
  /**
   * Retrieves active upcoming bookings for the specified chargers.
   *
   * @param chargerIds - Array of charger identifiers to retrieve bookings for
   */
  findUpcomingByChargers(chargerIds: string[]): Promise<Booking[]>;

  /**
   * Persists generated charger scheduling suggestions for analytics or reservations.
   *
   * @param slots - Array of suggested slot inputs to save
   */
  saveSchedulingSlots(slots: SchedulingSlotInput[]): Promise<void>;
}

export interface SchedulingSlotInput {
  chargerId: string;
  userId: string;
  vehicleId: string | null;
  suggestedStart: Date;
  suggestedEnd: Date;
  confidenceScore: number | null;
  algorithm: string | null;
}

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');
