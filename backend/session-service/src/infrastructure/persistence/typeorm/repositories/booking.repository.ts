import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, In } from 'typeorm';
import { Booking } from '../../../../domain/aggregates/booking.aggregate';
import { BookingTimeRange } from '../../../../domain/value-objects/booking-time-range.vo';
import { BookingStatus } from '../../../../domain/value-objects/booking-status.vo';
import { DomainException } from '../../../../domain/exceptions/domain.exception';
import { IBookingRepository, SchedulingSlotInput } from '../../../../domain/repositories/booking.repository.interface';
import {
  BookingOrmEntity,
  BookingStatusHistoryOrmEntity,
  SchedulingSlotOrmEntity,
} from '../entities/booking.orm-entities';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BookingRepository implements IBookingRepository {
  private readonly logger = new Logger(BookingRepository.name);

  constructor(
    @InjectRepository(BookingOrmEntity)
    private readonly repo: Repository<BookingOrmEntity>,
    @InjectRepository(BookingStatusHistoryOrmEntity)
    private readonly historyRepo: Repository<BookingStatusHistoryOrmEntity>,
  ) {}

  async save(booking: Booking, manager?: EntityManager): Promise<void> {
    const entity = this.toOrm(booking);
    const isNew  = !(await (manager ?? this.repo.manager)
      .existsBy(BookingOrmEntity, { id: booking.id }));

    if (manager) {
      await manager.save(BookingOrmEntity, entity);
      if (!isNew) {
        await manager.save(BookingStatusHistoryOrmEntity, {
          id:        uuidv4(),
          bookingId: booking.id,
          status:    booking.status,
          changedAt: new Date(),
          changedBy: null,
          reason:    null,
        });
      }
    } else {
      await this.repo.save(entity);
    }
  }

  async findById(id: string): Promise<Booking | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity ? this.safeToDomain(entity) : null;
  }

  async findByUserAndStatus(userId: string, status: BookingStatus): Promise<Booking[]> {
    const entities = await this.repo.findBy({ userId, status });
    return entities.map(this.safeToDomain.bind(this)).filter((b): b is Booking => b !== null);
  }

  async findByUser(
    userId: string,
    limit = 20,
    offset = 0,
    status?: string,
  ): Promise<{ items: Booking[]; total: number }> {
    const where: any = { userId };
    if (status && status !== 'ALL') {
      where.status = status.toLowerCase();
    }
    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items: rows.map(this.safeToDomain.bind(this)).filter((b): b is Booking => b !== null), total };
  }

  async findAll(
    limit = 20,
    offset = 0,
    userId?: string,
    chargerId?: string,
    status?: string,
    chargerIds?: string[],
  ): Promise<{ items: Booking[]; total: number }> {
    const where: any = {};
    if (userId) where.userId = userId;
    if (chargerId) where.chargerId = chargerId;
    if (status) where.status = status;
    if (chargerIds && chargerIds.length > 0) {
      where.chargerId = In(chargerIds);
    }

    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return {
      items: rows.map(this.safeToDomain.bind(this)).filter((b): b is Booking => b !== null),
      total,
    };
  }

  async findActiveByCharger(chargerId: string): Promise<Booking[]> {
    const entities = await this.repo.findBy({
      chargerId,
      status: In(['pending_payment', 'confirmed']),
    });
    return entities.map(this.safeToDomain.bind(this)).filter((b): b is Booking => b !== null);
  }

  /**
   * Get all active bookings on a specific date for a charger - used for calculating availability
   */
  async findByChargerAndDate(chargerId: string, date: Date): Promise<Booking[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    startOfDay.setDate(startOfDay.getDate() - 1);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const entities = await this.repo
      .createQueryBuilder('b')
      .where('b.charger_id = :chargerId', { chargerId })
      .andWhere("b.status IN ('pending_payment','confirmed')")
      .andWhere('b.start_time < :endOfDay', { endOfDay })
      .andWhere('b.end_time > :startOfDay', { startOfDay })
      .orderBy('b.start_time', 'ASC')
      .getMany();

    return entities.map(this.safeToDomain.bind(this)).filter((b): b is Booking => b !== null);
  }

  async hasOverlap(
    chargerId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const qb = (manager ?? this.repo.manager)
      .createQueryBuilder(BookingOrmEntity, 'b')
      .where('b.charger_id = :chargerId', { chargerId })
      .andWhere("b.status IN ('pending_payment','confirmed')")
      .andWhere('b.start_time < :endTime',   { endTime })
      .andWhere('b.end_time   > :startTime', { startTime });

    if (excludeBookingId) {
      qb.andWhere('b.id != :excludeBookingId', { excludeBookingId });
    }

    const count = await qb.getCount();
    return count > 0;
  }

  /** Booking PENDING_PAYMENT older than 5 minutes -> auto expire */
  async findPendingPaymentBefore(cutoff: Date): Promise<Booking[]> {
    const entities = await this.repo
      .createQueryBuilder('b')
      .where("b.status = 'pending_payment'")
      .andWhere('b.created_at <= :cutoff', { cutoff })
      .getMany();
    return entities.map(this.safeToDomain.bind(this)).filter((b): b is Booking => b !== null);
  }

  async findConfirmedStartedBefore(cutoff: Date): Promise<Booking[]> {
    const entities = await this.repo
      .createQueryBuilder('b')
      .where("b.status = 'confirmed'")
      .andWhere('b.start_time <= :cutoff', { cutoff })
      .getMany();
    return entities.map(this.safeToDomain.bind(this)).filter((b): b is Booking => b !== null);
  }

  async getQueuePosition(userId: string, chargerId: string): Promise<number> {
    const count = await this.repo
      .createQueryBuilder('b')
      .where("b.status = 'pending_payment'")
      .andWhere('b.charger_id = :chargerId', { chargerId })
      .andWhere(
        "b.created_at < (SELECT created_at FROM bookings WHERE user_id = :userId AND charger_id = :chargerId AND status = 'pending_payment' LIMIT 1)",
        { userId, chargerId },
      )
      .getCount();
    return count + 1;
  }

  async findByIdempotencyKey(key: string): Promise<Booking | null> {
    const entity = await this.repo.findOneBy({ idempotencyKey: key } as any);
    return entity ? this.safeToDomain(entity) : null;
  }

  async findByDepositTransactionId(transactionId: string): Promise<Booking | null> {
    const entity = await this.repo.findOneBy({ depositTransactionId: transactionId } as any);
    return entity ? this.safeToDomain(entity) : null;
  }

  async findUpcomingByChargers(chargerIds: string[]): Promise<Booking[]> {
    if (chargerIds.length === 0) return [];
    const entities = await this.repo
      .createQueryBuilder('b')
      .where('b.charger_id IN (:...chargerIds)', { chargerIds })
      .andWhere("b.status IN ('pending_payment', 'confirmed')")
      .andWhere('b.start_time >= :now', { now: new Date() })
      .getMany();
    return entities.map(this.safeToDomain.bind(this)).filter((b): b is Booking => b !== null);
  }

  // Mappers

  private toOrm(b: Booking): BookingOrmEntity {
    const e = new BookingOrmEntity();
    e.id                   = b.id;
    e.userId               = b.userId;
    e.vehicleId            = (b as any).vehicleId ?? null;
    e.chargerId            = b.chargerId;
    e.pricingSnapshotId    = (b as any).pricingSnapshotId ?? null;
    e.startTime            = b.timeRange.startTime;
    e.endTime              = b.timeRange.endTime;
    e.status               = b.status;
    e.expiresAt            = b.expiredAt ?? null;
    e.notes                = (b as any).notes ?? null;
    e.qrToken              = b.qrToken ?? null;
    e.depositAmount        = b.depositAmount ?? null;
    e.depositTransactionId = b.depositTransactionId ?? null;
    e.penaltyAmount        = b.penaltyAmount ?? null;
    e.connectorType        = b.connectorType ?? null;
    e.pricePerKwhSnapshot  = b.pricePerKwhSnapshot ?? null;
    e.idempotencyKey       = b.idempotencyKey;
    e.createdAt            = b.createdAt;
    e.updatedAt            = b.updatedAt;
    return e;
  }

  private toDomain(e: BookingOrmEntity): Booking {
    return Booking.reconstitute({
      id:                   e.id,
      userId:               e.userId,
      chargerId:            e.chargerId,
      timeRange:            new BookingTimeRange(e.startTime, e.endTime),
      status:               e.status as BookingStatus,
      idempotencyKey:       e.idempotencyKey,
      expiredAt:            e.expiresAt ?? null,
      qrToken:              (e as any).qrToken ?? null,
      depositAmount:        (e as any).depositAmount ?? null,
      depositTransactionId: (e as any).depositTransactionId ?? null,
      penaltyAmount:        (e as any).penaltyAmount ?? null,
      connectorType:        e.connectorType ?? null,
      pricePerKwhSnapshot:  e.pricePerKwhSnapshot ? Number(e.pricePerKwhSnapshot) : null,
      createdAt:            e.createdAt,
      updatedAt:            e.updatedAt,
    });
  }

  /**
   * Safe version of toDomain that logs and skips corrupt records instead of throwing.
   * Used in list operations where a single bad record should not break the entire response.
   */
  private safeToDomain(e: BookingOrmEntity): Booking | null {
    try {
      return this.toDomain(e);
    } catch (err) {
      if (err instanceof DomainException) {
        this.logger.warn(`Skipping booking ${e.id}: ${err.message}`);
        return null;
      }
      throw err;
    }
  }

  async saveSchedulingSlots(slots: SchedulingSlotInput[]): Promise<void> {
    const entities = slots.map(s => {
      const e = new SchedulingSlotOrmEntity();
      e.chargerId = s.chargerId;
      e.userId = s.userId;
      e.vehicleId = s.vehicleId;
      e.suggestedStart = s.suggestedStart;
      e.suggestedEnd = s.suggestedEnd;
      e.confidenceScore = s.confidenceScore;
      e.algorithm = s.algorithm;
      e.acceptedAt = null;
      e.bookingId = null;
      return e;
    });
    await this.repo.manager.save(SchedulingSlotOrmEntity, entities);
  }
}
