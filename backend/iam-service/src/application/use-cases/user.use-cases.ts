import * as crypto from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { v4 as uuidv4 } from 'uuid';

import { UserProfile } from '../../domain/entities/user-profile.aggregate';
import {
  IUserProfileRepository, USER_PROFILE_REPOSITORY,
  IUsersCacheRepository, USERS_CACHE_REPOSITORY,
  UserCacheRecord,
} from '../../domain/repositories/user-profile.repository.interface';
import {
  IVehicleRepository, VEHICLE_REPOSITORY,
} from '../../domain/repositories/vehicle.repository.interface';
import { Vehicle } from '../../domain/entities/vehicle.aggregate';
import {
  UserProfileNotFoundException, VehicleNotFoundException,
  VehicleOwnershipException, DuplicatePlateNumberException,
  MaxVehiclesExceededException,
} from '../../domain/exceptions/user.exceptions';
import { IEventBus, EVENT_BUS } from '../../infrastructure/messaging/outbox/outbox.publisher';
import {
  ProcessedEventOrmEntity,
  VehicleAuditLogOrmEntity,
  ProfileAuditLogOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/user.orm-entities';

const MAX_VEHICLES_PER_USER = 10;



@Injectable()
export class GetMyProfileUseCase {
  constructor(
    @Inject(USER_PROFILE_REPOSITORY) private readonly profileRepo: IUserProfileRepository,
    @Inject(USERS_CACHE_REPOSITORY) private readonly cacheRepo: IUsersCacheRepository,
  ) {}

  async execute(userId: string) {
    const [cache, profile] = await Promise.all([
      this.cacheRepo.findByUserId(userId),
      this.profileRepo.findByUserId(userId),
    ]);

    if (!cache) throw new UserProfileNotFoundException(userId);

    return {
      userId: cache.userId,
      email: cache.email,
      fullName: cache.fullName,
      phone: cache.phone,
      role: cache.roleName,
      status: cache.status,
      emailVerified: cache.emailVerified,
      avatarUrl: profile?.avatarUrl ?? null,
      address: profile?.address ?? null,
      hasOutstandingDebt: cache.hasOutstandingDebt ?? false,
      arrearsAmount: cache.arrearsAmount ?? 0,
    };
  }
}



@Injectable()
export class UpdateMyProfileUseCase {
  constructor(
    @Inject(USER_PROFILE_REPOSITORY) private readonly profileRepo: IUserProfileRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @InjectRepository(ProfileAuditLogOrmEntity)
    private readonly profileAuditRepo: Repository<ProfileAuditLogOrmEntity>,
  ) {}

  async execute(userId: string, data: { avatarUrl?: string | null; address?: string | null }) {
    let profile = await this.profileRepo.findByUserId(userId);
    if (!profile) {
      profile = UserProfile.create(userId);
    }

    // Capture before-state for audit
    const before: Record<string, any> = {};
    if ('avatarUrl' in data) before.avatarUrl = profile.avatarUrl;
    if ('address' in data) before.address = profile.address;

    profile.update(data);

    await this.profileRepo.upsert(profile);
    await this.eventBus.publishAll(profile.domainEvents);
    profile.clearDomainEvents();

    // Write audit log
    await this.profileAuditRepo.save({
      id: uuidv4(),
      userId,
      action: 'updated',
      changes: { before, after: data },
      changedBy: userId,
    });

    return {
      userId: profile.userId,
      avatarUrl: profile.avatarUrl,
      address: profile.address,
      updatedAt: profile.updatedAt,
    };
  }
}



@Injectable()
export class SoftDeleteUserUseCase {
  private readonly logger = new Logger(SoftDeleteUserUseCase.name);

  constructor(
    @Inject(USER_PROFILE_REPOSITORY) private readonly profileRepo: IUserProfileRepository,
    @Inject(USERS_CACHE_REPOSITORY) private readonly cacheRepo: IUsersCacheRepository,
    @InjectRepository(ProfileAuditLogOrmEntity)
    private readonly profileAuditRepo: Repository<ProfileAuditLogOrmEntity>,
  ) {}

  async execute(userId: string): Promise<void> {
    // Mark user as deleted in cache
    await this.cacheRepo.upsert({
      userId,
      email: '',
      fullName: '',
      phone: null,
      roleName: 'user',
      status: 'deleted',
      emailVerified: false,
      syncedAt: new Date(),
    });

    // Audit log
    await this.profileAuditRepo.save({
      id: uuidv4(),
      userId,
      action: 'deleted',
      changes: null,
      changedBy: userId,
    });

    this.logger.log(`User soft-deleted: ${userId}`);
  }
}



@Injectable()
export class GetProfileAuditLogUseCase {
  constructor(
    @InjectRepository(ProfileAuditLogOrmEntity)
    private readonly repo: Repository<ProfileAuditLogOrmEntity>,
  ) {}

  async execute(userId: string, limit = 20) {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}



@Injectable()
export class GetVehiclesUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: IVehicleRepository,
  ) {}

  async execute(userId: string) {
    const vehicles = await this.vehicleRepo.findByOwnerId(userId);
    return vehicles.map(v => ({
      id: v.id,
      plateNumber: v.plateNumber,
      color: v.color,
      isPrimary: v.isPrimary,
      status: v.status,
      version: v.version,
      model: v.model
        ? {
            brand: v.model.brand,
            modelName: v.model.modelName,
            year: v.model.year,
            batteryCapacityKwh: v.model.batteryCapacityKwh,
            usableCapacityKwh: v.model.usableCapacityKwh,
            defaultChargePort: v.model.defaultChargePort,
            maxAcPowerKw: v.model.maxAcPowerKw,
            maxDcPowerKw: v.model.maxDcPowerKw,
          }
        : null,
      createdAt: v.createdAt,
    }));
  }
}



@Injectable()
export class AddVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: IVehicleRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @InjectRepository(VehicleAuditLogOrmEntity)
    private readonly vehicleAuditRepo: Repository<VehicleAuditLogOrmEntity>,
  ) {}

  async execute(userId: string, data: {
    brand: string;
    modelName: string;
    year: number;
    plateNumber: string;
    color?: string;
    batteryCapacityKwh?: number;
    usableCapacityKwh?: number;
    defaultChargePort?: string;
    maxAcPowerKw?: number;
    maxDcPowerKw?: number;
  }) {
    const count = await this.vehicleRepo.countActiveByOwner(userId);
    if (count >= MAX_VEHICLES_PER_USER) {
      throw new MaxVehiclesExceededException(MAX_VEHICLES_PER_USER);
    }

    const existing = await this.vehicleRepo.findByPlate(data.plateNumber);
    if (existing) throw new DuplicatePlateNumberException(data.plateNumber);

    let model = await this.vehicleRepo.findModelBySpecs(data.brand, data.modelName, data.year);
    if (!model) {
      model = await this.vehicleRepo.saveModel({
        id: crypto.randomUUID(),
        brand: data.brand,
        modelName: data.modelName,
        year: data.year,
        batteryCapacityKwh: data.batteryCapacityKwh ?? null,
        usableCapacityKwh: data.usableCapacityKwh ?? null,
        defaultChargePort: data.defaultChargePort ?? null,
        maxAcPowerKw: data.maxAcPowerKw ?? null,
        maxDcPowerKw: data.maxDcPowerKw ?? null,
      });
    }

    const isFirst = count === 0;
    if (isFirst) {
      await this.vehicleRepo.unsetPrimaryForUser(userId);
    }

    const vehicle = Vehicle.create({
      ownerId: userId,
      modelId: model.id,
      plateNumber: data.plateNumber,
      color: data.color,
      isPrimary: isFirst,
    });

    await this.vehicleRepo.save(vehicle);
    await this.eventBus.publishAll(vehicle.domainEvents);
    vehicle.clearDomainEvents();

    // Audit log
    await this.vehicleAuditRepo.save({
      id: uuidv4(),
      vehicleId: vehicle.id,
      userId,
      action: 'created',
      changes: { plateNumber: vehicle.plateNumber, color: vehicle.color, modelId: model.id },
      changedBy: userId,
    });

    return { id: vehicle.id, plateNumber: vehicle.plateNumber, model, isPrimary: vehicle.isPrimary };
  }
}



@Injectable()
export class UpdateVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: IVehicleRepository,
    @InjectRepository(VehicleAuditLogOrmEntity)
    private readonly vehicleAuditRepo: Repository<VehicleAuditLogOrmEntity>,
  ) {}

  async execute(userId: string, vehicleId: string, data: { color?: string | null }) {
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) throw new VehicleNotFoundException(vehicleId);
    vehicle.assertOwnership(userId);

    const before: Record<string, any> = {};
    if ('color' in data) {
      before.color = vehicle.color;
      vehicle.updateColor(data.color ?? null);
    }

    await this.vehicleRepo.save(vehicle);

    // Audit log
    await this.vehicleAuditRepo.save({
      id: uuidv4(),
      vehicleId,
      userId,
      action: 'updated',
      changes: { before, after: data },
      changedBy: userId,
    });

    return { id: vehicle.id, color: vehicle.color, version: vehicle.version };
  }
}



@Injectable()
export class DeleteVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: IVehicleRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @InjectRepository(VehicleAuditLogOrmEntity)
    private readonly vehicleAuditRepo: Repository<VehicleAuditLogOrmEntity>,
  ) {}

  async execute(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) throw new VehicleNotFoundException(vehicleId);
    vehicle.softDelete(userId);

    await this.vehicleRepo.save(vehicle);
    await this.eventBus.publishAll(vehicle.domainEvents);
    vehicle.clearDomainEvents();

    // Audit log
    await this.vehicleAuditRepo.save({
      id: uuidv4(),
      vehicleId,
      userId,
      action: 'deleted',
      changes: null,
      changedBy: userId,
    });
  }
}



@Injectable()
export class SetPrimaryVehicleUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: IVehicleRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @InjectRepository(VehicleAuditLogOrmEntity)
    private readonly vehicleAuditRepo: Repository<VehicleAuditLogOrmEntity>,
  ) {}

  async execute(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) throw new VehicleNotFoundException(vehicleId);
    vehicle.assertOwnership(userId);
    if (!vehicle.isActive) throw new VehicleNotFoundException(vehicleId);

    await this.vehicleRepo.unsetPrimaryForUser(userId);
    vehicle.setPrimary();

    await this.vehicleRepo.save(vehicle);
    await this.eventBus.publishAll(vehicle.domainEvents);
    vehicle.clearDomainEvents();

    // Audit log
    await this.vehicleAuditRepo.save({
      id: uuidv4(),
      vehicleId,
      userId,
      action: 'set_primary',
      changes: null,
      changedBy: userId,
    });
  }
}



@Injectable()
export class GetVehicleAuditLogUseCase {
  constructor(
    @InjectRepository(VehicleAuditLogOrmEntity)
    private readonly repo: Repository<VehicleAuditLogOrmEntity>,
  ) {}

  async execute(vehicleId: string, userId: string, limit = 20) {
    return this.repo.find({
      where: { vehicleId, userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}



@Injectable()
export class SyncUserCacheUseCase {
  private readonly logger = new Logger(SyncUserCacheUseCase.name);

  constructor(
    @Inject(USERS_CACHE_REPOSITORY) private readonly cacheRepo: IUsersCacheRepository,
    @Inject(USER_PROFILE_REPOSITORY) private readonly profileRepo: IUserProfileRepository,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
  ) {}

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'user.registered',
    queue: 'user-service.user.registered',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleUserRegistered(payload: {
    eventId: string;
    userId: string;
    email: string;
    fullName: string;
    role: string;
  }): Promise<void> {
    const processed = await this.processedRepo.findOne({ where: { eventId: payload.eventId } });
    if (processed) return;

    try {
      const record: UserCacheRecord = {
        userId: payload.userId,
        email: payload.email,
        fullName: payload.fullName,
        phone: null,
        roleName: payload.role ?? 'user',
        status: 'active',
        emailVerified: false,
        syncedAt: new Date(),
      };

      await this.cacheRepo.upsert(record);

      const profile = UserProfile.create(payload.userId);
      await this.profileRepo.upsert(profile);

      await this.processedRepo.save({
        eventId: payload.eventId,
        eventType: 'user.registered',
      });

      this.logger.log(`Synced user cache: ${payload.userId} (${payload.email})`);
    } catch (err) {
      this.logger.error(`Failed to sync user ${payload.userId}: ${err}`);
      throw err;
    }
  }

  @RabbitSubscribe({
    exchange: 'ev.charging',
    routingKey: 'user.deactivated',
    queue: 'user-service.user.deactivated',
    queueOptions: { durable: true, deadLetterExchange: 'ev.charging.dlx' },
  })
  async handleUserDeactivated(payload: { eventId: string; userId: string }): Promise<void> {
    const processed = await this.processedRepo.findOne({ where: { eventId: payload.eventId } });
    if (processed) return;

    await this.cacheRepo.upsert({
      userId: payload.userId,
      email: '',
      fullName: '',
      phone: null,
      roleName: 'user',
      status: 'inactive',
      emailVerified: false,
      syncedAt: new Date(),
    });

    await this.processedRepo.save({ eventId: payload.eventId, eventType: 'user.deactivated' });
    this.logger.log(`User deactivated in cache: ${payload.userId}`);
  }
}

@Injectable()
export class SetupAutochargeUseCase {
  constructor(
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepo: IVehicleRepository,
    @InjectRepository(VehicleAuditLogOrmEntity)
    private readonly vehicleAuditRepo: Repository<VehicleAuditLogOrmEntity>,
  ) {}

  async execute(
    userId: string,
    vehicleId: string,
    data: { macAddress?: string | null; vinNumber?: string | null; autochargeEnabled?: boolean },
  ) {
    const vehicle = await this.vehicleRepo.findById(vehicleId);
    if (!vehicle) throw new VehicleNotFoundException(vehicleId);
    vehicle.assertOwnership(userId);
    if (!vehicle.isActive) throw new VehicleNotFoundException(vehicleId);

    const before = {
      macAddress: vehicle.macAddress,
      vinNumber: vehicle.vinNumber,
      autochargeEnabled: vehicle.autochargeEnabled,
    };

    vehicle.setupAutocharge({
      macAddress: data.macAddress !== undefined ? data.macAddress : vehicle.macAddress,
      vinNumber: data.vinNumber !== undefined ? data.vinNumber : vehicle.vinNumber,
      autochargeEnabled: data.autochargeEnabled !== undefined ? data.autochargeEnabled : vehicle.autochargeEnabled,
    });

    await this.vehicleRepo.save(vehicle);

    // Audit log
    await this.vehicleAuditRepo.save({
      id: uuidv4(),
      vehicleId,
      userId,
      action: 'autocharge_setup',
      changes: { before, after: data },
      changedBy: userId,
    });

    return {
      id: vehicle.id,
      macAddress: vehicle.macAddress,
      vinNumber: vehicle.vinNumber,
      autochargeEnabled: vehicle.autochargeEnabled,
      version: vehicle.version,
    };
  }
}
