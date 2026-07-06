/**
 * Billing Service - Financial Transactions and Invoicing
 *
 * Responsibility:
 * - Wallet management (Balance, Top-up)
 * - Transaction processing and ledgering
 * - Invoice generation for charging sessions
 * - Subscription and plan management
 *
 * Architecture: NestJS with TypeORM (PostgreSQL)
 * Communication: REST API, RabbitMQ (Events), Redis (Caching)
 */
import { LoggerModule } from 'nestjs-pino';
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
// @ts-ignore from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import {
  WalletOrmEntity, TransactionOrmEntity, WalletLedgerOrmEntity,
  InvoiceOrmEntity, ProcessedEventOrmEntity, OutboxOrmEntity,
  UserReadModelOrmEntity, SubscriptionOrmEntity, PlanOrmEntity,
} from './infrastructure/persistence/typeorm/entities/payment.orm-entities';
import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    PrometheusModule.register(),
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info', transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } } : undefined, autoLogging: { ignore: (req: any): boolean => Boolean(req.url?.includes('/health')) }, base: { service: 'payment-service' }, redact: ['req.headers.authorization', '*.password'] } }),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host:     cfg.get('DB_HOST',     'localhost'),
        port:     parseInt(cfg.get('DB_PORT',     '5437')),
        username: cfg.get('DB_USER',     'ev_user'),
        password: cfg.get('DB_PASSWORD', 'ev_secret'),
        database: cfg.get('DB_NAME',     'ev_billing_db'),
        entities: [
          WalletOrmEntity, TransactionOrmEntity, WalletLedgerOrmEntity,
          InvoiceOrmEntity, ProcessedEventOrmEntity, OutboxOrmEntity,
          UserReadModelOrmEntity, SubscriptionOrmEntity, PlanOrmEntity,
        ],
        migrations: [__dirname + '/infrastructure/persistence/typeorm/migrations/*.js'],
        migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true' || false,
        migrationsTableName: 'typeorm_migrations',
        synchronize: true,
        logging:     cfg.get('NODE_ENV') !== 'production',
        poolSize:    20,
        connectTimeoutMS: 15000,
      }),
      inject: [ConfigService],
    }),

    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        exchanges: [
          { name: 'ev.charging', type: 'topic', options: { durable: true } },
            { name: 'ev.charging.dlx', type: 'topic', options: { durable: true } },
            { name: 'ev.dlq', type: 'topic', options: { durable: true } },
        ],
        uri: cfg.get('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        prefetchCount: parseInt(cfg.get('RABBITMQ_PREFETCH', '10')),
        connectionInitOptions: { wait: false },
      }),
      inject: [ConfigService],
    }),

    PaymentModule,
  ],
})
export class AppModule {}





