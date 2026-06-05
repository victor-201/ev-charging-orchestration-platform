import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, In } from 'typeorm';
import { QueueOrmEntity } from '../entities/booking.orm-entities';
import {
  IQueueRepository,
  QueueEntry,
} from '../../../../domain/repositories/queue.repository.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class QueueRepository implements IQueueRepository {
  constructor(
    @InjectRepository(QueueOrmEntity)
    private readonly repo: Repository<QueueOrmEntity>,
  ) {}

  async enqueue(
    entry: Omit<QueueEntry, 'id' | 'score'>,
    manager?: EntityManager,
  ): Promise<QueueEntry> {
    const entity = this.repo.create({
      id:        uuidv4(),
      userId:    entry.userId,
      chargerId: entry.chargerId,
      vehicleId: null,
      priority:  Math.max(1, Math.min(999, Math.round((10 - entry.userPriority) * 99.8 + 1))), // Map 1-10 priority -> 1-999 DB
      status:    'waiting',
      joinedAt:  entry.requestedAt,
      expiresAt: null,
    });
    const saved = manager
      ? await manager.save(QueueOrmEntity, entity)
      : await this.repo.save(entity);
    return this.toDomain(saved, entry.userPriority, entry.urgencyScore, entry.connectorType);
  }

  async dequeue(chargerId: string): Promise<QueueEntry | null> {
    const entry = await this.repo.findOne({
      where: { chargerId, status: 'waiting' },
      order: { priority: 'ASC', joinedAt: 'ASC' },
    });
    if (!entry) return null;
    await this.repo.update(entry.id, { status: 'served', servedAt: new Date() });
    return this.toDomain(entry);
  }

  async cancel(userId: string, chargerId: string): Promise<void> {
    await this.repo.update({ userId, chargerId, status: 'waiting' }, { status: 'cancelled' });
  }

  async findWaiting(chargerId: string): Promise<QueueEntry[]> {
    const entries = await this.repo.find({
      where:  { chargerId, status: 'waiting' },
      order:  { priority: 'ASC', joinedAt: 'ASC' },
    });
    return entries.map((e) => this.toDomain(e));
  }

  async getPosition(userId: string, chargerId: string): Promise<number> {
    // Check if there is a notified entry for this user
    const entry = await this.repo.findOne({
      where: { userId, chargerId, status: In(['waiting', 'notified']) },
      order: { joinedAt: 'DESC' },
    });
    if (!entry) return -1;
    if (entry.status === 'notified') return 0;

    // Use DB-side ROW_NUMBER() for accuracy (aligns with vw_queue_positions view)
    const rows: { user_id: string; rn: string }[] = await this.repo.manager.query(
      `SELECT user_id, ROW_NUMBER() OVER (PARTITION BY charger_id ORDER BY priority ASC, joined_at ASC) AS rn
       FROM queue_entries
       WHERE charger_id = $1 AND status = 'waiting'`,
      [chargerId],
    );
    const row = rows.find((r) => r.user_id === userId);
    return row ? parseInt(row.rn) : -1;
  }

  async loadAllWaiting(): Promise<QueueEntry[]> {
    const entries = await this.repo.find({
      where: { status: 'waiting' },
      order: { priority: 'ASC', joinedAt: 'ASC' },
    });
    return entries.map((e) => this.toDomain(e));
  }

  private toDomain(
    e: QueueOrmEntity,
    userPriority?: number,
    urgencyScore?: number,
    connectorType?: string,
  ): QueueEntry {
    return {
      id:           e.id,
      userId:       e.userId,
      chargerId:    e.chargerId,
      connectorType: connectorType,
      requestedAt:  e.joinedAt,
      userPriority: userPriority ?? Math.round(10 - ((e.priority - 1) / 99.8)),
      urgencyScore: urgencyScore ?? 0,
      status:       e.status as QueueEntry['status'],
    };
  }
}
