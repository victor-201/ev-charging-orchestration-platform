import { EntityManager } from 'typeorm';

export interface QueueEntry {
  id: string;
  userId: string;
  chargerId: string;
  connectorType?: string;
  requestedAt: Date;
  userPriority: number;   // 1–10; premium subscriber = 10
  urgencyScore: number;   // 0-10; low battery SoC -> higher
  status: 'waiting' | 'assigned' | 'cancelled';
  score?: number;
}

export interface IQueueRepository {
  enqueue(entry: Omit<QueueEntry, 'id' | 'score'>, manager?: EntityManager): Promise<QueueEntry>;
  dequeue(chargerId: string): Promise<QueueEntry | null>;
  cancel(userId: string, chargerId: string): Promise<void>;
  findWaiting(chargerId: string): Promise<QueueEntry[]>;
  getPosition(userId: string, chargerId: string): Promise<number>;
  loadAllWaiting(): Promise<QueueEntry[]>;
}

export const QUEUE_REPOSITORY = Symbol('QUEUE_REPOSITORY');
