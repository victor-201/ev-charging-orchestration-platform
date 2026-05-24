import {
  Controller, Get, Patch, Post, Delete, Body, Param, HttpCode, HttpStatus,
  UseGuards, NotFoundException, BadRequestException, ParseUUIDPipe, Query, Header,
} from '@nestjs/common';
import {
  GetMyProfileUseCase, UpdateMyProfileUseCase,
  GetVehiclesUseCase, AddVehicleUseCase, UpdateVehicleUseCase,
  DeleteVehicleUseCase, SetPrimaryVehicleUseCase,
  SoftDeleteUserUseCase, GetProfileAuditLogUseCase, GetVehicleAuditLogUseCase,
  SetupAutochargeUseCase,
} from '../../application/use-cases/user.use-cases';
import { UpdateProfileDto } from '../../application/dtos/profile.dto';
import { AddVehicleDto, UpdateVehicleDto, AutoChargeSetupDto } from '../../application/dtos/vehicle.dto';
import {
  UserProfileNotFoundException, VehicleNotFoundException,
  DuplicatePlateNumberException, MaxVehiclesExceededException,
  VehicleOwnershipException, DomainException,
} from '../../domain/exceptions/user.exceptions';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard }   from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../shared/guards/jwt-auth.guard';

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
  ) {}


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
    });
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
      throw e;
    }
  }
}
