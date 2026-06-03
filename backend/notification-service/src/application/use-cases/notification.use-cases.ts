import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import {
  NotificationOrmEntity,
  DeviceOrmEntity,
  NotificationPreferenceOrmEntity,
  ProcessedEventOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/notification.orm-entities';
import { Device, DevicePlatform } from '../../domain/entities/notification.aggregate';

// Re-exports for AppModule
export { NotificationOrmEntity, ProcessedEventOrmEntity, DeviceOrmEntity, NotificationPreferenceOrmEntity };



/**
 * GET /notifications?limit=&unreadOnly=true
 * GET /notifications/unread
 */
@Injectable()
export class GetNotificationsUseCase {
  constructor(
    @InjectRepository(NotificationOrmEntity)
    private readonly repo: Repository<NotificationOrmEntity>,
  ) {}

  async execute(userId: string, limit = 20, offset = 0, unreadOnly = false): Promise<{
    items:       NotificationOrmEntity[];
    total:       number;
    unreadCount: number;
  }> {
    const qb = this.repo.createQueryBuilder('n')
      .where('n.user_id = :uid', { uid: userId })
      .orderBy('n.created_at', 'DESC')
      .take(limit)
      .skip(offset);

    if (unreadOnly) qb.andWhere('n.read_at IS NULL');

    const countQb = this.repo.createQueryBuilder('n')
      .where('n.user_id = :uid', { uid: userId });

    if (unreadOnly) countQb.andWhere('n.read_at IS NULL');

    const [items, total, unreadCount] = await Promise.all([
      qb.getMany(),
      countQb.getCount(),
      this.repo.createQueryBuilder('n')
        .where('n.user_id = :uid AND n.read_at IS NULL', { uid: userId })
        .getCount(),
    ]);

    return { items, total, unreadCount };
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    const notif = await this.repo.findOneBy({ id: notificationId, userId });
    if (!notif) throw new NotFoundException('Notification not found');
    await this.repo.update({ id: notificationId, userId }, { readAt: new Date(), status: 'read' });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.repo
      .createQueryBuilder()
      .update(NotificationOrmEntity)
      .set({ readAt: new Date(), status: 'read' })
      .where('user_id = :uid AND read_at IS NULL', { uid: userId })
      .execute();
    return { updated: result.affected ?? 0 };
  }
}



/**
 * POST /devices/register
 * DELETE /devices/:id
 * GET /devices (list user devices)
 */
@Injectable()
export class DeviceManagementUseCase {
  private readonly logger = new Logger(DeviceManagementUseCase.name);

  constructor(
    @InjectRepository(DeviceOrmEntity)
    private readonly repo: Repository<DeviceOrmEntity>,
  ) {}

  /**
   * Registers a new device or updates the token if it already exists.
   * Upsert by pushToken: if token exists -> update userId/lastActiveAt.
   */
  async register(params: {
    userId:     string;
    platform:   DevicePlatform;
    pushToken:  string;
    deviceName?: string;
  }): Promise<DeviceOrmEntity> {
    // Upsert by pushToken: token rotation (old token -> new token)
    const existing = await this.repo.findOneBy({ pushToken: params.pushToken });

    if (existing) {
      // Token already registered: update userId and refresh
      await this.repo.update(
        { pushToken: params.pushToken },
        { userId: params.userId, lastActiveAt: new Date(), deviceName: params.deviceName ?? existing.deviceName },
      );
      const updated = await this.repo.findOneBy({ pushToken: params.pushToken });
      this.logger.log(`Device re-registered: token=...${params.pushToken.slice(-8)} user=${params.userId}`);
      return updated!;
    }

    // New device registration — race-safe: if another request inserted this
    // token between our check and save, fall back to update.
    const device = Device.register(params);
    const row = this.repo.create({
      id:           device.id,
      userId:       device.userId,
      platform:     device.platform,
      pushToken:    device.pushToken,
      deviceName:   device.deviceName,
      lastActiveAt: device.lastActiveAt,
    });

    try {
      await this.repo.save(row);
    } catch (err: any) {
      if (err?.code === '23505') {
        // Unique violation: token was registered concurrently
        await this.repo.update(
          { pushToken: params.pushToken },
          { userId: params.userId, lastActiveAt: new Date(), deviceName: params.deviceName ?? null },
        );
        const updated = await this.repo.findOneBy({ pushToken: params.pushToken });
        this.logger.log(`Device re-registered (concurrent): token=...${params.pushToken.slice(-8)} user=${params.userId}`);
        return updated!;
      }
      throw err;
    }

    this.logger.log(`Device registered: id=${device.id} user=${params.userId} platform=${params.platform}`);
    return row;
  }

  /** Unregisters device (user logout or revoked push permission) */
  async unregister(deviceId: string, userId: string): Promise<void> {
    const device = await this.repo.findOneBy({ id: deviceId, userId });
    if (!device) throw new NotFoundException(`Device ${deviceId} not found`);
    await this.repo.delete({ id: deviceId });
    this.logger.log(`Device unregistered: id=${deviceId} user=${userId}`);
  }

  /** Lists all devices for a user */
  async listForUser(userId: string): Promise<DeviceOrmEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { lastActiveAt: 'DESC' },
    });
  }
}



/**
 * GET /preferences
 * PATCH /preferences
 */
@Injectable()
export class NotificationPreferenceUseCase {
  constructor(
    @InjectRepository(NotificationPreferenceOrmEntity)
    private readonly repo: Repository<NotificationPreferenceOrmEntity>,
  ) {}

  async getOrCreate(userId: string): Promise<NotificationPreferenceOrmEntity> {
    const existing = await this.repo.findOneBy({ userId });
    if (existing) return existing;

    // Auto-create with defaults
    const row = this.repo.create({
      userId,
      enablePush:      true,
      enableRealtime:  true,
      enableEmail:     true,
      enableSms:       false,
      quietHoursStart: null,
      quietHoursEnd:   null,
    });
    return this.repo.save(row);
  }

  async update(userId: string, update: {
    enablePush?:      boolean;
    enableRealtime?:  boolean;
    enableEmail?:     boolean;
    enableSms?:       boolean;
    quietHoursStart?: number | null;
    quietHoursEnd?:   number | null;
  }): Promise<NotificationPreferenceOrmEntity> {
    await this.repo.upsert({ userId, ...update }, ['userId']);
    return this.getOrCreate(userId);
  }

  /** Ensure push notification is enabled for user (called on device registration) */
  async ensurePushEnabled(userId: string): Promise<void> {
    await this.repo.upsert(
      { userId, enablePush: true },
      ['userId'],
    );
  }
}
