import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionController } from './session.controller';
import { StartSessionUseCase, StopSessionUseCase, RecordTelemetryUseCase, GetSessionUseCase, BookingConfirmedConsumer, PaymentCompletedConsumer } from '../../application/use-cases/session.use-cases';
import { AutoChargeUseCase } from '../../application/use-cases/autocharge.use-case';
import { IdleFeeDetectionJob, StoppedSessionBillingJob, ChargerReservationJob } from '../../application/use-cases/idle-fee.use-case';
import { QueueCleanupJob, ForceStopJob } from '../../application/use-cases/queue-cleanup.job';
import { LateDeliveryReconciler } from '../../application/use-cases/late-delivery-reconciler';
import { ReconciliationJob, FaultDetectionService } from '../../application/use-cases/reconciliation.use-cases';
import { EVENT_BUS } from '../../infrastructure/messaging/event-bus.interface';
import { OutboxEventBus } from '../../infrastructure/messaging/outbox/outbox-event-bus';
import { SessionRepository } from '../../infrastructure/persistence/typeorm/repositories/session.repository';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { BookingConfirmedSyncConsumer, BookingCancelledSyncConsumer } from '../../infrastructure/messaging/consumers/booking-sync.consumer';
import { TelemetryConsumer } from '../../infrastructure/messaging/consumers/telemetry.consumer';
import { ChargingGateway } from '../../infrastructure/realtime/charging.gateway';
import { SessionOrmEntity, TelemetryOrmEntity, ChargerStateOrmEntity, ProcessedEventOrmEntity, UserDebtReadModelOrmEntity, BookingReadModelOrmEntity } from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import { OutboxOrmEntity, ChargerReadModelOrmEntity, ConnectorReadModelOrmEntity, QueueOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities'; // Shared outbox
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BookingModule } from '../booking/booking.module';

@Module({
  imports: [
    BookingModule,
    TypeOrmModule.forFeature([
      SessionOrmEntity, TelemetryOrmEntity, ChargerStateOrmEntity,
      ProcessedEventOrmEntity, UserDebtReadModelOrmEntity, BookingReadModelOrmEntity,
      OutboxOrmEntity, ChargerReadModelOrmEntity, ConnectorReadModelOrmEntity, QueueOrmEntity
    ]),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        exchanges: [
          { name: 'ev.charging', type: 'topic', options: { durable: true } },
          { name: 'ev.charging.dlx', type: 'topic', options: { durable: true } },
          // Telemetry exchange: published by telemetry-ingestion-service
          { name: 'ev.telemetry', type: 'topic', options: { durable: true } },
        ],
        uri: cfg.get('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        connectionInitOptions: { wait: false },
      }),
      inject: [ConfigService],
    })
  ],
  controllers: [SessionController],
  providers: [
    StartSessionUseCase, StopSessionUseCase, RecordTelemetryUseCase, GetSessionUseCase,
    // Legacy consumers preserved
    BookingConfirmedConsumer, PaymentCompletedConsumer,
    AutoChargeUseCase, IdleFeeDetectionJob,
    LateDeliveryReconciler, StoppedSessionBillingJob, ReconciliationJob, FaultDetectionService,
    ChargerReservationJob,     // lock charger 10 min before booking
    QueueCleanupJob,           // activate app queue after 3-min physical wait
    ForceStopJob,              // force-stop walk-in sessions when booking time arrives
    { provide: SESSION_REPOSITORY, useClass: SessionRepository },
    { provide: 'ISessionRepository', useExisting: SESSION_REPOSITORY },
    BookingConfirmedSyncConsumer, BookingCancelledSyncConsumer, TelemetryConsumer, ChargingGateway,
    { provide: EVENT_BUS, useClass: OutboxEventBus },
  ],
  exports: [StartSessionUseCase, StopSessionUseCase, GetSessionUseCase],
})
export class SessionModule {}







