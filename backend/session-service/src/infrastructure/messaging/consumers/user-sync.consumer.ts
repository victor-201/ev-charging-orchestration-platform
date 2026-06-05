import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { UserReadModelOrmEntity } from '../../persistence/typeorm/entities/booking.orm-entities';
import { ProcessedEventOrmEntity } from '../../persistence/typeorm/entities/session.orm-entities';

@Injectable()
export class UserSyncConsumer {
  private readonly logger = new Logger(UserSyncConsumer.name);

  constructor(
    @InjectRepository(UserReadModelOrmEntity)
    private readonly repo: Repository<UserReadModelOrmEntity>,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'user.registered',
    queue: 'session-service.user.registered',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleUserRegistered(payload: {
    eventId: string;
    userId: string;
    email: string;
    fullName: string;
    role: string;
  }): Promise<void> {
    const eventId = payload.eventId;
    if (await this.peRepo.existsBy({ eventId })) return;

    try {
      await this.repo.upsert(
        {
          userId: payload.userId,
          email: payload.email,
          fullName: payload.fullName,
          isActive: true,
          syncedAt: new Date(),
        },
        ['userId'],
      );

      await this.peRepo.save({
        eventId,
        eventType: 'user.registered',
      });

      this.logger.log(`Synced user read model: ${payload.userId} (${payload.email})`);
    } catch (err) {
      this.logger.error(`Failed to sync user read model ${payload.userId}: ${err.message}`);
      throw err;
    }
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'user.deactivated',
    queue: 'session-service.user.deactivated',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleUserDeactivated(payload: { eventId: string; userId: string }): Promise<void> {
    const eventId = payload.eventId;
    if (await this.peRepo.existsBy({ eventId })) return;

    try {
      await this.repo.update({ userId: payload.userId }, { isActive: false, syncedAt: new Date() });
      await this.peRepo.save({ eventId, eventType: 'user.deactivated' });
      this.logger.log(`User deactivated in read model: ${payload.userId}`);
    } catch (err) {
      this.logger.error(`Failed to deactivate user read model ${payload.userId}: ${err.message}`);
      throw err;
    }
  }
}
