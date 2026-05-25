import { DomainEvent } from '../events/user.events';
import { UserProfileUpdatedEvent } from '../events/user.events';

/**
 * UserProfile Aggregate Root — user-service bounded context
 * Manages: extended profile (avatar, address) — NOT identity data.
 * Identity data (email, phone, fullName) comes from users_cache (read-only).
 */
export class UserProfile {
  private _avatarUrl: string | null;
  private _address: string | null;
  private _updatedAt: Date;
  private _domainEvents: DomainEvent[] = [];

  readonly userId: string;

  private constructor(props: {
    userId: string;
    avatarUrl: string | null;
    address: string | null;
    updatedAt?: Date;
  }) {
    this.userId = props.userId;
    this._avatarUrl = props.avatarUrl;
    this._address = props.address;
    this._updatedAt = props.updatedAt ?? new Date();
  }

  static create(userId: string): UserProfile {
    return new UserProfile({ userId, avatarUrl: null, address: null });
  }

  static reconstitute(props: {
    userId: string;
    avatarUrl: string | null;
    address: string | null;
    updatedAt: Date;
  }): UserProfile {
    return new UserProfile(props);
  }

  updateAvatar(url: string | null): void {
    this._avatarUrl = url;
    this._updatedAt = new Date();
    this._domainEvents.push(new UserProfileUpdatedEvent(this.userId, ['avatarUrl']));
  }

  updateAddress(address: string | null): void {
    this._address = address;
    this._updatedAt = new Date();
    this._domainEvents.push(new UserProfileUpdatedEvent(this.userId, ['address']));
  }

  update(fields: { avatarUrl?: string | null; address?: string | null }): void {
    const changed: string[] = [];
    if (fields.avatarUrl !== undefined) { this._avatarUrl = fields.avatarUrl; changed.push('avatarUrl'); }
    if (fields.address !== undefined) { this._address = fields.address; changed.push('address'); }
    if (changed.length > 0) {
      this._updatedAt = new Date();
      this._domainEvents.push(new UserProfileUpdatedEvent(this.userId, changed));
    }
  }

  get avatarUrl(): string | null { return this._avatarUrl; }
  get address(): string | null { return this._address; }
  get updatedAt(): Date { return this._updatedAt; }
  get domainEvents(): DomainEvent[] { return [...this._domainEvents]; }
  clearDomainEvents(): void { this._domainEvents = []; }
}
