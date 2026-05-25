import * as crypto from 'crypto';
import { DomainEvent } from '../events/auth.events';
import {
  UserInactiveException,
  AccountLockedException,
} from '../exceptions/auth.exceptions';
import {
  UserRegisteredEvent,
  UserDeactivatedEvent,
  PasswordChangedEvent,
  AccountLockedEvent,
  SuspiciousLoginEvent,
} from '../events/auth.events';

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum UserRole {
  ADMIN = 'admin',
  STAFF = 'staff',
  USER = 'user',
}

/**
 * User Aggregate Root — auth-service bounded context
 * Owns: identity, credentials, status, MFA, account-lock
 * Does NOT own: profile data, vehicles, preferences (user-service)
 */
export class User {
  private _status: UserStatus;
  private _passwordHash: string;
  private _emailVerified: boolean;
  private _updatedAt: Date;
  private _domainEvents: DomainEvent[] = [];

  // MFA fields
  private _mfaEnabled: boolean;
  private _mfaSecret: string | null;

  // Account lock fields
  private _failedLoginCount: number;
  private _lockedUntil: Date | null;

  readonly id: string;
  readonly email: string;
  fullName: string;
  phone: string | null;
  dateOfBirth: Date;
  readonly createdAt: Date;

  private constructor(props: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    dateOfBirth: Date;
    passwordHash: string;
    status: UserStatus;
    emailVerified: boolean;
    mfaEnabled?: boolean;
    mfaSecret?: string | null;
    failedLoginCount?: number;
    lockedUntil?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = props.id;
    this.email = props.email;
    this.fullName = props.fullName;
    this.phone = props.phone ?? null;
    this.dateOfBirth = props.dateOfBirth;
    this._passwordHash = props.passwordHash;
    this._status = props.status;
    this._emailVerified = props.emailVerified;
    this._mfaEnabled = props.mfaEnabled ?? false;
    this._mfaSecret = props.mfaSecret ?? null;
    this._failedLoginCount = props.failedLoginCount ?? 0;
    this._lockedUntil = props.lockedUntil ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  // Factory Methods

  static create(props: {
    email: string;
    fullName: string;
    phone?: string;
    dateOfBirth: Date;
    passwordHash: string;
    role?: UserRole;
  }): User {
    User.assertAgeRequirement(props.dateOfBirth);

    const user = new User({
      id: crypto.randomUUID(),
      email: props.email.toLowerCase().trim(),
      fullName: props.fullName.trim(),
      phone: props.phone?.trim() ?? null,
      dateOfBirth: props.dateOfBirth,
      passwordHash: props.passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: false,
      mfaEnabled: false,
      mfaSecret: null,
      failedLoginCount: 0,
      lockedUntil: null,
    });

    user._domainEvents.push(
      new UserRegisteredEvent(user.id, user.email, user.fullName, props.role ?? UserRole.USER),
    );
    return user;
  }

  static reconstitute(props: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    dateOfBirth: Date;
    passwordHash: string;
    status: UserStatus;
    emailVerified: boolean;
    mfaEnabled?: boolean;
    mfaSecret?: string | null;
    failedLoginCount?: number;
    lockedUntil?: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return new User(props);
  }

  // Domain Behaviors

  updateUnverifiedRegistration(props: {
    fullName: string;
    phone?: string;
    dateOfBirth: Date;
    passwordHash: string;
  }): void {
    if (this._emailVerified) {
      throw new Error("Cannot update registration data for verified user");
    }
    User.assertAgeRequirement(props.dateOfBirth);
    this.fullName = props.fullName.trim();
    this.phone = props.phone?.trim() ?? null;
    this.dateOfBirth = props.dateOfBirth;
    this._passwordHash = props.passwordHash;
    this._updatedAt = new Date();
  }

  verifyEmail(): void {
    this._emailVerified = true;
    this._updatedAt = new Date();
  }

  deactivate(): void {
    if (this._status === UserStatus.INACTIVE) return;
    this._status = UserStatus.INACTIVE;
    this._updatedAt = new Date();
    this._domainEvents.push(new UserDeactivatedEvent(this.id));
  }

  suspend(): void {
    this._status = UserStatus.SUSPENDED;
    this._updatedAt = new Date();
  }

  reactivate(): void {
    this._status = UserStatus.ACTIVE;
    this._updatedAt = new Date();
  }

  assertIsActive(): void {
    if (this._status !== UserStatus.ACTIVE) {
      throw new UserInactiveException();
    }
  }

  assertIsNotLocked(): void {
    if (this._lockedUntil && this._lockedUntil > new Date()) {
      throw new AccountLockedException(this._lockedUntil);
    }
  }

  updatePasswordHash(newHash: string): void {
    this._passwordHash = newHash;
    this._updatedAt = new Date();
    this._domainEvents.push(new PasswordChangedEvent(this.id));
  }

  // Account Lock / Suspicious Activity

  /**
   * Records a failed login attempt; automatically locks the account if the threshold is exceeded.
   */
  incrementFailedLogin(maxAttempts = 5, lockDurationMinutes = 30): void {
    this._failedLoginCount += 1;
    this._updatedAt = new Date();

    if (this._failedLoginCount >= maxAttempts) {
      const lockUntil = new Date(Date.now() + lockDurationMinutes * 60_000);
      this._lockedUntil = lockUntil;
      this._domainEvents.push(new AccountLockedEvent(this.id, lockUntil));
    }
  }

  resetFailedLogin(): void {
    this._failedLoginCount = 0;
    this._lockedUntil = null;
    this._updatedAt = new Date();
  }

  lockAccount(durationMinutes: number): void {
    const lockUntil = new Date(Date.now() + durationMinutes * 60_000);
    this._lockedUntil = lockUntil;
    this._updatedAt = new Date();
    this._domainEvents.push(new AccountLockedEvent(this.id, lockUntil));
  }

  unlockAccount(): void {
    this._lockedUntil = null;
    this._failedLoginCount = 0;
    this._updatedAt = new Date();
  }

  flagSuspiciousActivity(reason: string, ipAddress?: string): void {
    this._domainEvents.push(new SuspiciousLoginEvent(this.id, reason, ipAddress));
  }

  // MFA

  setMfaSecret(secret: string): void {
    this._mfaSecret = secret;
    this._mfaEnabled = false;
    this._updatedAt = new Date();
  }

  enableMfa(backupCodes: string[]): void {
    if (!this._mfaSecret) {
      throw new Error('MFA secret not set');
    }
    const baseSecret = this._mfaSecret.split(':')[0];
    this._mfaEnabled = true;
    this._mfaSecret = `${baseSecret}:${backupCodes.join(',')}`;
    this._updatedAt = new Date();
  }

  disableMfa(): void {
    this._mfaEnabled = false;
    this._mfaSecret = null;
    this._updatedAt = new Date();
  }

  // Private Invariants

  private static assertAgeRequirement(dateOfBirth: Date): void {
    const minAge = 18;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - minAge);
    if (dateOfBirth > cutoff) {
      throw new Error(`User must be at least ${minAge} years old`);
    }
  }

  // Getters

  get status(): UserStatus { return this._status; }
  get passwordHash(): string { return this._passwordHash; }
  get emailVerified(): boolean { return this._emailVerified; }
  get updatedAt(): Date { return this._updatedAt; }
  get mfaEnabled(): boolean { return this._mfaEnabled; }
  get mfaSecret(): string | null { return this._mfaSecret; }
  get failedLoginCount(): number { return this._failedLoginCount; }
  get lockedUntil(): Date | null { return this._lockedUntil; }
  get domainEvents(): DomainEvent[] { return [...this._domainEvents]; }
  clearDomainEvents(): void { this._domainEvents = []; }
}
