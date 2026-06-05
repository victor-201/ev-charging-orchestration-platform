import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IQueueRepository,
  QUEUE_REPOSITORY,
} from '../../domain/repositories/queue.repository.interface';
import {
  IChargerRepository,
  CHARGER_REPOSITORY,
} from '../../domain/repositories/charger.repository.interface';
import { PriorityQueueService } from '../../domain/services/priority-queue.service';
import { CreateBookingUseCase } from './create-booking.use-case';
import { JoinQueueCommand, LeaveQueueCommand } from '../commands/booking.commands';
import { QueuePositionResponseDto } from '../dtos/response.dto';
import { IEventBus, EVENT_BUS } from '../../infrastructure/messaging/event-bus.interface';
import { QueueOrmEntity, OutboxOrmEntity, ChargerReadModelOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class JoinQueueUseCase {
  private readonly logger = new Logger(JoinQueueUseCase.name);

  constructor(
    @Inject(QUEUE_REPOSITORY) private readonly queueRepo: IQueueRepository,
    private readonly priorityQueue: PriorityQueueService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(cmd: JoinQueueCommand): Promise<QueuePositionResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const entry = await this.queueRepo.enqueue(
        {
          userId: cmd.userId,
          chargerId: cmd.chargerId,
          connectorType: cmd.connectorType,
          requestedAt: new Date(),
          userPriority: cmd.userPriority,
          urgencyScore: cmd.urgencyScore,
          status: 'waiting',
        },
        manager,
      );

      // Mirror into in-memory heap
      this.priorityQueue.enqueue(entry);

      const position = this.priorityQueue.getPosition(cmd.userId, cmd.chargerId);
      const estimatedWaitMinutes = position * 45; // avg 45min/session

      this.logger.log(`User ${cmd.userId} joined queue for ${cmd.chargerId} at position ${position}`);
      return { position, userId: cmd.userId, chargerId: cmd.chargerId, estimatedWaitMinutes };
    });
  }
}

@Injectable()
export class LeaveQueueUseCase {
  constructor(
    @Inject(QUEUE_REPOSITORY) private readonly queueRepo: IQueueRepository,
    private readonly priorityQueue: PriorityQueueService,
  ) {}

  async execute(cmd: LeaveQueueCommand): Promise<void> {
    await this.queueRepo.cancel(cmd.userId, cmd.chargerId);
    this.priorityQueue.removeByUser(cmd.userId, cmd.chargerId);
  }
}

/**
 * ProcessQueueUseCase - triggered when a charger slot becomes available
 * (via booking.cancelled or booking.completed event consumer)
 */
@Injectable()
export class ProcessQueueUseCase {
  private readonly logger = new Logger(ProcessQueueUseCase.name);

  constructor(
    private readonly priorityQueue: PriorityQueueService,
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    private readonly createBooking: CreateBookingUseCase,
  ) {}

  async execute(chargerId: string): Promise<void> {
    const available = await this.chargerRepo.isAvailable(chargerId);
    if (!available) return;

    const next = this.priorityQueue.dequeueForCharger(chargerId);
    if (!next) {
      this.logger.debug(`Queue empty for charger ${chargerId}`);
      return;
    }

    try {
      // Get charger info for stationId (needed for PricingHttpClient)
      const charger = await this.chargerRepo.findById(chargerId);
      if (!charger) {
        this.logger.warn(`Charger ${chargerId} not found in read-model`);
        return;
      }

      await this.createBooking.execute({
        userId:        next.userId,
        chargerId,
        stationId:     charger.stationId,
        connectorType: next.connectorType ?? charger.connectorType,
        startTime:     new Date(),
        endTime:       new Date(Date.now() + 60 * 60 * 1000), // 1h slot
      });
      this.logger.log(`Auto-assigned charger ${chargerId} to user ${next.userId} from queue`);
    } catch (err) {
      // Re-enqueue on failure
      this.priorityQueue.enqueue(next);
      this.logger.warn(`Auto-assign failed for ${chargerId}, re-queued user ${next.userId}`);
    }
  }
}

@Injectable()
export class NotifyQueueHeadUseCase {
  private readonly logger = new Logger(NotifyQueueHeadUseCase.name);

  constructor(
    @Inject(QUEUE_REPOSITORY) private readonly queueRepo: IQueueRepository,
    private readonly priorityQueue: PriorityQueueService,
    @InjectRepository(QueueOrmEntity)
    private readonly queueOrmRepo: Repository<QueueOrmEntity>,
    @InjectRepository(ChargerReadModelOrmEntity)
    private readonly chargerRmRepo: Repository<ChargerReadModelOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
  ) {}

  async execute(chargerId: string, manager?: EntityManager): Promise<void> {
    const queueRepoLocal = manager ? manager.getRepository(QueueOrmEntity) : this.queueOrmRepo;
    
    // Find first waiting user in line
    const waiting = await queueRepoLocal.find({
      where: { chargerId, status: 'waiting' },
      order: { priority: 'ASC', joinedAt: 'ASC' },
    });

    if (waiting.length === 0) {
      this.logger.debug(`No users waiting in queue for charger ${chargerId}`);
      return;
    }

    const head = waiting[0];

    // 1. Transition queue entry to 'notified' status
    head.status = 'notified';
    head.notifiedAt = new Date();
    head.expiresAt = new Date(Date.now() + 5 * 60_000); // 5 minutes grace period
    await queueRepoLocal.save(head);

    // 2. Remove the user from the in-memory min-heap
    this.priorityQueue.removeByUser(head.userId, chargerId);

    // 3. Resolve stationId and names for the outbox event
    const chargerRmRepoLocal = manager ? manager.getRepository(ChargerReadModelOrmEntity) : this.chargerRmRepo;
    const chargerRm = await chargerRmRepoLocal.findOneBy({ chargerId });
    const stationId = chargerRm?.stationId ?? 'unknown';
    const stationName = chargerRm?.stationName ?? 'unknown';

    // 4. Emit charger.queue.ready domain event via outbox pattern
    const outboxRepoLocal = manager ? manager.getRepository(OutboxOrmEntity) : this.outboxRepo;
    const eventId = uuidv4();
    await outboxRepoLocal.save(
      outboxRepoLocal.create({
        id:            eventId,
        aggregateType: 'charger',
        aggregateId:   chargerId,
        eventType:     'charger.queue.ready',
        payload:       {
          eventId,
          queueId:     head.id,
          userId:      head.userId,
          chargerId,
          stationId,
          stationName,
          chargerName: `Trụ sạc #${chargerId.slice(0, 8)}`,
          position:    1,
          availableAt: new Date().toISOString(),
          notifiedAt:  new Date().toISOString(),
        },
        status:      'pending',
        processedAt: null,
      }),
    );

    this.logger.log(
      `Queue head notified for charger ${chargerId}: user ${head.userId} queue ${head.id}`
    );
  }
}
