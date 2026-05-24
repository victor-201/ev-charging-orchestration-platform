import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChargingPointOrmEntity,
  ProcessedEventOrmEntity,
} from '../../persistence/typeorm/entities/station.orm-entities';
import { RedisAvailabilityCache } from '../../cache/redis-availability.cache';

/**
 * Listens for events from charging-service when charger status changes
 * → Updates database and invalidates Redis cache
 */
@Injectable()
export class ChargerStatusConsumer {
  private readonly logger = new Logger(ChargerStatusConsumer.name);

  constructor(
    @InjectRepository(ChargingPointOrmEntity)
    private readonly chargerRepo: Repository<ChargingPointOrmEntity>,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
    private readonly cache: RedisAvailabilityCache,
  ) {}

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'charger.status.changed',
    queue: 'station-service.charger.status.changed',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleChargerStatusChanged(payload: {
    eventId: string;
    chargerId: string;
    stationId: string;
    newStatus: string;
    changedAt: string;
  }): Promise<void> {
    // Idempotency check
    const processed = await this.processedRepo.findOne({
      where: { eventId: payload.eventId },
    });
    if (processed) {
      this.logger.debug(`Event ${payload.eventId} already processed — skipping`);
      return;
    }

    try {
      // Update charger status in DB
      await this.chargerRepo.update(
        { id: payload.chargerId },
        {
          status: payload.newStatus,
          updatedAt: new Date(payload.changedAt),
        },
      );

      // Invalidate / update Redis cache
      await this.cache.setChargerStatus(payload.chargerId, payload.newStatus);
      await this.cache.invalidateStation(payload.stationId);

      // Mark as processed
      await this.processedRepo.save({
        eventId: payload.eventId,
        eventType: 'charger.status.changed',
      });

      this.logger.log(
        `Charger ${payload.chargerId} status → ${payload.newStatus} (station ${payload.stationId})`,
      );
    } catch (err) {
      this.logger.error(`Failed processing charger status event: ${err}`);
      throw err; // NACK — RabbitMQ will retry
    }
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'charger.fault.detected',
    queue: 'station-service.charger.fault.detected',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleChargerFault(payload: {
    eventId: string;
    chargerId: string;
    stationId: string;
    errorCode: string;
    detectedAt: string;
  }): Promise<void> {
    const processed = await this.processedRepo.findOne({ where: { eventId: payload.eventId } });
    if (processed) return;

    await this.chargerRepo.update(
      { id: payload.chargerId },
      { status: 'faulted', updatedAt: new Date(payload.detectedAt) },
    );

    await this.cache.setChargerStatus(payload.chargerId, 'faulted');
    await this.cache.invalidateStation(payload.stationId);

    await this.processedRepo.save({
      eventId: payload.eventId,
      eventType: 'charger.fault.detected',
    });

    this.logger.warn(
      `Charger ${payload.chargerId} fault detected: ${payload.errorCode}`,
    );
  }
}
