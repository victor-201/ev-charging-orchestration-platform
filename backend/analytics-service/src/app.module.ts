/**
 * Analytics Service - Data Aggregation and Business Intelligence
 *
 * Responsibility:
 * - Real-time event aggregation from various microservices
 * - Generating system-wide KPIs and performance metrics
 * - Analyzing user behavior and revenue trends
 * - Materialized view management for dashboard performance
 *
 * Architecture: NestJS with TypeORM (PostgreSQL)
 * Communication: REST API, RabbitMQ (Consumers), Redis (Caching)
 */
import { LoggerModule } from 'nestjs-pino';
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
// @ts-ignore from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

// ORM Entities
import {
  EventLogOrmEntity,
  DailyStationMetricsOrmEntity,
  DailyUserMetricsOrmEntity,
  KpiSnapshotOrmEntity,
  UserBehaviorStatsOrmEntity,
  RevenueStatsOrmEntity,
  HourlyUsageStatsOrmEntity,
  BookingStatsOrmEntity,
  ProcessedEventOrmEntity,
} from './infrastructure/persistence/typeorm/entities/analytics.orm-entities';

// Domain Services
import { AggregationEngine }  from './domain/services/aggregation.engine';
import { PeakHourDetector }   from './domain/services/peak-hour-detector';

// Application Use Cases
import {
  GetStationUsageUseCase,
  GetRevenueUseCase,
  GetPeakHoursUseCase,
  GetSystemMetricsUseCase,
  GetUserBehaviorUseCase,
  KpiCaptureJob,
  DashboardUseCase,
  MaterializedViewRefreshJob,
} from './application/use-cases/analytics.use-cases';

// Consumers
import {
  SessionEventConsumer,
  PaymentEventConsumer,
  BookingEventConsumer,
  OperationalEventConsumer,
  PaymentFailureAnalyticsConsumer,
  ArrearsAnalyticsConsumer,
} from './infrastructure/messaging/consumers/analytics.consumers';

// Streaming & DW Services
import {
  StreamingAggregator,
  DataWarehouseExportJob,
} from './domain/services/streaming-aggregator.service';

// Controller
import { AnalyticsController } from './modules/main/analytics.controller';
// Guards
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { RolesGuard }   from './shared/guards/roles.guard';

const ALL_ENTITIES = [
  EventLogOrmEntity,
  DailyStationMetricsOrmEntity,
  DailyUserMetricsOrmEntity,
  KpiSnapshotOrmEntity,
  UserBehaviorStatsOrmEntity,
  RevenueStatsOrmEntity,
  HourlyUsageStatsOrmEntity,
  BookingStatsOrmEntity,
  ProcessedEventOrmEntity,
];

@Module({
  imports: [
    PrometheusModule.register(),
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info', transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } } : undefined, autoLogging: { ignore: (req: any): boolean => Boolean(req.url?.includes('/health')) }, base: { service: 'analytics-service' }, redact: ['req.headers.authorization', '*.password'] } }),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        type:     'postgres',
        host:     cfg.get('DB_HOST',     'localhost'),
        port:     parseInt(cfg.get('DB_PORT', '5440')),
        username: cfg.get('DB_USER',     'ev_user'),
        password: cfg.get('DB_PASSWORD', 'ev_secret'),
        database: cfg.get('DB_NAME',     'ev_analytics_db'),
        entities:    ALL_ENTITIES,
        migrations: [__dirname + '/infrastructure/persistence/typeorm/migrations/*.js'],
        migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true' || false,
        migrationsTableName: 'typeorm_migrations',
        synchronize: true,
        logging:     cfg.get('NODE_ENV') !== 'production',
        poolSize:    12,
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
          { name: 'ev.charging', type: 'topic', options: { durable: true } },
        ],
        uri:          cfg.get('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        prefetchCount: parseInt(cfg.get('RABBITMQ_PREFETCH', '20')),
        connectionInitOptions: { wait: false },
      }),
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],

  controllers: [AnalyticsController],

  providers: [
    // Domain Services
    AggregationEngine,
    PeakHourDetector,
    StreamingAggregator,

    // Use Cases
    GetStationUsageUseCase,
    GetRevenueUseCase,
    GetPeakHoursUseCase,
    GetSystemMetricsUseCase,
    GetUserBehaviorUseCase,
    DashboardUseCase,

    // Cron Jobs
    KpiCaptureJob,
    MaterializedViewRefreshJob,
    DataWarehouseExportJob,

    // Event Consumers
    SessionEventConsumer,
    PaymentEventConsumer,
    BookingEventConsumer,
    OperationalEventConsumer,
    PaymentFailureAnalyticsConsumer,   // track payment failure rate
    ArrearsAnalyticsConsumer,          // track bad debt rate

    // Guards
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AppModule {}



