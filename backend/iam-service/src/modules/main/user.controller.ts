import {
  Controller, Get, Patch, Post, Delete, Body, Param, HttpCode, HttpStatus,
  UseGuards, NotFoundException, BadRequestException, ConflictException,
  ParseUUIDPipe, Query, Header, UseInterceptors, UploadedFile,
  UnsupportedMediaTypeException, PayloadTooLargeException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import {
  GetMyProfileUseCase, UpdateMyProfileUseCase,
  GetVehiclesUseCase, AddVehicleUseCase, UpdateVehicleUseCase,
  DeleteVehicleUseCase, SetPrimaryVehicleUseCase,
  SoftDeleteUserUseCase, GetProfileAuditLogUseCase, GetVehicleAuditLogUseCase,
  SetupAutochargeUseCase,
} from '../../application/use-cases/user.use-cases';
import { UploadAvatarUseCase } from '../../application/use-cases/avatar.use-cases';
import { UpdateProfileDto } from '../../application/dtos/profile.dto';
import { AddVehicleDto, UpdateVehicleDto, AutoChargeSetupDto } from '../../application/dtos/vehicle.dto';
import {
  UserProfileNotFoundException, VehicleNotFoundException,
  DuplicatePlateNumberException, MaxVehiclesExceededException,
  VehicleOwnershipException, DomainException,
  DuplicateMacAddressException, DuplicateVinNumberException,
} from '../../domain/exceptions/user.exceptions';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard }   from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../shared/guards/jwt-auth.guard';
import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories/auth.repository.interface';
import { IUsersCacheRepository, USERS_CACHE_REPOSITORY } from '../../domain/repositories/user-profile.repository.interface';
import { UsersCacheOrmEntity } from '../../infrastructure/persistence/typeorm/entities/user.orm-entities';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(
    private readonly getProfileUC: GetMyProfileUseCase,
    private readonly updateProfileUC: UpdateMyProfileUseCase,
    private readonly getVehiclesUC: GetVehiclesUseCase,
    private readonly addVehicleUC: AddVehicleUseCase,
    private readonly updateVehicleUC: UpdateVehicleUseCase,
    private readonly deleteVehicleUC: DeleteVehicleUseCase,
    private readonly setPrimaryUC: SetPrimaryVehicleUseCase,
    private readonly softDeleteUserUC: SoftDeleteUserUseCase,
    private readonly getProfileAuditUC: GetProfileAuditLogUseCase,
    private readonly getVehicleAuditUC: GetVehicleAuditLogUseCase,
    private readonly setupAutochargeUC: SetupAutochargeUseCase,
    private readonly uploadAvatarUC: UploadAvatarUseCase,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(USERS_CACHE_REPOSITORY) private readonly cacheRepo: IUsersCacheRepository,
    @InjectRepository(UsersCacheOrmEntity)
    private readonly usersCacheRepo: Repository<UsersCacheOrmEntity>,
  ) {}


  /**
   * Batch lookup users by comma-separated IDs — used by admin panel booking list
   * to show user names instead of raw UUIDs.
   */
  @Get()
  @Roles('admin', 'staff')
  @Header('Cache-Control', 'no-store')
  async list(
    @Query('ids') ids?: string,
    @Query('role') role?: string,
    @Query('limit') limit?: string,
  ) {
    const where: any = {};
    if (ids) {
      const idList = ids.split(',').map(s => s.trim()).filter(Boolean);
      if (idList.length > 0) {
        where.userId = In(idList);
      }
    }
    if (role) {
      where.roleName = role;
    }
    const take = limit ? Math.min(parseInt(limit), 200) : 50;
    const [items, total] = await this.usersCacheRepo.findAndCount({
      where,
      take,
      order: { fullName: 'ASC' },
    });
    return { items, total };
  }


  @Get('me')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async me(@CurrentUser() user: AuthenticatedUser) {
    try {
      return await this.getProfileUC.execute(user.id);
    } catch (e) {
      if (e instanceof UserProfileNotFoundException) throw new NotFoundException(e.message);
      throw e;
    }
  }


  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.updateProfileUC.execute(user.id, {
      avatarUrl: dto.avatarUrl,
      address: dto.address,
      phone: dto.phone,
      dateOfBirth: dto.dateOfBirth,
    });
  }


  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp|gif)$/)) {
          cb(new UnsupportedMediaTypeException('Only JPEG, PNG, WebP, and GIF images are allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    if (!file) throw new BadRequestException('File is required');
    const avatarUrl = await this.uploadAvatarUC.execute(user.id, file.buffer, file.mimetype);
    return { avatarUrl };
  }


  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(@CurrentUser() user: AuthenticatedUser) {
    await this.softDeleteUserUC.execute(user.id);
  }


  @Get('me/audit-log')
  async myProfileAuditLog(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.getProfileAuditUC.execute(user.id, limit ? parseInt(limit) : 20);
  }


  @Get('me/vehicles')
  async myVehicles(@CurrentUser() user: AuthenticatedUser) {
    return this.getVehiclesUC.execute(user.id);
  }


  @Post('me/vehicles')
  @HttpCode(HttpStatus.CREATED)
  async addMyVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddVehicleDto,
  ) {
    try {
      return await this.addVehicleUC.execute(user.id, {
        brand: dto.brand,
        modelName: dto.modelName,
        year: dto.year,
        plateNumber: dto.plateNumber,
        color: dto.color,
        batteryCapacityKwh: dto.batteryCapacityKwh,
        usableCapacityKwh: dto.usableCapacityKwh,
        defaultChargePort: dto.defaultChargePort,
        maxAcPowerKw: dto.maxAcPowerKw,
        maxDcPowerKw: dto.maxDcPowerKw,
      });
    } catch (e) {
      if (e instanceof DuplicatePlateNumberException) throw new BadRequestException(e.message);
      if (e instanceof MaxVehiclesExceededException) throw new BadRequestException(e.message);
      if (e instanceof DomainException) throw new BadRequestException(e.message);
      throw e;
    }
  }


  @Patch('me/vehicles/:id')
  async updateMyVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    try {
      return await this.updateVehicleUC.execute(user.id, vehicleId, { color: dto.color });
    } catch (e) {
      if (e instanceof VehicleNotFoundException) throw new NotFoundException(e.message);
      if (e instanceof VehicleOwnershipException) throw new NotFoundException('Vehicle not found');
      throw e;
    }
  }


  @Delete('me/vehicles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMyVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) vehicleId: string,
  ) {
    try {
      await this.deleteVehicleUC.execute(user.id, vehicleId);
    } catch (e) {
      if (e instanceof VehicleNotFoundException) throw new NotFoundException(e.message);
      if (e instanceof VehicleOwnershipException) throw new NotFoundException('Vehicle not found');
      throw e;
    }
  }


  @Patch('me/vehicles/:id/primary')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setMyPrimaryVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) vehicleId: string,
  ) {
    try {
      await this.setPrimaryUC.execute(user.id, vehicleId);
    } catch (e) {
      if (e instanceof VehicleNotFoundException) throw new NotFoundException(e.message);
      if (e instanceof VehicleOwnershipException) throw new NotFoundException('Vehicle not found');
      throw e;
    }
  }


  @Get('me/vehicles/:id/audit-log')
  async vehicleAuditLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Query('limit') limit?: string,
  ) {
    return this.getVehicleAuditUC.execute(vehicleId, user.id, limit ? parseInt(limit) : 20);
  }



  /**
   * Configures the "Plug & Charge" (AutoCharge) feature for a vehicle.
   * Requires the device MAC address and enabling the feature.
   * The OCPP Gateway utilizes the MAC address to identify the vehicle and automatically initiate sessions.
   */
  @Patch('me/vehicles/:id/autocharge-setup')
  async setupAutocharge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) vehicleId: string,
    @Body() dto: AutoChargeSetupDto,
  ) {
    try {
      return await this.setupAutochargeUC.execute(user.id, vehicleId, {
        macAddress: dto.macAddress,
        vinNumber: dto.vinNumber,
        autochargeEnabled: dto.autochargeEnabled,
      });
    } catch (e) {
      if (e instanceof VehicleNotFoundException) throw new NotFoundException(e.message);
      if (e instanceof VehicleOwnershipException) throw new BadRequestException(e.message);
      if (e instanceof DuplicateMacAddressException) throw new ConflictException(e.message);
      if (e instanceof DuplicateVinNumberException) throw new ConflictException(e.message);
      throw e;
    }
  }

  @Patch(':id/status')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
  ) {
    const user = await this.userRepo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    
    if (status === 'suspended') {
      user.suspend();
    } else if (status === 'active') {
      user.reactivate();
    } else if (status === 'inactive') {
      user.deactivate();
    } else {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    
    await this.userRepo.save(user);
    
    // Update cache
    const cache = await this.cacheRepo.findByUserId(id);
    if (cache) {
      cache.status = status;
      cache.syncedAt = new Date();
      await this.cacheRepo.upsert(cache);
    }
    
    return { id, status: user.status };
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.userRepo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    
    user.deactivate();
    await this.userRepo.save(user);
    
    await this.softDeleteUserUC.execute(id);
  }
}
