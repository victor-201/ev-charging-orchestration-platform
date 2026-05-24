import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { HttpModule } from '@nestjs/axios';
import { PricingHttpClient } from '../../infrastructure/http/pricing.http-client';
import {
  BookingOrmEntity, BookingStatusHistoryOrmEntity,
  ChargerReadModelOrmEntity, PricingSnapshotOrmEntity,
  OutboxOrmEntity, ProcessedEventOrmEntity,
  QueueOrmEntity,
  SchedulingSlotOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/booking.orm-entities';
import { UserDebtReadModelOrmEntity } from '../../infrastructure/persistence/typeorm/entities/session.orm-entities';
import { SuggestChargerUseCase } from '../../application/use-cases/suggest-charger.use-case';
import { BookingRepository } from '../../infrastructure/persistence/typeorm/repositories/booking.repository';
import { ChargerRepository } from '../../infrastructure/persistence/typeorm/repositories/charger.repository';
import { QueueRepository } from '../../infrastructure/persistence/typeorm/repositories/queue.repository';
import { OutboxEventBus } from '../../infrastructure/messaging/outbox/outbox-event-bus';
import { OutboxPublisher } from '../../infrastructure/messaging/outbox/outbox.publisher';
import { BookingGateway } from '../../infrastructure/realtime/booking.gateway';
import { CreateBookingUseCase, GetAvailabilityUseCase } from '../../application/use-cases/create-booking.use-case';
import {
  AutoConfirmBookingUseCase,
  CancelBookingUseCase,
  AutoCompleteBookingUseCase,
} from '../../application/use-cases/booking-lifecycle.use-case';
import { SystemCancelBookingUseCase } from '../../application/use-cases/system-cancel-booking.use-case';
import {
  AutoExpireBookingsJob,
  NoShowDetectionJob,
  GetQueuePositionUseCase,
} from '../../application/use-cases/booking-jobs.use-case';
import {
  JoinQueueUseCase,
  LeaveQueueUseCase,
  ProcessQueueUseCase,
} from '../../application/use-cases/queue.use-case';
import { SchedulingEngine } from '../../domain/services/scheduling-engine.service';
import { PriorityQueueService } from '../../domain/services/priority-queue.service';
import { BookingController } from './booking.controller';
import { BOOKING_REPOSITORY, CHARGER_REPOSITORY, QUEUE_REPOSITORY, EVENT_BUS } from './booking.tokens';
import { ArrearsGuard } from '../../shared/guards/arrears.guard';
import {
  BookingArrearsCreatedConsumer,
  BookingArrearsClearedConsumer,
} from '../../infrastructure/messaging/consumers/arrears-sync.consumer';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard }   from '../../shared/guards/roles.guard';
import {
  BillingDeductedConsumer, BillingDeductionFailedConsumer,  BookingPaymentCompletedConsumer,
  SessionStartedConsumer,
  BookingChargerStatusConsumer,
} from '../../infrastructure/messaging/consumers/booking.consumers';
import { StationStatusChangedConsumer } from '../../infrastructure/messaging/consumers/station-status-sync.consumer';

@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout:    5000,
      maxRedirects: 3,
    }),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        exchanges: [
          { name: 'ev.charging', type: 'topic', options: { durable: true } },
          { name: 'ev.booking',  type: 'topic', options: { durable: true } },
        ],
        uri: cfg.get('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        connectionInitOptions: { wait: false },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      BookingOrmEntity, BookingStatusHistoryOrmEntity,
      ChargerReadModelOrmEntity, PricingSnapshotOrmEntity,
      OutboxOrmEntity, ProcessedEventOrmEntity, QueueOrmEntity,
      UserDebtReadModelOrmEntity,  // ArrearsGuard read-model
      SchedulingSlotOrmEntity,
    ]),
  ],
  controllers: [BookingController],
  providers: [
    // Repository bindings
    { provide: BOOKING_REPOSITORY,  useClass: BookingRepository },
    { provide: CHARGER_REPOSITORY,  useClass: ChargerRepository },
    { provide: QUEUE_REPOSITORY,    useClass: QueueRepository },
    // Event bus (outbox pattern)
    { provide: EVENT_BUS, useClass: OutboxEventBus },
    // Infrastructure
    OutboxPublisher,
    BookingGateway,
    // Domain services
    SchedulingEngine,
    PriorityQueueService,
    // Use cases - Booking lifecycle (automated)
    CreateBookingUseCase,
    GetAvailabilityUseCase,
    SuggestChargerUseCase,
    AutoConfirmBookingUseCase,   // triggered by payment.completed
    CancelBookingUseCase,
    SystemCancelBookingUseCase,
    AutoCompleteBookingUseCase,  // triggered by session.started
    // HTTP clients
    PricingHttpClient,           // call station-service for charging price
    // Jobs
    AutoExpireBookingsJob,       // expire PENDING_PAYMENT after 5 minutes
    NoShowDetectionJob,          // no-show penalty after 10 minutes
    GetQueuePositionUseCase,
    // Queue use cases
    JoinQueueUseCase,
    LeaveQueueUseCase,
    ProcessQueueUseCase,
    // RabbitMQ consumers
    BillingDeductedConsumer, BillingDeductionFailedConsumer, BookingPaymentCompletedConsumer,   // successful payment -> auto confirm
    SessionStartedConsumer,      // session started -> auto complete
    BookingChargerStatusConsumer,       // charger available -> serve queue
    StationStatusChangedConsumer,
    // Arrears Sync Consumers (Lock Bad Debt)
    BookingArrearsCreatedConsumer,  // wallet.arrears.created -> block user
    BookingArrearsClearedConsumer,  // wallet.arrears.cleared -> unblock user
    // Guards
    JwtAuthGuard,
    RolesGuard,
    ArrearsGuard,               // block users in debt from creating new bookings
  ],
  exports: [
    CreateBookingUseCase,
    AutoConfirmBookingUseCase,
    AutoCompleteBookingUseCase,
    SystemCancelBookingUseCase,
    CHARGER_REPOSITORY,
    BOOKING_REPOSITORY,
  ],
})
export class BookingModule {}

