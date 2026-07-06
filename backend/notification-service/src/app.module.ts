/**
 * Notification Service - User Communication and Messaging
 *
 * Responsibility:
 * - Real-time push notifications (Firebase Cloud Messaging)
 * - WebSocket gateway for in-app live updates
 * - Management of user notification preferences and devices
 * - Consuming events from other services to trigger alerts (Auth, Booking, Charging, Billing)
 *
 * Architecture: NestJS with TypeORM (PostgreSQL)
 * Communication: REST API, RabbitMQ (Consumers), Socket.io (Real-time), FCM (External)
 */
import { LoggerModule } from 'nestjs-pino';
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

// ORM Entities
import {
  NotificationOrmEntity,
  DeviceOrmEntity,
  NotificationPreferenceOrmEntity,
  ProcessedEventOrmEntity,
} from './infrastructure/persistence/typeorm/entities/notification.orm-entities';

// Domain Services
import { DeliveryEngine } from './domain/services/delivery.engine';

// Infrastructure Services
import { FcmPushService }      from './infrastructure/push/fcm-push.service';
import { FirebaseModule }      from './infrastructure/push/firebase.module';
import { NotificationGateway } from './infrastructure/realtime/notification.gateway';

// Event Consumers
import {
  BookingNotificationConsumer,
  PaymentNotificationConsumer,
  ChargingNotificationConsumer,
  QueueNotificationConsumer,
  BookingLifecycleExtendedConsumer,
  FaultNotificationConsumer,
  BillingNotificationConsumer,
  WalletArrearsNotificationConsumer,
  ChargerQueueReadyNotificationConsumer,
  AuthNotificationConsumer,
  SessionTelemetryPushConsumer,
} from './infrastructure/messaging/consumers/notification.consumers';

// Application Use Cases
import {
  GetNotificationsUseCase,
  DeviceManagementUseCase,
  NotificationPreferenceUseCase,
} from './application/use-cases/notification.use-cases';

// Controllers
import {
  NotificationController,
  DeviceController,
  PreferenceController,
} from './modules/main/notification.controller';
import { FcmTestController } from './modules/main/fcm-test.controller';
// Guards
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { RolesGuard }   from './shared/guards/roles.guard';

const ALL_ENTITIES = [
  NotificationOrmEntity,
  DeviceOrmEntity,
  NotificationPreferenceOrmEntity,
  ProcessedEventOrmEntity,
];

@Module({
  imports: [
    PrometheusModule.register(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
          : undefined,
        autoLogging: { ignore: (req: any): boolean => Boolean(req.url?.includes('/health')) },
        base: { service: 'notification-service' },
        redact: ['req.headers.authorization', '*.password'],
      },
    }),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    FirebaseModule,

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        type:     'postgres',
        host:     cfg.get('DB_HOST',     'localhost'),
        port:     parseInt(cfg.get('DB_PORT', '5438')),
        username: cfg.get('DB_USER',     'ev_user'),
        password: cfg.get('DB_PASSWORD', 'ev_secret'),
        database: cfg.get('DB_NAME',     'ev_notification_db'),
        entities:    ALL_ENTITIES,
        migrations: [__dirname + '/infrastructure/persistence/typeorm/migrations/*.js'],
        migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true' || false,
        migrationsTableName: 'typeorm_migrations',
        synchronize: true,
        logging:     cfg.get('NODE_ENV') !== 'production',
        poolSize:    10,
        connectTimeoutMS: 15000,
        extra: {
          ssl: { rejectUnauthorized: false },
        },
      }),
      inject: [ConfigService],
    }),

    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        exchanges: [
          { name: 'ev.charging',     type: 'topic',  options: { durable: true } },
          { name: 'ev.charging.dlx', type: 'topic', options: { durable: true } },
        ],
        uri:          cfg.get('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        prefetchCount: parseInt(cfg.get('RABBITMQ_PREFETCH', '10')),
        connectionInitOptions: { wait: false },
      }),
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],

  controllers: [
    NotificationController,
    DeviceController,
    PreferenceController,
    FcmTestController,
  ],

  providers: [
    // ── Infrastructure ────────────────────────────────────────────────────────
    NotificationGateway,
    FcmPushService,

    // ── Domain Services ───────────────────────────────────────────────────────
    DeliveryEngine,

    // ── Application Use Cases ─────────────────────────────────────────────────
    GetNotificationsUseCase,
    DeviceManagementUseCase,
    NotificationPreferenceUseCase,

    // ── Event Consumers ───────────────────────────────────────────────────────
    BookingNotificationConsumer,
    PaymentNotificationConsumer,
    ChargingNotificationConsumer,
    QueueNotificationConsumer,
    BookingLifecycleExtendedConsumer,
    FaultNotificationConsumer,
    BillingNotificationConsumer,   // ← Idle Fee / Extra Charge / Refund notifications
    WalletArrearsNotificationConsumer,  // ← Debt created / cleared notifications
    ChargerQueueReadyNotificationConsumer,  // ← Queue your-turn notification
    AuthNotificationConsumer,
    SessionTelemetryPushConsumer,

    // ── Guards ────────────────────────────────────────────────────────────────
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AppModule {}
