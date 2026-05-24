import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionController } from './session.controller';
import { StartSessionUseCase, StopSessionUseCase, RecordTelemetryUseCase, GetSessionUseCase, BookingConfirmedConsumer, PaymentCompletedConsumer } from '../../application/use-cases/session.use-cases';
import { AutoChargeUseCase } from '../../application/use-cases/autocharge.use-case';
import { IdleFeeDetectionJob, StoppedSessionBillingJob } from '../../application/use-cases/idle-fee.use-case';
import { LateDeliveryReconciler } from '../../application/use-cases/late-delivery-reconciler';
import { ReconciliationJob, FaultDetectionService, EVENT_BUS } from '../../application/use-cases/reconciliation.use-cases';
import { OutboxEventBus } from '../../infrastructure/messaging/outbox/outbox-event-bus';
import { SessionRepository } from '../../infrastructure/persistence/typeorm/repositories/session.repository';
import { SESSION_REPOSITORY } from '../../domain/repositories/session.repository.interface';
import { BookingConfirmedSyncConsumer, BookingCancelledSyncConsumer } from '../../infrastructure/messaging/consumers/booking-sync.consumer';
import { TelemetryConsumer } from '../../infrastructure/messaging/consumers/telemetry.consumer';
import { ChargingGateway } from '../../infrastructure/realtime/charging.gateway';
import { SessionOrmEntity, TelemetryOrmEntity, ChargerStateOrmEntity, ProcessedEventOrmEntity, UserDebtReadModelOrmEntity, BookingReadModelOrmEntity } from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import { OutboxOrmEntity } from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities'; // Shared outbox
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessionOrmEntity, TelemetryOrmEntity, ChargerStateOrmEntity,
      ProcessedEventOrmEntity, UserDebtReadModelOrmEntity, BookingReadModelOrmEntity,
      OutboxOrmEntity
    ]),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        exchanges: [
          { name: 'ev.charging', type: 'topic', options: { durable: true } },
          { name: 'ev.charging.dlx', type: 'topic', options: { durable: true } },
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
    { provide: SESSION_REPOSITORY, useClass: SessionRepository },
    { provide: 'ISessionRepository', useExisting: SESSION_REPOSITORY },
    BookingConfirmedSyncConsumer, BookingCancelledSyncConsumer, TelemetryConsumer, ChargingGateway,
    { provide: EVENT_BUS, useClass: OutboxEventBus },
  ],
  exports: [StartSessionUseCase, StopSessionUseCase, GetSessionUseCase],
})
export class SessionModule {}







