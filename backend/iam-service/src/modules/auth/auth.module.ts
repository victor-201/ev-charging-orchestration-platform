import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  UserOrmEntity, SessionOrmEntity, RoleOrmEntity, PermissionOrmEntity,
  RolePermissionOrmEntity, UserRoleOrmEntity, EmailVerificationTokenOrmEntity,
  PasswordResetTokenOrmEntity, OutboxOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/auth.orm-entities';
import { UsersCacheOrmEntity } from '../../infrastructure/persistence/typeorm/entities/user.orm-entities';
import { UserRepository } from '../../infrastructure/persistence/typeorm/repositories/user.repository';
import { SessionRepository } from '../../infrastructure/persistence/typeorm/repositories/session.repository';
import { RoleRepository } from '../../infrastructure/persistence/typeorm/repositories/role.repository';
import { EmailVerificationRepository } from '../../infrastructure/persistence/typeorm/repositories/email-verification.repository';
import { OutboxEventBus, EVENT_BUS } from '../../infrastructure/messaging/outbox/outbox-event-bus';
import {
  RegisterUseCase, LoginUseCase, RefreshTokenUseCase, LogoutUseCase,
  ChangePasswordUseCase, AssignRoleUseCase, RevokeRoleUseCase,
  GetUserSessionsUseCase, SetupMfaUseCase, VerifyMfaUseCase, DisableMfaUseCase,
  VerifyEmailUseCase, ResendVerificationEmailUseCase,
} from '../../application/use-cases/auth.use-cases';
import { AuthController } from './auth.controller';
import {
  USER_REPOSITORY, SESSION_REPOSITORY, ROLE_REPOSITORY,
  EMAIL_VERIFICATION_REPOSITORY,
} from '../../domain/repositories/auth.repository.interface';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RiskScoringService } from '../../domain/services/risk-scoring.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserOrmEntity, SessionOrmEntity, RoleOrmEntity, PermissionOrmEntity,
      RolePermissionOrmEntity, UserRoleOrmEntity, EmailVerificationTokenOrmEntity,
      PasswordResetTokenOrmEntity, OutboxOrmEntity,
      UsersCacheOrmEntity,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => {
        const keyPath  = cfg.get<string>('JWT_PRIVATE_KEY_PATH');
        const inlineKey = cfg.get<string>('JWT_PRIVATE_KEY');
        let privateKey: string;
        if (keyPath) {
          const fs = require('fs') as typeof import('fs');
          privateKey = fs.readFileSync(keyPath, 'utf8');
        } else if (inlineKey) {
          privateKey = inlineKey.replace(/\\n/g, '\n');
        } else {
          throw new Error('[AuthModule] JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH must be set');
        }
        return {
          privateKey,
          signOptions: {
            algorithm:  'RS256' as const,
            issuer:     cfg.get<string>('JWT_ISSUER',   'ev-iam-service'),
            audience:   cfg.get<string>('JWT_AUDIENCE', 'ev-platform'),
            expiresIn:  cfg.get<string>('JWT_EXPIRES_IN', '900s'),
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    // Repositories
    { provide: USER_REPOSITORY, useClass: UserRepository },
    { provide: SESSION_REPOSITORY, useClass: SessionRepository },
    { provide: ROLE_REPOSITORY, useClass: RoleRepository },
    { provide: EMAIL_VERIFICATION_REPOSITORY, useClass: EmailVerificationRepository },
    // Event bus
    { provide: EVENT_BUS, useClass: OutboxEventBus },
    // Guards
    JwtAuthGuard,
    RolesGuard,
    // Domain services
    RiskScoringService,
    // Redis client
    {
      provide: 'REDIS_CLIENT',
      useFactory: (cfg: ConfigService) => new Redis({
        host: cfg.get('REDIS_HOST', 'localhost'),
        port: parseInt(cfg.get('REDIS_PORT', '6379')),
        password: cfg.get('REDIS_PASSWORD', undefined),
        db: parseInt(cfg.get('REDIS_DB', '0')),
        lazyConnect: true,
      }),
      inject: [ConfigService],
    },
    RegisterUseCase, LoginUseCase, RefreshTokenUseCase, LogoutUseCase,
    ChangePasswordUseCase, AssignRoleUseCase, RevokeRoleUseCase,
    GetUserSessionsUseCase, SetupMfaUseCase, VerifyMfaUseCase, DisableMfaUseCase,
    VerifyEmailUseCase, ResendVerificationEmailUseCase,
  ],
  exports: [
    USER_REPOSITORY,
  ],
})
export class AuthModule {}
