/**
 * IAM Service - Identity and Access Management
 *
 * Responsibility:
 * - User authentication (Login, Register, MFA)
 * - Authorization (Role-based access control)
 * - Session management and token issuance
 * - User profile and identity lifecycle
 *
 * Architecture: NestJS with TypeORM (PostgreSQL)
 * Communication: REST API, RabbitMQ (Events), Redis (Cache)
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
  UserOrmEntity, SessionOrmEntity, RoleOrmEntity, PermissionOrmEntity,
  RolePermissionOrmEntity, UserRoleOrmEntity, EmailVerificationTokenOrmEntity,
  PasswordResetTokenOrmEntity, OutboxOrmEntity,
} from './infrastructure/persistence/typeorm/entities/auth.orm-entities';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/main/user.module';
import { UsersCacheOrmEntity, UserArrearsOrmEntity, UserProfileOrmEntity, UserFcmTokenOrmEntity, VehicleModelOrmEntity, VehicleOrmEntity, VehicleAuditLogOrmEntity, ProfileAuditLogOrmEntity, StaffProfileOrmEntity, AttendanceOrmEntity, SubscriptionOrmEntity, ProcessedEventOrmEntity } from './infrastructure/persistence/typeorm/entities/user.orm-entities';
import { OutboxPublisher } from './infrastructure/messaging/outbox/outbox.publisher';

@Module({
  imports: [
    PrometheusModule.register(),
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info', transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } } : undefined, autoLogging: { ignore: (req: any): boolean => Boolean(req.url?.includes('/health')) }, base: { service: 'auth-service' }, redact: ['req.headers.authorization', '*.password'] } }),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('DB_HOST', 'localhost'),
        port: parseInt(cfg.get('DB_PORT', '5434')),
        username: cfg.get('DB_USER', 'ev_user'),
        password: cfg.get('DB_PASSWORD', 'ev_secret'),
        database: cfg.get('DB_NAME', 'ev_iam_db'),
        entities: [
          UserOrmEntity, SessionOrmEntity, RoleOrmEntity, PermissionOrmEntity,
          RolePermissionOrmEntity, UserRoleOrmEntity, EmailVerificationTokenOrmEntity,
          PasswordResetTokenOrmEntity, OutboxOrmEntity,
        ],
        migrations: [__dirname + '/infrastructure/persistence/typeorm/migrations/*.js'],
        migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true' || true,
        migrationsTransactionMode: 'each',
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
        logging: cfg.get('NODE_ENV') !== 'production',
        poolSize: 15,
        connectTimeoutMS: 3000,
        extra: {
          max: 15,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
      }),
      inject: [ConfigService],
    }),
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        exchanges: [{ name: 'ev.charging', type: 'topic', options: { durable: true } }],
        uri: cfg.get('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
        prefetchCount: 10,
        connectionInitOptions: { wait: false },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    TypeOrmModule.forFeature([OutboxOrmEntity]),
  ],
  providers: [OutboxPublisher],
})
export class AppModule {}
