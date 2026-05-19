import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, In } from 'typeorm';
import { Booking } from '../../../../domain/aggregates/booking.aggregate';
import { BookingTimeRange } from '../../../../domain/value-objects/booking-time-range.vo';
import { BookingStatus } from '../../../../domain/value-objects/booking-status.vo';
import { IBookingRepository } from '../../../../domain/repositories/booking.repository.interface';
import {
  BookingOrmEntity,
  BookingStatusHistoryOrmEntity,
} from '../entities/booking.orm-entities';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BookingRepository implements IBookingRepository {
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
    return entity ? this.toDomain(entity) : null;
  }

  async findByUserAndStatus(userId: string, status: BookingStatus): Promise<Booking[]> {
    const entities = await this.repo.findBy({ userId, status });
    return entities.map(this.toDomain.bind(this));
  }

  async findByUser(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ items: Booking[]; total: number }> {
    const [rows, total] = await this.repo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items: rows.map(this.toDomain.bind(this)), total };
  }

  async findActiveByCharger(chargerId: string): Promise<Booking[]> {
    const entities = await this.repo.findBy({
      chargerId,
      status: In(['pending_payment', 'confirmed']),
    });
    return entities.map(this.toDomain.bind(this));
  }

  /**
   * Get all active bookings on a specific date for a charger - used for calculating availability
   */
  async findByChargerAndDate(chargerId: string, date: Date): Promise<Booking[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const entities = await this.repo
      .createQueryBuilder('b')
      .where('b.charger_id = :chargerId', { chargerId })
      .andWhere("b.status IN ('pending_payment','confirmed')")
      .andWhere('b.start_time < :endOfDay', { endOfDay })
      .andWhere('b.end_time > :startOfDay', { startOfDay })
      .orderBy('b.start_time', 'ASC')
      .getMany();

    return entities.map(this.toDomain.bind(this));
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
    return entities.map(this.toDomain.bind(this));
  }

  async findConfirmedStartedBefore(cutoff: Date): Promise<Booking[]> {
    const entities = await this.repo
      .createQueryBuilder('b')
      .where("b.status = 'confirmed'")
      .andWhere('b.start_time <= :cutoff', { cutoff })
      .getMany();
    return entities.map(this.toDomain.bind(this));
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
    return entity ? this.toDomain(entity) : null;
  }

  async findByDepositTransactionId(transactionId: string): Promise<Booking | null> {
    const entity = await this.repo.findOneBy({ depositTransactionId: transactionId } as any);
    return entity ? this.toDomain(entity) : null;
  }

  async findUpcomingByChargers(chargerIds: string[]): Promise<Booking[]> {
    if (chargerIds.length === 0) return [];
    const entities = await this.repo
      .createQueryBuilder('b')
      .where('b.charger_id IN (:...chargerIds)', { chargerIds })
      .andWhere("b.status IN ('pending_payment', 'confirmed')")
      .andWhere('b.start_time >= :now', { now: new Date() })
      .getMany();
    return entities.map(this.toDomain.bind(this));
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
      expiredAt:            e.expiresAt ?? null,
      qrToken:              (e as any).qrToken ?? null,
      depositAmount:        (e as any).depositAmount ?? null,
      depositTransactionId: (e as any).depositTransactionId ?? null,
      penaltyAmount:        (e as any).penaltyAmount ?? null,
      createdAt:            e.createdAt,
      updatedAt:            e.updatedAt,
    });
  }
}
