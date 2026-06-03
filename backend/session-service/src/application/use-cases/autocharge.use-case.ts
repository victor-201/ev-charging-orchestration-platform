import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { v4 as uuidv4 } from 'uuid';

import {
  SessionOrmEntity,
  ChargerStateOrmEntity,
  OutboxOrmEntity,
  ProcessedEventOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import { ChargerReadModelOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities';
import { ChargingSession } from '../../domain/entities/charging-session.aggregate';
import { EntityManager } from 'typeorm';

// Outbox helper (local copy)
function buildOutboxEntry(
  mgr: EntityManager,
  event: { eventType: string; [key: string]: any },
  aggregateId: string,
): OutboxOrmEntity {
  return mgr.create(OutboxOrmEntity, {
    id:            uuidv4(),
    aggregateType: 'session',
    aggregateId,
    eventType:     event.eventType,
    payload:       { ...event } as object,
    status:        'pending',
    processedAt:   null,
  });
}

/**
 * AutoChargeUseCase - ISO 15118 / Plug & Charge
 *
 * Triggered when OCPP Gateway receives StartTransaction with idTag = vehicle MAC address.
 * System automatically:
 *   1. Look up vehicle by mac_address -> get userId
 *   2. Check autocharge_enabled + outstanding debt
 *   3. Create active session (no bookingId)
 *   4. Publish session.started event -> Payment Service deducts walk-in wallet
 *
 * Routing: charger.transaction.started (from ocpp-gateway-service)
 */
@Injectable()
export class AutoChargeUseCase {
  private readonly logger = new Logger(AutoChargeUseCase.name);

  constructor(
    @InjectRepository(SessionOrmEntity)
    private readonly sessionRepo: Repository<SessionOrmEntity>,
    @InjectRepository(ChargerStateOrmEntity)
    private readonly chargerStateRepo: Repository<ChargerStateOrmEntity>,
    @InjectRepository(OutboxOrmEntity)
    private readonly outboxRepo: Repository<OutboxOrmEntity>,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly peRepo: Repository<ProcessedEventOrmEntity>,
    private readonly ds: DataSource,
  ) {}

  @RabbitSubscribe({
    exchange:     'ev.charging',
    routingKey:   'charger.transaction.started',
    queue:        'charging-svc.autocharge.transaction.started',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handle(payload: {
    chargerId:     string;
    transactionId: number;
    idTag:         string;   // vehicle MAC address
    connectorId:   number;
    meterStart:    number;
    timestamp:     string;
  }): Promise<void> {
    // Idempotency
    const eventId = `autocharge-txn-${payload.transactionId}`;
    if (await this.peRepo.existsBy({ eventId })) return;

    // Look up vehicle by MAC address
    const vehicleResult = await this.ds.query<Array<{
      vehicle_id:         string;
      owner_id:           string;
      autocharge_enabled: boolean;
    }>>(
      `SELECT v.id AS vehicle_id, v.owner_id, v.autocharge_enabled
       FROM vehicles v
       WHERE v.mac_address = $1 AND v.status = 'active'
       LIMIT 1`,
      [payload.idTag],
    );

    if (vehicleResult.length === 0) {
      this.logger.warn(
        `AutoCharge: No vehicle found with MAC=${payload.idTag} charger=${payload.chargerId}`,
      );
      return;
    }

    const { owner_id: userId, autocharge_enabled } = vehicleResult[0];

    if (!autocharge_enabled) {
      this.logger.warn(`AutoCharge disabled for MAC=${payload.idTag} userId=${userId}`);
      return;
    }

    // Check for outstanding debt
    const arrearsResult = await this.ds.query<Array<{ has_outstanding_debt: boolean }>>(
      `SELECT has_outstanding_debt FROM users_cache WHERE user_id = $1`,
      [userId],
    );
    if (arrearsResult.length > 0 && arrearsResult[0].has_outstanding_debt) {
      this.logger.warn(`AutoCharge blocked: userId=${userId} has outstanding debt`);
      return;
    }

    await this.ds.transaction(async (mgr) => {
      // Guard: charger is not occupied
      const activeSession = await mgr.findOne(SessionOrmEntity, {
        where: { chargerId: payload.chargerId, status: 'active' },
      });
      if (activeSession) {
        this.logger.warn(`AutoCharge: charger=${payload.chargerId} already occupied`);
        return;
      }

      const sessionId = uuidv4();
      const now = new Date();
      const startSocPercent = ChargingSession.generateStartSoc();

      await mgr.save(SessionOrmEntity, {
        id:                   sessionId,
        userId,
        chargerId:            payload.chargerId,
        bookingId:            null,
        startSocPercent,
        startMeterWh:         payload.meterStart,
        status:               'active',
        startTime:            new Date(payload.timestamp),
        endTime:              null,
        endMeterWh:           null,
        initiatedBy:          'autocharge',
        errorReason:          null,
        depositAmount:        0,
        depositTransactionId: null,
      });

      // Update charger state -> occupied
      await mgr.upsert(
        ChargerStateOrmEntity,
        {
          chargerId:       payload.chargerId,
          availability:    'occupied',
          activeSessionId: sessionId,
          errorCode:       null,
          updatedAt:       now,
        },
        ['chargerId'],
      );

      // Outbox event
      const event = {
        eventType:    'session.started',
        sessionId,
        userId,
        chargerId:    payload.chargerId,
        bookingId:    null,
        startTime:    new Date(payload.timestamp).toISOString(),
        startMeterWh: payload.meterStart,
        initiatedBy:  'autocharge',
        ocppTxnId:    payload.transactionId,
      };
      await mgr.save(buildOutboxEntry(mgr, event, sessionId));

      // Emit charger.status.changed so ev-infrastructure-service stays in sync
      const chargerRm = await mgr.findOneBy(ChargerReadModelOrmEntity, { chargerId: payload.chargerId });
      const stationId = chargerRm?.stationId ?? 'unknown';
      const statusEventId = uuidv4();
      await mgr.save(OutboxOrmEntity, mgr.create(OutboxOrmEntity, {
        id:            statusEventId,
        aggregateType: 'charger',
        aggregateId:   payload.chargerId,
        eventType:     'charger.status.changed',
        payload:       { eventId: statusEventId, chargerId: payload.chargerId, stationId, newStatus: 'in_use', changedAt: new Date().toISOString() },
        status:        'pending',
        processedAt:   null,
      }));

      // Idempotency
      await mgr.save(ProcessedEventOrmEntity, {
        eventId,
        eventType:   'charger.transaction.started',
        processedAt: now,
      });

      this.logger.log(
        `AutoCharge session started: session=${sessionId} ` +
        `user=${userId} charger=${payload.chargerId} ocppTxn=${payload.transactionId}`,
      );
    });
  }
}
