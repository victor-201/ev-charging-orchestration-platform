import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import { v4 as uuidv4 } from 'uuid';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { User } from '../../domain/entities/user.aggregate';
import { Session } from '../../domain/entities/session.aggregate';
import {
  IUserRepository, USER_REPOSITORY,
  ISessionRepository, SESSION_REPOSITORY,
  IRoleRepository, ROLE_REPOSITORY,
  IEmailVerificationRepository, EMAIL_VERIFICATION_REPOSITORY, EmailVerificationToken,
} from '../../domain/repositories/auth.repository.interface';
import {
  UserAlreadyExistsException,
  InvalidCredentialsException,
  TokenExpiredException,
  RoleNotFoundException,
  AccountLockedException,
  MfaRequiredException,
  InvalidMfaTokenException,
  MfaNotEnabledException,
  RateLimitExceededException,
  EmailNotVerifiedException,
} from '../../domain/exceptions/auth.exceptions';
import { IEventBus, EVENT_BUS } from '../../infrastructure/messaging/outbox/outbox-event-bus';
import { RoleAssignedEvent, RoleRevokedEvent, EmailVerifiedEvent, EmailVerificationRequestedEvent } from '../../domain/events/auth.events';
import { InvalidVerificationCodeException } from '../../domain/exceptions/auth.exceptions';
import { RiskScoringService, RiskLevel } from '../../domain/services/risk-scoring.service';
import { Redis } from 'ioredis';
import { USERS_CACHE_REPOSITORY, IUsersCacheRepository } from '../../domain/repositories/user-profile.repository.interface';



export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
  mfaRequired?: boolean;  // true if MFA step needed
  userId?: string;
}

export interface RegisterCommand {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  dateOfBirth: Date;
}

export interface LoginCommand {
  email: string;
  password: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
  mfaToken?: string;  // optional: provided when user has MFA enabled
}



@Injectable()
export class RegisterUseCase {
  private readonly logger = new Logger(RegisterUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roleRepo: IRoleRepository,
    @Inject(EMAIL_VERIFICATION_REPOSITORY) private readonly emailVerifRepo: IEmailVerificationRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly dataSource: DataSource,
  ) {}

  async execute(cmd: RegisterCommand): Promise<{ id: string; email: string; fullName: string }> {
    let user = await this.userRepo.findByEmail(cmd.email);
    const passwordHash = await bcrypt.hash(cmd.password, 12);
    let isNewUser = false;

    if (user) {
      if (user.emailVerified) {
        throw new UserAlreadyExistsException(cmd.email);
      }
      
      // User exists but not verified -> Overwrite data and generate new token
      user.updateUnverifiedRegistration({
        fullName: cmd.fullName,
        phone: cmd.phone,
        dateOfBirth: cmd.dateOfBirth,
        passwordHash,
      });
      // Delete old verification tokens
      await this.emailVerifRepo.deleteByUserId(user.id);
    } else {
      user = User.create({
        email: cmd.email,
        fullName: cmd.fullName,
        phone: cmd.phone,
        dateOfBirth: cmd.dateOfBirth,
        passwordHash,
      });
      isNewUser = true;
    }

    const defaultRole = await this.roleRepo.findByName('user');

    await this.dataSource.transaction(async (manager: EntityManager) => {
      await this.userRepo.save(user!, manager);
      await this.eventBus.publishAll(user!.domainEvents, manager);
      user!.clearDomainEvents();
    });

    if (isNewUser && defaultRole) {
      await this.roleRepo.assignRoleToUser(user.id, defaultRole.id, null);
    }

    // Create email verification token (expires in 24 hours)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const shortCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.emailVerifRepo.create(user.id, tokenHash, shortCode, expiresAt);

    this.logger.log(`Registered user: ${user.id} <${user.email}> | verif-token created`);
    
    const event = new EmailVerificationRequestedEvent(user.id, user.email, rawToken, shortCode);
    await this.eventBus.publishAll([event]);

    return { id: user.id, email: user.email, fullName: user.fullName };
  }
}



@Injectable()
export class LoginUseCase {
  private readonly logger = new Logger(LoginUseCase.name);
  private readonly RATE_LIMIT_KEY = 'auth:rate:ip:';
  private readonly MAX_ATTEMPTS_PER_IP = 10;
  private readonly RATE_WINDOW_SECONDS = 900; // 15 minutes

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    @Inject(ROLE_REPOSITORY) private readonly roleRepo: IRoleRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly riskScoring: RiskScoringService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject(EMAIL_VERIFICATION_REPOSITORY) private readonly emailVerifRepo: IEmailVerificationRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly dataSource: DataSource,
  ) {}

  async execute(cmd: LoginCommand): Promise<TokenPair> {
    if (cmd.ipAddress) {
      await this.checkIpRateLimit(cmd.ipAddress);
    }

    const user = await this.userRepo.findByEmail(cmd.email);
    if (!user) throw new InvalidCredentialsException();

    user.assertIsNotLocked();
    user.assertIsActive();

    const valid = await bcrypt.compare(cmd.password, user.passwordHash);
    if (!valid) {
      user.incrementFailedLogin(5, 30);
      await this.userRepo.save(user);
      
      if (cmd.ipAddress) {
        await this.redis.incr(`auth:fail:ip:${cmd.ipAddress}`);
        await this.redis.expire(`auth:fail:ip:${cmd.ipAddress}`, 900);
      }
      throw new InvalidCredentialsException();
    }
    
    if (!user.emailVerified) {
      this.logger.warn(`Login failed: Email not verified for ${user.email}`);
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const shortCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      await this.emailVerifRepo.deleteByUserId(user.id);
      await this.emailVerifRepo.create(user.id, tokenHash, shortCode, expiresAt);
      
      const event = new EmailVerificationRequestedEvent(user.id, user.email, rawToken, shortCode);
      await this.eventBus.publishAll([event]);
      
      throw new EmailNotVerifiedException();
    }

    const activeSessions = await this.sessionRepo.findActiveByUserId(user.id);
    const knownFingerprints = activeSessions
      .filter(s => s.deviceFingerprint)
      .map(s => s.deviceFingerprint!);

    const recentFails = cmd.ipAddress
      ? parseInt((await this.redis.get(`auth:fail:ip:${cmd.ipAddress}`)) ?? '0', 10)
      : 0;

    const risk = this.riskScoring.calculate({
      ipAddress: cmd.ipAddress,
      deviceFingerprint: cmd.deviceFingerprint,
      knownDeviceFingerprints: knownFingerprints,
      recentFailedAttempts: recentFails,
      userAgent: cmd.userAgent,
    });

    if (risk.level === RiskLevel.HIGH) {
      user.flagSuspiciousActivity(risk.reasons.join('; '), cmd.ipAddress);
      await this.userRepo.save(user);
      // Generic error to prevent account enumeration/discovery.
      throw new InvalidCredentialsException();
    }

    if (user.mfaEnabled) {
      if (!cmd.mfaToken) {
        throw new MfaRequiredException();
      }

      const mfaSecretValue = user.mfaSecret || '';
      const colonIndex = mfaSecretValue.indexOf(':');
      const secret = colonIndex !== -1 ? mfaSecretValue.substring(0, colonIndex) : mfaSecretValue;
      const backupCodesString = colonIndex !== -1 ? mfaSecretValue.substring(colonIndex + 1) : '';
      const backupCodes = backupCodesString ? backupCodesString.split(',') : [];

      let verified = false;

      // Check if provided token is a valid backup code
      const codeIndex = backupCodes.indexOf(cmd.mfaToken);
      if (codeIndex !== -1) {
        verified = true;
        // Consume the matched backup code
        backupCodes.splice(codeIndex, 1);
        user.enableMfa(backupCodes);
        await this.userRepo.save(user);
      } else {
        // Fall back to verifying via standard TOTP
        verified = speakeasy.totp.verify({
          secret,
          encoding: 'base32',
          token: cmd.mfaToken,
          window: 3, // Drift-resilient window
        });
      }

      if (!verified) {
        user.incrementFailedLogin(5, 30);
        await this.userRepo.save(user);

        if (cmd.ipAddress) {
          await this.redis.incr(`auth:fail:ip:${cmd.ipAddress}`);
          await this.redis.expire(`auth:fail:ip:${cmd.ipAddress}`, 900);
        }
        throw new InvalidMfaTokenException();
      }
    }

    user.resetFailedLogin();
    await this.userRepo.save(user);

    const roles = await this.roleRepo.findRolesByUserId(user.id);
    const roleNames = roles.map(r => r.name);

    let stationId: string | null = null;
    let stationIds: string[] = [];
    if (roleNames.includes('staff')) {
      const dbStaff = await this.dataSource.query(
        `SELECT station_id FROM staff_profiles WHERE user_id = $1 AND is_active = true`,
        [user.id]
      );
      stationIds = dbStaff.map((p: any) => p.station_id);
      stationId = stationIds[0] || null;
    }

    const expiresIn = parseInt(this.config.get('JWT_EXPIRES_IN_SECONDS', '900'));
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, roles: roleNames, stationId, stationIds },
      { expiresIn },
    );

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshTtlDays = parseInt(this.config.get('REFRESH_TOKEN_TTL_DAYS', '7'));

    const session = Session.create({
      userId: user.id,
      refreshTokenHash: tokenHash,
      deviceFingerprint: cmd.deviceFingerprint,
      ipAddress: cmd.ipAddress,
      userAgent: cmd.userAgent,
      expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
    });
    await this.sessionRepo.save(session);

    if (cmd.ipAddress) {
      await this.redis.del(`auth:fail:ip:${cmd.ipAddress}`);
    }

    this.logger.log(`Login: user=${user.id} session=${session.id} risk=${risk.level}`);
    return { accessToken, refreshToken: rawRefreshToken, expiresIn, sessionId: session.id, userId: user.id };
  }

  private async checkIpRateLimit(ip: string): Promise<void> {
    const key = `${this.RATE_LIMIT_KEY}${ip}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, this.RATE_WINDOW_SECONDS);
    }
    if (count > this.MAX_ATTEMPTS_PER_IP) {
      throw new RateLimitExceededException();
    }
  }
}



@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roleRepo: IRoleRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(rawToken: string): Promise<TokenPair> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const session = await this.sessionRepo.findByTokenHash(tokenHash);

    if (!session) throw new TokenExpiredException();
    session.assertIsUsable();

    const user = await this.userRepo.findById(session.userId);
    if (!user) throw new InvalidCredentialsException();
    user.assertIsActive();

    const roles = await this.roleRepo.findRolesByUserId(user.id);
    const roleNames = roles.map(r => r.name);

    let stationId: string | null = null;
    let stationIds: string[] = [];
    if (roleNames.includes('staff')) {
      const dbStaff = await this.dataSource.query(
        `SELECT station_id FROM staff_profiles WHERE user_id = $1 AND is_active = true`,
        [user.id]
      );
      stationIds = dbStaff.map((p: any) => p.station_id);
      stationId = stationIds[0] || null;
    }

    // Rotate session: revoke current refresh token to prevent reuse.
    await this.sessionRepo.revokeById(session.id);

    const expiresIn = parseInt(this.config.get('JWT_EXPIRES_IN_SECONDS', '900'));
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, roles: roleNames, stationId, stationIds },
      { expiresIn },
    );

    const newRaw = crypto.randomBytes(64).toString('hex');
    const newHash = crypto.createHash('sha256').update(newRaw).digest('hex');
    const refreshTtlDays = parseInt(this.config.get('REFRESH_TOKEN_TTL_DAYS', '7'));

    const newSession = Session.create({
      userId: user.id,
      refreshTokenHash: newHash,
      deviceFingerprint: session.deviceFingerprint ?? undefined,
      ipAddress: session.ipAddress ?? undefined,
      userAgent: session.userAgent ?? undefined,
      expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
    });
    await this.sessionRepo.save(newSession);

    return { accessToken, refreshToken: newRaw, expiresIn, sessionId: newSession.id };
  }
}



@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
  ) {}

  async execute(userId: string, sessionId?: string): Promise<void> {
    if (sessionId) {
      await this.sessionRepo.revokeById(sessionId);
    } else {
      await this.sessionRepo.revokeAllByUserId(userId);
    }
  }
}



@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly dataSource: DataSource,
  ) {}

  async execute(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new InvalidCredentialsException();

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new InvalidCredentialsException();

    const newHash = await bcrypt.hash(newPassword, 12);
    user.updatePasswordHash(newHash);

    await this.dataSource.transaction(async (manager: EntityManager) => {
      await this.userRepo.save(user, manager);
      await this.eventBus.publishAll(user.domainEvents, manager);
      user.clearDomainEvents();
    });

    await this.sessionRepo.revokeAllByUserId(userId);
  }
}



@Injectable()
export class AssignRoleUseCase {
  private readonly logger = new Logger(AssignRoleUseCase.name);

  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roleRepo: IRoleRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(USERS_CACHE_REPOSITORY) private readonly cacheRepo: IUsersCacheRepository,
  ) {}

  async execute(
    targetUserId: string,
    roleName: string,
    assignedByUserId: string,
    expiresAt?: Date,
  ): Promise<void> {
    const role = await this.roleRepo.findByName(roleName);
    if (!role) throw new RoleNotFoundException(roleName);

    await this.roleRepo.assignRoleToUser(targetUserId, role.id, assignedByUserId, expiresAt);

    // Sync to cache directly
    try {
      const cache = await this.cacheRepo.findByUserId(targetUserId);
      if (cache) {
        cache.roleName = roleName;
        cache.syncedAt = new Date();
        await this.cacheRepo.upsert(cache);
      }
    } catch (err) {
      this.logger.warn(`Failed to update user cache directly in AssignRoleUseCase: ${err}`);
    }

    const event = new RoleAssignedEvent(targetUserId, roleName, assignedByUserId);
    await this.eventBus.publishAll([event]);
    this.logger.log(`Role '${roleName}' assigned to user ${targetUserId} by ${assignedByUserId}`);
  }
}



@Injectable()
export class RevokeRoleUseCase {
  private readonly logger = new Logger(RevokeRoleUseCase.name);

  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roleRepo: IRoleRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(USERS_CACHE_REPOSITORY) private readonly cacheRepo: IUsersCacheRepository,
  ) {}

  async execute(targetUserId: string, roleName: string): Promise<void> {
    const role = await this.roleRepo.findByName(roleName);
    if (!role) throw new RoleNotFoundException(roleName);
    await this.roleRepo.revokeRoleFromUser(targetUserId, role.id);

    // Sync to cache directly
    try {
      const cache = await this.cacheRepo.findByUserId(targetUserId);
      if (cache) {
        const remainingRoles = await this.roleRepo.findRolesByUserId(targetUserId);
        cache.roleName = remainingRoles[0]?.name || 'user';
        cache.syncedAt = new Date();
        await this.cacheRepo.upsert(cache);
      }
    } catch (err) {
      this.logger.warn(`Failed to update user cache directly in RevokeRoleUseCase: ${err}`);
    }

    const event = new RoleRevokedEvent(targetUserId, roleName);
    await this.eventBus.publishAll([event]);
    this.logger.log(`Role '${roleName}' revoked from user ${targetUserId}`);
  }
}



@Injectable()
export class GetUserSessionsUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
  ) {}

  async execute(userId: string) {
    const sessions = await this.sessionRepo.findActiveByUserId(userId);
    return sessions.map(s => ({
      id: s.id,
      deviceFingerprint: s.deviceFingerprint,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }
}



@Injectable()
export class SetupMfaUseCase {
  private readonly logger = new Logger(SetupMfaUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
  ) {}

   /**
   * Setup TOTP MFA: generate secret, return QR code URL.
   * User must verify before MFA is activated (see VerifyMfaSetupUseCase).
   */
  async execute(userId: string): Promise<{ secret: string; otpAuthUrl: string; qrCodeUrl: string }> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new InvalidCredentialsException();

    const secret = speakeasy.generateSecret({
      name: `EV Charging (${user.email})`,
      length: 32,
    });

    // Save secret temporarily (not yet enabled — enabled only after verification)
    user.setMfaSecret(secret.base32);
    await this.userRepo.save(user);

    return {
      secret: secret.base32,
      otpAuthUrl: secret.otpauth_url ?? '',
      qrCodeUrl: `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(secret.otpauth_url ?? '')}`,
    };
  }
}

@Injectable()
export class VerifyMfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
  ) {}

  async execute(userId: string, token: string): Promise<{ verified: boolean; backupCodes: string[] }> {
    const user = await this.userRepo.findById(userId);
    if (!user || !user.mfaSecret) throw new InvalidCredentialsException();

    const rawSecret = user.mfaSecret.split(':')[0];

    const verified = speakeasy.totp.verify({
      secret: rawSecret,
      encoding: 'base32',
      token,
      window: 3, // Drift-resilient window
    });

    if (!verified) throw new InvalidMfaTokenException();

    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.floor(10000000 + Math.random() * 90000000).toString();
      backupCodes.push(code);
    }

    user.enableMfa(backupCodes);
    await this.userRepo.save(user);

    return { verified: true, backupCodes };
  }
}

@Injectable()
export class DisableMfaUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
  ) {}

  async execute(userId: string, password: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new InvalidCredentialsException();
    if (!user.mfaEnabled) throw new MfaNotEnabledException();

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new InvalidCredentialsException();

    user.disableMfa();
    await this.userRepo.save(user);
  }
}



@Injectable()
export class VerifyEmailUseCase {
  private readonly logger = new Logger(VerifyEmailUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(EMAIL_VERIFICATION_REPOSITORY)
    private readonly emailVerifRepo: IEmailVerificationRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(SESSION_REPOSITORY) private readonly sessionRepo: ISessionRepository,
    @Inject(ROLE_REPOSITORY) private readonly roleRepo: IRoleRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    input: { token: string } | { code: string },
    cmd?: { deviceFingerprint?: string; ipAddress?: string; userAgent?: string },
  ): Promise<TokenPair> {
    // Resolve record by magic-link token OR 6-digit short code
    let record: EmailVerificationToken | null = null;
    let isShortCode = false;
    if ('code' in input) {
      record = await this.emailVerifRepo.findByShortCode(input.code);
      isShortCode = true;
    } else {
      const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
      record = await this.emailVerifRepo.findByTokenHash(tokenHash);
    }

    if (!record) {
      if (isShortCode) throw new InvalidVerificationCodeException();
      throw new TokenExpiredException();
    }
    if (record.expiresAt < new Date() && !record.verifiedAt) {
      if (isShortCode) throw new InvalidVerificationCodeException();
      throw new TokenExpiredException();
    }

    const user = await this.userRepo.findById(record.userId);
    if (!user) throw new InvalidCredentialsException();

    if (!record.verifiedAt) {
      user.verifyEmail();
      await this.userRepo.save(user);
      await this.emailVerifRepo.markVerified(record.id);

      const event = new EmailVerifiedEvent(user.id, user.email);
      await this.eventBus.publishAll([event]);

      this.logger.log(`Email verified: user=${user.id} <${user.email}>`);
    }

    user.assertIsActive();
    user.resetFailedLogin();
    await this.userRepo.save(user);

    const roles = await this.roleRepo.findRolesByUserId(user.id);
    const roleNames = roles.map(r => r.name);

    let stationId: string | null = null;
    let stationIds: string[] = [];
    if (roleNames.includes('staff')) {
      const dbStaff = await this.dataSource.query(
        `SELECT station_id FROM staff_profiles WHERE user_id = $1 AND is_active = true`,
        [user.id]
      );
      stationIds = dbStaff.map((p: any) => p.station_id);
      stationId = stationIds[0] || null;
    }

    const expiresIn = parseInt(this.config.get('JWT_EXPIRES_IN_SECONDS', '900'));
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, roles: roleNames, stationId, stationIds },
      { expiresIn },
    );

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshTtlDays = parseInt(this.config.get('REFRESH_TOKEN_TTL_DAYS', '7'));

    const session = Session.create({
      userId: user.id,
      refreshTokenHash: newTokenHash,
      deviceFingerprint: cmd?.deviceFingerprint,
      ipAddress: cmd?.ipAddress,
      userAgent: cmd?.userAgent,
      expiresAt: new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
    });
    await this.sessionRepo.save(session);

    return { accessToken, refreshToken: rawRefreshToken, expiresIn, sessionId: session.id };
  }
}



@Injectable()
export class ResendVerificationEmailUseCase {
  private readonly logger = new Logger(ResendVerificationEmailUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(EMAIL_VERIFICATION_REPOSITORY)
    private readonly emailVerifRepo: IEmailVerificationRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) return; // Do not disclose if email exists

    if (user.emailVerified) return; // Already verified, skip

    // Delete old token and create new one
    await this.emailVerifRepo.deleteByUserId(user.id);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const shortCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.emailVerifRepo.create(user.id, tokenHash, shortCode, expiresAt);

    this.logger.log(`Resend verification email for user=${user.id} <${user.email}>`);
    
    const event = new EmailVerificationRequestedEvent(user.id, user.email, rawToken, shortCode);
    await this.eventBus.publishAll([event]);
  }
}
