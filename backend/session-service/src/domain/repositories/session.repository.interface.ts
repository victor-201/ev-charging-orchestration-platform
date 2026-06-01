import { ChargingSession } from '../entities/charging-session.aggregate';

// Interfaces

export interface ISessionRepository {
  save(session: ChargingSession): Promise<void>;
  findById(id: string): Promise<ChargingSession | null>;
  findActiveByCharger(chargerId: string): Promise<ChargingSession | null>;
  findActiveByUser(userId: string): Promise<ChargingSession | null>;
  findByBookingId(bookingId: string): Promise<ChargingSession | null>;
  findByUserId(userId: string, limit?: number): Promise<ChargingSession[]>;
  findAll(limit?: number): Promise<ChargingSession[]>;
  findAllPaginated(
    limit: number,
    offset: number,
    userId?: string,
    chargerId?: string,
    status?: string,
    chargerIds?: string[],
  ): Promise<{ items: ChargingSession[]; total: number }>;
  /** Find STOPPED sessions older than cutoff - for reconciliation */
  findStoppedBefore(cutoff: Date): Promise<ChargingSession[]>;
  /** Idempotency check on start */
  findByIdempotencyKey(key: string): Promise<ChargingSession | null>;
}

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
