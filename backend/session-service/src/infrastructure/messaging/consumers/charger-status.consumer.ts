import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ProcessQueueUseCase } from '../../../application/use-cases/queue.use-case';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessedEventOrmEntity } from '../../persistence/typeorm/entities/session.orm-entities';

interface ChargerStatusChangedPayload {
  chargerId: string;
  status: 'available' | 'in_use' | 'offline' | 'reserved' | 'faulted';
  eventId?: string;
}

@Injectable()
export class ChargerStatusConsumer {
  constructor(
    private readonly processQueue: ProcessQueueUseCase,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
  ) {}

  /**
   * Triggered by station-service when a charger becomes available.
   * Routes to ProcessQueueUseCase → auto-assign next in queue.
   */
  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'slot.available',
    queue: 'booking.slot.available',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleSlotAvailable(payload: ChargerStatusChangedPayload): Promise<void> {
    const eventId = payload.eventId ?? `slot.available:${payload.chargerId}:${Date.now()}`;
    if (payload.eventId && await this.peRepo.existsBy({ eventId: payload.eventId })) return;

    if (payload.status === 'available') {
      await this.processQueue.execute(payload.chargerId);
    }
    
    if (payload.eventId) await this.peRepo.upsert({ eventId, eventType: 'slot.available' }, ['eventId']);
  }

  /**
   * Triggered after booking.cancelled or booking.completed.
   * Also attempts to serve next in queue.
   */
  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.cancelled',
    queue: 'booking.post-cancel-queue',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleBookingCancelled(payload: { chargerId: string; eventId?: string }): Promise<void> {
    if (payload.eventId && await this.peRepo.existsBy({ eventId: payload.eventId })) return;

    await this.processQueue.execute(payload.chargerId);
    
    if (payload.eventId) await this.peRepo.upsert({ eventId: payload.eventId, eventType: 'booking.cancelled' }, ['eventId']);
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'booking.completed',
    queue: 'booking.post-complete-queue',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleBookingCompleted(payload: { chargerId: string; eventId?: string }): Promise<void> {
    if (payload.eventId && await this.peRepo.existsBy({ eventId: payload.eventId })) return;

    await this.processQueue.execute(payload.chargerId);
    
    if (payload.eventId) await this.peRepo.upsert({ eventId: payload.eventId, eventType: 'booking.completed' }, ['eventId']);
  }
}
