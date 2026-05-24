import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from '../../../../domain/entities/user-profile.aggregate';
import {
  IUserProfileRepository, IUsersCacheRepository, UserCacheRecord,
} from '../../../../domain/repositories/user-profile.repository.interface';
import { UserProfileOrmEntity, UsersCacheOrmEntity } from '../entities/user.orm-entities';

// UserProfile Repository

@Injectable()
export class UserProfileRepository implements IUserProfileRepository {
  constructor(
    @InjectRepository(UserProfileOrmEntity)
    private readonly repo: Repository<UserProfileOrmEntity>,
  ) {}

  private toDomain(e: UserProfileOrmEntity): UserProfile {
    return UserProfile.reconstitute({
      userId: e.userId,
      avatarUrl: e.avatarUrl,
      address: e.address,
      updatedAt: e.updatedAt,
    });
  }

  async findByUserId(userId: string): Promise<UserProfile | null> {
    const e = await this.repo.findOne({ where: { userId } });
    return e ? this.toDomain(e) : null;
  }

  async save(profile: UserProfile): Promise<void> {
    await this.repo.update(
      { userId: profile.userId },
      { avatarUrl: profile.avatarUrl, address: profile.address },
    );
  }

  async upsert(profile: UserProfile): Promise<void> {
    await this.repo.upsert(
      {
        userId: profile.userId,
        avatarUrl: profile.avatarUrl,
        address: profile.address,
      },
      ['userId'],
    );
  }
}

// UsersCache Repository

@Injectable()
export class UsersCacheRepository implements IUsersCacheRepository {
  constructor(
    @InjectRepository(UsersCacheOrmEntity)
    private readonly repo: Repository<UsersCacheOrmEntity>,
  ) {}

  async findByUserId(userId: string): Promise<UserCacheRecord | null> {
    const e = await this.repo.findOne({ where: { userId } });
    if (!e) return null;
    return {
      userId: e.userId,
      email: e.email,
      fullName: e.fullName,
      phone: e.phone,
      roleName: e.roleName,
      status: e.status,
      emailVerified: e.emailVerified,
      hasOutstandingDebt: e.hasOutstandingDebt,
      arrearsAmount: Number(e.arrearsAmount),
      syncedAt: e.syncedAt,
    };
  }

  async upsert(record: UserCacheRecord): Promise<void> {
    const updatePayload: any = {
      userId: record.userId,
      email: record.email,
      fullName: record.fullName,
      phone: record.phone,
      roleName: record.roleName,
      status: record.status,
      emailVerified: record.emailVerified,
      syncedAt: new Date(),
    };
    if (record.hasOutstandingDebt !== undefined) {
      updatePayload.hasOutstandingDebt = record.hasOutstandingDebt;
    }
    if (record.arrearsAmount !== undefined) {
      updatePayload.arrearsAmount = record.arrearsAmount;
    }
    await this.repo.upsert(updatePayload, ['userId']);
  }
}

