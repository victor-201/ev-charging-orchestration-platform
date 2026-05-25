import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import {
  UsersCacheOrmEntity, UserProfileOrmEntity, VehicleOrmEntity, VehicleModelOrmEntity,
  StaffProfileOrmEntity, AttendanceOrmEntity, SubscriptionOrmEntity,
  UserFcmTokenOrmEntity, ProcessedEventOrmEntity, OutboxOrmEntity,
  VehicleAuditLogOrmEntity, ProfileAuditLogOrmEntity,
  UserArrearsOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/user.orm-entities';
import { UserProfileRepository, UsersCacheRepository } from '../../infrastructure/persistence/typeorm/repositories/user-profile.repository';
import { VehicleRepository } from '../../infrastructure/persistence/typeorm/repositories/vehicle.repository';
import { OutboxEventBus, EVENT_BUS, OutboxPublisher } from '../../infrastructure/messaging/outbox/outbox.publisher';
import {
  GetMyProfileUseCase, UpdateMyProfileUseCase, GetVehiclesUseCase,
  AddVehicleUseCase, UpdateVehicleUseCase, DeleteVehicleUseCase,
  SetPrimaryVehicleUseCase, SyncUserCacheUseCase,
  SoftDeleteUserUseCase, GetProfileAuditLogUseCase, GetVehicleAuditLogUseCase,
  SetupAutochargeUseCase,
} from '../../application/use-cases/user.use-cases';
import { UploadAvatarUseCase } from '../../application/use-cases/avatar.use-cases';
import { CloudinaryModule } from '../../infrastructure/cloudinary/cloudinary.module';
import { UserController } from './user.controller';
import { StaffController } from './staff.controller';
import {
  USER_PROFILE_REPOSITORY, USERS_CACHE_REPOSITORY,
} from '../../domain/repositories/user-profile.repository.interface';
import { VEHICLE_REPOSITORY } from '../../domain/repositories/vehicle.repository.interface';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard }   from '../../shared/guards/roles.guard';
import {
  WalletArrearsCreatedConsumer,
  WalletArrearsClearedConsumer,
} from '../../infrastructure/messaging/consumers/arrears.consumer';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CloudinaryModule,
    TypeOrmModule.forFeature([
      UsersCacheOrmEntity, UserProfileOrmEntity, VehicleOrmEntity, VehicleModelOrmEntity,
      StaffProfileOrmEntity, AttendanceOrmEntity, SubscriptionOrmEntity,
      UserFcmTokenOrmEntity, ProcessedEventOrmEntity, OutboxOrmEntity,
      VehicleAuditLogOrmEntity, ProfileAuditLogOrmEntity,
      UserArrearsOrmEntity,       // Records detailed debt entries
    ]),
  ],
  controllers: [UserController, StaffController],
  providers: [
    // Repositories
    { provide: USER_PROFILE_REPOSITORY, useClass: UserProfileRepository },
    { provide: USERS_CACHE_REPOSITORY, useClass: UsersCacheRepository },
    { provide: VEHICLE_REPOSITORY, useClass: VehicleRepository },
    // Event bus
    { provide: EVENT_BUS, useClass: OutboxEventBus },
    // Guards
    JwtAuthGuard,
    RolesGuard,
    // Use cases
    GetMyProfileUseCase, UpdateMyProfileUseCase, GetVehiclesUseCase,
    AddVehicleUseCase, UpdateVehicleUseCase, DeleteVehicleUseCase,
    SetPrimaryVehicleUseCase, SyncUserCacheUseCase,
    SoftDeleteUserUseCase, GetProfileAuditLogUseCase, GetVehicleAuditLogUseCase,
    SetupAutochargeUseCase, UploadAvatarUseCase,
    // Arrears management consumers
    WalletArrearsCreatedConsumer, // wallet.arrears.created -> sets debt flag + records arrears entry
    WalletArrearsClearedConsumer, // wallet.arrears.cleared -> clears debt flag
  ],
})
export class UserModule {}
