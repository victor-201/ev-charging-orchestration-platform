import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { OutboxOrmEntity } from './outbox.orm-entity';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

/**
 * OutboxPublisher - polling 5s, publishes pending events to RabbitMQ.
 * Priority: critical events (non-telemetry) are processed before session.telemetry
 * to prevent burials (e.g. charger.status.changed stuck behind millions of telemetry).
 */
@Injectable()
export class OutboxPublisher {
  private readonly logger        = new Logger(OutboxPublisher.name);
  private readonly MAX_RETRIES   = 5;
  private readonly EXCHANGE      = 'ev.charging';
  private readonly BATCH_SIZE    = 2000;
  private readonly TELEMETRY_EVENT = 'session.telemetry';

  constructor(
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async publishPending(): Promise<void> {
    // 1. Prioritise critical events first
    const criticalEvents = await this.outboxRepo.find({
      where: { status: 'pending', eventType: Not(this.TELEMETRY_EVENT) },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    // 2. Fill remaining batch with telemetry
    const telemetryBudget = this.BATCH_SIZE - criticalEvents.length;
    const telemetryEvents = telemetryBudget > 0
      ? await this.outboxRepo.find({
          where: { status: 'pending', eventType: this.TELEMETRY_EVENT },
          order: { createdAt: 'ASC' },
          take: telemetryBudget,
        })
      : [];

    const events = [...criticalEvents, ...telemetryEvents];

    for (const event of events) {
      try {
        await this.amqpConnection.publish(
          this.EXCHANGE,
          event.eventType,
          event.payload,
          { persistent: true, messageId: event.id },
        );
        event.status       = 'processed';
        event.processedAt  = new Date();
        event.errorMessage = null;
        this.logger.log(`Published event ${event.eventType} [${event.id}]`);
      } catch (err: any) {
        event.retryCount  += 1;
        event.errorMessage = err?.message ?? 'unknown error';
        if (event.retryCount >= this.MAX_RETRIES) {
          event.status = 'failed';
          this.logger.error(`Event ${event.id} dead-letter after ${event.retryCount} retries`);
        } else {
          this.logger.warn(`Event ${event.id} retry ${event.retryCount}/${this.MAX_RETRIES}`);
        }
      }
      await this.outboxRepo.save(event);
    }
  }
}
