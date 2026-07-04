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
    eventId?: string;
    chargerId: string;
    stationId?: string;
    newStatus?: string;
    status?: string;
    changedAt: string;
  }): Promise<void> {
    const eventId = payload.eventId ?? `ocpp-status:${payload.chargerId}:${payload.status ?? 'unknown'}:${payload.changedAt}`;

    // Idempotency check
    const processed = await this.processedRepo.findOne({
      where: { eventId },
    });
    if (processed) {
      this.logger.debug(`Event ${eventId} already processed — skipping`);
      return;
    }

    try {
      // Map status if needed
      let finalStatus = payload.newStatus;
      const isOcppEvent = !payload.newStatus && !!payload.status;
      if (isOcppEvent && payload.status) {
        const ocppStatus = payload.status.toLowerCase();
        switch (ocppStatus) {
          case 'available':
            finalStatus = 'available';
            break;
          case 'preparing':
          case 'charging':
          case 'finishing':
            finalStatus = 'in_use';
            break;
          case 'reserved':
            finalStatus = 'reserved';
            break;
          case 'unavailable':
          case 'offline':
            finalStatus = 'offline';
            break;
          case 'faulted':
            finalStatus = 'faulted';
            break;
          default:
            finalStatus = 'available';
        }
      }

      if (!finalStatus) {
        this.logger.warn(`No valid status in payload for charger ${payload.chargerId}`);
        return;
      }

      // Check if charger exists and get stationId
      const charger = await this.chargerRepo.findOneBy({ id: payload.chargerId });
      if (!charger) {
        this.logger.warn(`Charger ${payload.chargerId} not found in database — skipping status update`);
        return;
      }
      const stationId = payload.stationId ?? charger.stationId;

      // IMPORTANT: OCPP-originated 'available' must NOT overwrite platform 'in_use'.
      // Once the platform sets a charger to in_use (via StartSessionUseCase),
      // the physical charger may still send StatusNotification(Available) for
      // various reasons (reconnect, connector state sync). We must preserve
      // the platform status until the session is explicitly stopped.
      if (isOcppEvent && finalStatus === 'available' && charger.status === 'in_use') {
        this.logger.log(
          `Charger ${payload.chargerId}: OCPP 'available' ignored — charger is in_use (active session)`,
        );
        await this.processedRepo.upsert(
          { eventId, eventType: 'charger.status.changed' },
          ['eventId'],
        );
        return;
      }

      // Update charger status in DB
      await this.chargerRepo.update(
        { id: payload.chargerId },
        {
          status: finalStatus,
          updatedAt: new Date(payload.changedAt),
        },
      );

      // Invalidate / update Redis cache
      await this.cache.setChargerStatus(payload.chargerId, finalStatus);
      await this.cache.invalidateStation(stationId);

      // Mark as processed
      await this.processedRepo.upsert(
        { eventId, eventType: 'charger.status.changed' },
        ['eventId'],
      );

      this.logger.log(
        `Charger ${payload.chargerId} status → ${finalStatus} (station ${stationId})`,
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

    await this.processedRepo.upsert(
      { eventId: payload.eventId, eventType: 'charger.fault.detected' },
      ['eventId'],
    );

    this.logger.warn(
      `Charger ${payload.chargerId} fault detected: ${payload.errorCode}`,
    );
  }
}
