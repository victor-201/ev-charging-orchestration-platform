import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FaultDetectionService } from '../../../application/use-cases/reconciliation.use-cases';
import {
  TelemetryOrmEntity,
  ProcessedEventOrmEntity,
  SessionOrmEntity,
} from '../../persistence/typeorm/entities/session.orm-entities';
import { OutboxOrmEntity } from '../../persistence/typeorm/entities/booking.orm-entities';
import { v4 as uuidv4 } from 'uuid';
import { ChargingGateway } from '../../../infrastructure/realtime/charging.gateway';


/**
 * TelemetryConsumer - Telemetry event ingestion from telemetry-ingestion-service.
 *
 * Listens on exchange: ev.telemetry, routing key: telemetry.ingested
 * (published by telemetry-ingestion-service after normalizing OCPP meter values).
 *
 * On each received event:
 *  1. Idempotency check via processed_events
 *  2. Persist normalized reading to telemetry_readings
 *  3. Emit session.telemetry into outbox → picked up by OutboxPublisher → ev.charging exchange
 *     → ChargingGateway broadcasts charging_updated to mobile Socket.IO clients
 *     → SessionTelemetryPushConsumer (notification-service) sends FCM push (throttled 30s)
 *  4. Trigger FaultDetectionService for anomaly analysis
 */
@Injectable()
export class TelemetryConsumer {
  private readonly logger = new Logger(TelemetryConsumer.name);

  constructor(
    @InjectRepository(TelemetryOrmEntity)
    private readonly telemetryRepo: Repository<TelemetryOrmEntity>,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    private readonly faultDetection: FaultDetectionService,
    private readonly chargingGateway: ChargingGateway,
  ) {}

  @RabbitSubscribe({
    exchange: 'ev.telemetry',
    routingKey: 'telemetry.ingested',
    queue: 'session-svc.telemetry.ingested',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'ev.charging.dlx',
      arguments: { 'x-message-ttl': 300000 }, // 5min TTL
    },
  })
  async handleTelemetry(payload: {
    eventId: string;
    sessionId: string;
    chargerId: string;
    powerKw: number;
    currentA: number;
    voltageV: number;
    meterWh?: number;
    socPercent?: number;
    temperatureC?: number;
    errorCode?: string;
    recordedAt: string;
    publishedAt: string;
  }): Promise<void> {
    // Idempotency check
    const alreadyProcessed = await this.processedRepo.existsBy({ eventId: payload.eventId });
    if (alreadyProcessed) {
      this.logger.debug(`Telemetry ${payload.eventId} already processed`);
      return;
    }

    try {
      // Look up session to get userId for downstream events
      const sessionOrm = await this.sessionRepo.findOne({
        where: { id: payload.sessionId },
        select: ['id', 'userId', 'chargerId', 'startSocPercent', 'startMeterWh', 'status'],
      });

      if (!sessionOrm) {
        this.logger.warn(
          `Telemetry ignored: no active session ${payload.sessionId} for charger ${payload.chargerId}`,
        );
        // Still mark processed to avoid infinite retry
        await this.processedRepo.save({ eventId: payload.eventId, eventType: 'telemetry.ingested.no_session' });
        return;
      }

      // Estimate SoC if not provided directly by charger
      let estimatedSoc = payload.socPercent ?? null;
      if (estimatedSoc === null && payload.meterWh != null && sessionOrm.startSocPercent != null) {
        const energyDeltaWh = payload.meterWh - Number(sessionOrm.startMeterWh ?? 0);
        const batteryCapacityWh = Number(process.env.ESTIMATED_BATTERY_CAPACITY_WH || 60_000);
        estimatedSoc = Math.min(100, Math.max(0,
          Math.round(sessionOrm.startSocPercent + (energyDeltaWh / batteryCapacityWh) * 100)
        ));
      }

      // Step 1: Persist telemetry reading
      await this.telemetryRepo.save({
        id:           uuidv4(),
        sessionId:    payload.sessionId,
        chargerId:    payload.chargerId,
        powerKw:      payload.powerKw,
        currentA:     payload.currentA,
        voltageV:     payload.voltageV,
        socPercent:   estimatedSoc,
        meterWh:      payload.meterWh ?? null,
        temperatureC: payload.temperatureC ?? null,
        errorCode:    payload.errorCode ?? null,
        recordedAt:   new Date(payload.recordedAt ?? payload.publishedAt),
      });

      // Step 2: Emit session.telemetry into outbox
      // OutboxPublisher (5s cron) will publish this to ev.charging exchange,
      // which triggers:
      //   - ChargingGateway.pollAndBroadcast() → charging_updated socket event to mobile app
      //   - SessionTelemetryPushConsumer (notification-service) → FCM push (throttled 30s)
      const telemetryEventId = uuidv4();
      await this.outboxRepo.save(
        this.outboxRepo.create({
          id:            telemetryEventId,
          aggregateType: 'session',
          aggregateId:   payload.sessionId,
          eventType:     'session.telemetry',
          payload: {
            eventType:    'session.telemetry',
            sessionId:    payload.sessionId,
            userId:       sessionOrm.userId,
            chargerId:    payload.chargerId,
            powerKw:      payload.powerKw,
            meterWh:      payload.meterWh ?? null,
            socPercent:   estimatedSoc,
            voltageV:     payload.voltageV,
            currentA:     payload.currentA,
            temperatureC: payload.temperatureC ?? null,
            errorCode:    payload.errorCode ?? null,
            amountDue:    null, // Will be updated by billing service
            recordedAt:   payload.recordedAt ?? payload.publishedAt,
          },
          status:      'pending',
          processedAt: null,
        }),
      );

      // Register the outbox event ID as broadcasted so ChargingGateway's cron doesn't broadcast it again
      this.chargingGateway.addBroadcastedId(telemetryEventId);

      // Broadcast immediately via WebSocket Gateway for instant real-time telemetry
      const wsPayload = {
        eventType:    'session.telemetry',
        sessionId:    payload.sessionId,
        userId:       sessionOrm.userId,
        chargerId:    payload.chargerId,
        powerKw:      payload.powerKw,
        meterWh:      payload.meterWh ?? null,
        socPercent:   estimatedSoc,
        voltageV:     payload.voltageV,
        currentA:     payload.currentA,
        temperatureC: payload.temperatureC ?? null,
        errorCode:    payload.errorCode ?? null,
        amountDue:    null,
        recordedAt:   payload.recordedAt ?? payload.publishedAt,
      };

      this.chargingGateway.broadcastToSession(payload.sessionId, 'charging_updated', wsPayload);
      this.chargingGateway.broadcastToCharger(payload.chargerId, 'charging_updated', wsPayload);

      // Step 3: Analyze for faults (battery overtemp, voltage anomaly, etc.)
      await this.faultDetection.analyze({
        chargerId:  payload.chargerId,
        sessionId:  payload.sessionId,
        powerKw:    payload.powerKw,
        currentA:   payload.currentA,
        voltageV:   payload.voltageV,
        errorCode:  payload.errorCode,
        timestamp:  new Date(payload.recordedAt ?? payload.publishedAt),
      });

      // Step 4: Mark event as processed (idempotency)
      await this.processedRepo.save({
        eventId:   payload.eventId,
        eventType: 'telemetry.ingested',
      });

      this.logger.debug(
        `Telemetry ingested: session=${payload.sessionId} charger=${payload.chargerId} ` +
        `power=${payload.powerKw}kW soc=${estimatedSoc ?? '--'}%`,
      );
    } catch (err) {
      this.logger.error(`Telemetry processing failed: ${err}`);
      throw err; // NACK → RabbitMQ retry
    }
  }
}
