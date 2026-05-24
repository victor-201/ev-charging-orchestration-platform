import { UserProfile } from '../entities/user-profile.aggregate';

export interface IUserProfileRepository {
  findByUserId(userId: string): Promise<UserProfile | null>;
  save(profile: UserProfile): Promise<void>;
  upsert(profile: UserProfile): Promise<void>;
}
export const USER_PROFILE_REPOSITORY = Symbol('USER_PROFILE_REPOSITORY');

export interface UserCacheRecord {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  roleName: string;
  status: string;
  emailVerified: boolean;
  hasOutstandingDebt?: boolean;
  arrearsAmount?: number;
  syncedAt: Date;
}

export interface IUsersCacheRepository {
  findByUserId(userId: string): Promise<UserCacheRecord | null>;
  upsert(record: UserCacheRecord): Promise<void>;
}
export const USERS_CACHE_REPOSITORY = Symbol('USERS_CACHE_REPOSITORY');
