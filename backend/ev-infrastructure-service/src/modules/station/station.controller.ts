import {
  Controller, Get, Post, Patch, Body, Param, Query,
  HttpCode, HttpStatus, NotFoundException, BadRequestException,
  ConflictException, UnprocessableEntityException,
  UseGuards, Delete,
  ParseUUIDPipe, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateStationUseCase, UpdateStationUseCase, GetStationUseCase,
  ListStationsUseCase, GetNearbyStationsUseCase,
  AddChargerUseCase, UpdateChargerStatusUseCase,
  GetChargersUseCase, GetCitiesUseCase,
  GetStationByChargerUseCase, DeleteStationUseCase,
} from '../../application/use-cases/station.use-cases';
import {
  GetPricingUseCase, CalculateSessionFeeUseCase,
  UpsertPricingRuleUseCase, DeactivatePricingRuleUseCase,
  ListPricingRulesUseCase
} from '../../application/use-cases/pricing.use-case';
import {
  CreateStationDto, UpdateStationDto, ListStationsQueryDto,
  ListIncidentsQueryDto, ListMaintenanceQueryDto
} from '../../application/dtos/station.dto';
import {
  AddChargerDto, UpdateChargerStatusDto
} from '../../application/dtos/charger.dto';
import {
  StationNotFoundException, ChargerNotFoundException, CityNotFoundException,
  DuplicateGeoLocationException, DuplicateExternalIdException,
  InvalidStationDataException, InvalidChargerDataException,
  InvalidStatusTransitionException,
} from '../../domain/exceptions/station.exceptions';
import { JwtAuthGuard }             from '../../shared/guards/jwt-auth.guard';
import { RolesGuard }               from '../../shared/guards/roles.guard';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles, Public } from '../../shared/decorators/roles.decorator';
import type { AuthenticatedUser }   from '../../shared/guards/jwt-auth.guard';
import {
  IncidentOrmEntity,
  MaintenanceOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/station.orm-entities';
import { StationStatus } from '../../domain/entities/station.aggregate';

/**
 * StationController — Auth policy:
 *
 *   GET  /stations            → @Public  (Accessible to everyone)
 *   GET  /stations/nearby     → @Public
 *   GET  /stations/cities     → @Public
 *   GET  /stations/:id        → @Public
 *   GET  /:id/chargers        → @Public
 *
 *   POST /stations            → @Roles('admin')          (Admin only: station creation)
 *   PATCH /stations/:id       → @Roles('admin')          (Admin only: station modification)
 *   POST /:id/chargers        → @Roles('admin', 'staff') (Admin/Staff: add charger)
 *   PATCH /:id/chargers/status → @Roles('admin','staff') (Admin/Staff: update charger status)
 */
@Controller('stations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StationController {
  constructor(
    private readonly createStation:       CreateStationUseCase,
    private readonly updateStation:       UpdateStationUseCase,
    private readonly getStation:          GetStationUseCase,
    private readonly listStations:        ListStationsUseCase,
    private readonly getNearbyStations:   GetNearbyStationsUseCase,
    private readonly addCharger:          AddChargerUseCase,
    private readonly updateChargerStatus: UpdateChargerStatusUseCase,
    private readonly getChargers:         GetChargersUseCase,
    private readonly getCities:           GetCitiesUseCase,
    private readonly getPricing:          GetPricingUseCase,
    private readonly calcSessionFee:      CalculateSessionFeeUseCase,
    private readonly upsertPricingRule:   UpsertPricingRuleUseCase,
    private readonly deactivateRule:      DeactivatePricingRuleUseCase,
    private readonly listPricingRules:    ListPricingRulesUseCase,
    private readonly getStationByCharger: GetStationByChargerUseCase,
    private readonly deleteStation:       DeleteStationUseCase,
    @InjectRepository(IncidentOrmEntity)
    private readonly incidentRepo:        Repository<IncidentOrmEntity>,
    @InjectRepository(MaintenanceOrmEntity)
    private readonly maintenanceRepo:     Repository<MaintenanceOrmEntity>,
  ) {}

  @Get()
  @Public()
  async list(
    @Query() query: ListStationsQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user) {
      const isStaff = user.role === 'staff' || user.roles?.includes('staff');
      const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

      if (isStaff && !isAdmin) {
        const allowedStations = user.stationIds || [];
        if (allowedStations.length === 0) {
          return { items: [], total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0 };
        }

        if (query.ids) {
          const requestedIds = query.ids.split(',').map((id) => id.trim()).filter(Boolean);
          const allowedRequestedIds = requestedIds.filter((id) => allowedStations.includes(id));
          if (allowedRequestedIds.length === 0) {
            return { items: [], total: 0, limit: query.limit ?? 20, offset: query.offset ?? 0 };
          }
          query.ids = allowedRequestedIds.join(',');
        } else {
          query.ids = allowedStations.join(',');
        }
      }
    }
    return this.listStations.execute(query);
  }

  @Get('nearby')
  @Public()
  async nearby(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radiusKm') radiusKm = 10,
    @Query('limit')    limit    = 20,
    @Query('status')   status?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    let allowedStations: string[] | undefined = undefined;
    if (user) {
      const isStaff = user.role === 'staff' || user.roles?.includes('staff');
      const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

      if (isStaff && !isAdmin) {
        allowedStations = user.stationIds || [];
        if (allowedStations.length === 0) {
          return [];
        }
      }
    }
    return this.handleDomainErrors(() =>
      this.getNearbyStations.execute(
        Number(lat), Number(lng), Number(radiusKm), Number(limit),
        status as StationStatus | undefined,
        allowedStations,
      ),
    );
  }

  @Get('cities')
  @Public()
  async cities() {
    return this.getCities.execute();
  }

  @Get('pricing-rules')
  @Roles('admin', 'staff')
  async listRules(
    @Query('stationId')  stationId:  string,
    @Query('activeOnly') activeOnly: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      if (!stationId || !allowedStations.includes(stationId)) {
        throw new UnauthorizedException('You do not have permission to view pricing rules for this station');
      }
    }

    return this.listPricingRules.execute(
      stationId  || undefined,
      activeOnly === 'true',
    );
  }

  @Get('incidents')
  @Roles('admin', 'staff')
  async listIncidents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListIncidentsQueryDto,
  ) {
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    const where: any = {};
    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      if (allowedStations.length === 0) {
        return { items: [], total: 0 };
      }
      if (query.stationId) {
        if (!allowedStations.includes(query.stationId)) {
          throw new UnauthorizedException('You do not have permission to view incidents for this station');
        }
        where.stationId = query.stationId;
      } else {
        where.stationId = In(allowedStations);
      }
    } else {
      if (query.stationId) where.stationId = query.stationId;
    }

    if (query.severity) where.severity = query.severity.toLowerCase();
    if (query.status) where.status = query.status.toLowerCase();

    const [items, total] = await this.incidentRepo.findAndCount({
      where,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
      order: { createdAt: 'DESC' },
    });
    return { items, total };
  }

  @Get('maintenance')
  @Roles('admin', 'staff')
  async listMaintenance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMaintenanceQueryDto,
  ) {
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    const qb = this.maintenanceRepo.createQueryBuilder('maint');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      if (allowedStations.length === 0) {
        return { items: [], total: 0 };
      }
      if (query.stationId) {
        if (!allowedStations.includes(query.stationId)) {
          throw new UnauthorizedException('You do not have permission to view maintenance schedule for this station');
        }
        qb.andWhere('maint.stationId = :stationId', { stationId: query.stationId });
      } else {
        qb.andWhere('maint.stationId IN (:...allowedStations)', { allowedStations });
      }
    } else {
      if (query.stationId) {
        qb.andWhere('maint.stationId = :stationId', { stationId: query.stationId });
      }
    }

    const now = new Date();
    if (query.status === 'SCHEDULED') {
      qb.andWhere('maint.startTime > :now', { now });
    } else if (query.status === 'IN_PROGRESS') {
      qb.andWhere('maint.startTime <= :now AND maint.endTime >= :now', { now });
    } else if (query.status === 'COMPLETED') {
      qb.andWhere('maint.endTime < :now', { now });
    }
    qb.orderBy('maint.startTime', 'DESC')
      .take(query.limit ?? 20)
      .skip(query.offset ?? 0);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  @Get('by-charger/:chargerId')
  @Public()
  async getByCharger(@Param('chargerId', ParseUUIDPipe) chargerId: string) {
    return this.handleDomainErrors(() => this.getStationByCharger.execute(chargerId));
  }

  @Get(':id')
  @Public()
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user) {
      const isStaff = user.role === 'staff' || user.roles?.includes('staff');
      const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

      if (isStaff && !isAdmin) {
        const allowedStations = user.stationIds || [];
        if (!allowedStations.includes(id)) {
          throw new UnauthorizedException('You do not have permission to view this station');
        }
      }
    }
    return this.handleDomainErrors(() => this.getStation.execute(id));
  }

  @Get(':stationId/chargers')
  @Public()
  async listChargers(
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (user) {
      const isStaff = user.role === 'staff' || user.roles?.includes('staff');
      const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

      if (isStaff && !isAdmin) {
        const allowedStations = user.stationIds || [];
        if (!allowedStations.includes(stationId)) {
          throw new UnauthorizedException('You do not have permission to view chargers for this station');
        }
      }
    }
    return this.handleDomainErrors(() => this.getChargers.execute(stationId));
  }

  /**
   * POST /api/v1/stations
   * Admin only: Creates a new charging station.
   * ownerId is verified from JWT token.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin')
  async create(
    @Body() body: CreateStationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.ownerId) body.ownerId = user.id;
    return this.handleDomainErrors(() => this.createStation.execute(body));
  }

  /**
   * PATCH /api/v1/stations/:id
   * Admin only: Updates existing station details.
   */
  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStationDto,
  ) {
    return this.handleDomainErrors(() => this.updateStation.execute(id, body));
  }

  /**
   * DELETE /api/v1/stations/:id
   * Admin only: Vô hiệu hóa trạm (soft delete)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.handleDomainErrors(() => this.deleteStation.execute(id));
  }

  /**
   * POST /api/v1/stations/:stationId/chargers
   * Admin/Staff: Adds a charger to a station.
   */
  @Post(':stationId/chargers')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin')
  async addChargerToStation(
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Body() body: AddChargerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.handleDomainErrors(() => this.addCharger.execute(stationId, body));
  }

  /**
   * PATCH /api/v1/stations/:stationId/chargers/:chargerId/status
   * Admin/Staff: Updates the operational status of a charger.
   */
  @Patch(':stationId/chargers/:chargerId/status')
  @Roles('admin', 'staff')
  async updateStatus(
    @Param('stationId', ParseUUIDPipe) stationId: string,
    @Param('chargerId', ParseUUIDPipe) chargerId: string,
    @Body() body: UpdateChargerStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      if (!allowedStations.includes(stationId)) {
        throw new UnauthorizedException('You do not have permission to update charger status at this station');
      }
    }
    return this.handleDomainErrors(() => this.updateChargerStatus.execute(chargerId, body));
  }

  /**
   * GET /api/v1/stations/:stationId/chargers/:chargerId/pricing
   * Public: Provides pricing quotes for sessions.
   *
   * Query:
   *   connectorType : string (required) — e.g., CCS, Type2
   *   startTime     : ISO string (required)
   *   endTime       : ISO string (required)
   *
   * Response: PricingQuote including estimated fees and peak hour status.
   */
  @Get(':stationId/chargers/:chargerId/pricing')
  @Public()
  async getChargerPricing(
    @Param('stationId',  ParseUUIDPipe) stationId:  string,
    @Param('chargerId',  ParseUUIDPipe) chargerId:  string,
    @Query('connectorType') connectorType: string,
    @Query('startTime')     startTimeStr:  string,
    @Query('endTime')       endTimeStr:    string,
  ) {
    if (!connectorType || !startTimeStr || !endTimeStr) {
      throw new BadRequestException('connectorType, startTime, and endTime are required');
    }
    const startTime = new Date(startTimeStr);
    const endTime   = new Date(endTimeStr);
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new BadRequestException('Invalid startTime/endTime format (must be ISO 8601)');
    }
    return this.handleDomainErrors(() =>
      this.getPricing.execute({ stationId, chargerId, connectorType, startTime, endTime }),
    );
  }

  /**
   * POST /api/v1/stations/:stationId/chargers/:chargerId/pricing/calculate-session-fee
   * Internal: Used by billing-service to calculate final session costs.
   * Computes energyFeeVnd and idleFeeVnd based on actual consumption.
   */
  @Post(':stationId/chargers/:chargerId/pricing/calculate-session-fee')
  @HttpCode(HttpStatus.OK)
  @Public()
  async calculateSessionFee(
    @Param('stationId',  ParseUUIDPipe) stationId:  string,
    @Param('chargerId',  ParseUUIDPipe) chargerId:  string,
    @Body() body: {
      connectorType: string;
      startTime:     string;   // ISO string used for TOU rule lookup
      kwhConsumed:   number;
      idleMinutes:   number;   // Minutes spent occupying the stall after full charge
    },
  ) {
    if (!body.connectorType || !body.startTime) {
      throw new BadRequestException('connectorType and startTime are required');
    }
    const startTime = new Date(body.startTime);
    if (isNaN(startTime.getTime())) throw new BadRequestException('Invalid startTime format');
    return this.calcSessionFee.execute({
      chargerId,
      stationId,
      connectorType: body.connectorType,
      startTime,
      kwhConsumed:   body.kwhConsumed  ?? 0,
      idleMinutes:   body.idleMinutes  ?? 0,
    });
  }


  /**
   * POST /api/v1/stations/pricing-rules
   * Admin: Creates or updates pricing rules (TOU tiers or idle fee changes).
   */
  @Post('pricing-rules')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin')
  async createRule(@Body() body: {
    stationId:          string;
    connectorType:      string;
    validFrom:          string;  // ISO date
    validTo?:           string;
    hourStart?:         number;
    hourEnd?:           number;
    dayMask?:           number;
    pricePerKwh:        number;
    pricePerMinute?:    number;
    idleGraceMinutes?:  number;
    idleFeePerMinute?:  number;
    label?:             string;
  }) {
    return this.upsertPricingRule.execute({
      ...body,
      validFrom: new Date(body.validFrom),
      validTo:   body.validTo ? new Date(body.validTo) : undefined,
    });
  }

  /**
   * Patch /api/v1/stations/pricing-rules/:ruleId
   * Admin: Updates existing pricing rule parameters.
   */
  @Patch('pricing-rules/:ruleId')
  @Roles('admin')
  async updateRule(
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() body: {
      stationId:          string;
      connectorType:      string;
      validFrom:          string;
      validTo?:           string;
      hourStart?:         number;
      hourEnd?:           number;
      dayMask?:           number;
      pricePerKwh:        number;
      pricePerMinute?:    number;
      idleGraceMinutes?:  number;
      idleFeePerMinute?:  number;
      label?:             string;
    },
  ) {
    return this.upsertPricingRule.execute({
      id: ruleId,
      ...body,
      validFrom: new Date(body.validFrom),
      validTo:   body.validTo ? new Date(body.validTo) : undefined,
    });
  }

  /**
   * DELETE /api/v1/stations/pricing-rules/:ruleId/deactivate
   * Admin: Deactivates a pricing rule by setting expiration to current time.
   * Soft-deactivation only to preserve audit trail.
   */
  @Patch('pricing-rules/:ruleId/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
  async deactivateRuleEndpoint(@Param('ruleId', ParseUUIDPipe) ruleId: string) {
    await this.deactivateRule.execute(ruleId);
  }


  /**
   * POST /api/v1/stations/incidents
   * Staff/User: Report a new incident.
   */
  @Post('incidents')
  @HttpCode(HttpStatus.CREATED)
  async reportIncident(
    @Body() body: {
      stationId: string;
      chargerId?: string;
      description: string;
      severity: string;
      reportedBy?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.stationId) {
      throw new BadRequestException('stationId is required');
    }
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      if (!allowedStations.includes(body.stationId)) {
        throw new UnauthorizedException('You do not have permission to report incidents at this station');
      }
    }

    const incident = this.incidentRepo.create({
      id: uuidv4(),
      stationId: body.stationId,
      pointId: body.chargerId ?? null,
      description: body.description ?? '',
      severity: body.severity ? body.severity.toLowerCase() : 'medium',
      status: 'pending_confirmation',
      reportedBy: body.reportedBy ?? user.id,
    });
    return this.incidentRepo.save(incident);
  }

  /**
   * PATCH /api/v1/stations/incidents/:id
   * Admin/Staff only: Resolve/update incident status.
   */
  @Patch('incidents/:id')
  @Roles('admin', 'staff')
  async resolveIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      status: string;
      resolutionNote?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.status) {
      throw new BadRequestException('status is required');
    }
    const incident = await this.incidentRepo.findOne({ where: { id } });
    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      if (!allowedStations.includes(incident.stationId)) {
        throw new UnauthorizedException('You do not have permission to resolve incidents at this station');
      }
    }

    incident.status = body.status.toLowerCase();
    if (incident.status === 'resolved') {
      incident.resolvedAt = new Date();
    }
    return this.incidentRepo.save(incident);
  }


  /**
   * POST /api/v1/stations/maintenance
   * Admin only: Schedule maintenance.
   */
  @Post('maintenance')
  @Roles('admin', 'staff')
  @HttpCode(HttpStatus.CREATED)
  async scheduleMaintenance(
    @Body() body: {
      stationId: string;
      scheduledStartTime: string;
      scheduledEndTime: string;
      reason: string;
      technicianId: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body.stationId || !body.scheduledStartTime || !body.scheduledEndTime) {
      throw new BadRequestException('stationId, scheduledStartTime, and scheduledEndTime are required');
    }
    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      if (!allowedStations.includes(body.stationId)) {
        throw new UnauthorizedException('You do not have permission to schedule maintenance for this station');
      }
    }

    const start = new Date(body.scheduledStartTime);
    const end = new Date(body.scheduledEndTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid scheduledStartTime or scheduledEndTime format');
    }
    const maint = this.maintenanceRepo.create({
      id: uuidv4(),
      stationId: body.stationId,
      startTime: start,
      endTime: end,
      reason: body.reason ?? '',
      scheduledBy: body.technicianId ?? user.id,
    });
    return this.maintenanceRepo.save(maint);
  }

  /**
   * PATCH /api/v1/stations/maintenance/:id
   * Admin/Staff: Update maintenance record (e.g., mark as completed).
   */
  @Patch('maintenance/:id')
  @Roles('admin', 'staff')
  async updateMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      status?: string;
      endTime?: string;
      reason?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const record = await this.maintenanceRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('Maintenance record not found');
    }

    const isStaff = user.role === 'staff' || user.roles?.includes('staff');
    const isAdmin = user.role === 'admin' || user.roles?.includes('admin');

    if (isStaff && !isAdmin) {
      const allowedStations = user.stationIds || [];
      if (!allowedStations.includes(record.stationId)) {
        throw new UnauthorizedException('You do not have permission to update maintenance at this station');
      }
    }

    if (body.endTime) {
      const end = new Date(body.endTime);
      if (isNaN(end.getTime())) throw new BadRequestException('Invalid endTime format');
      record.endTime = end;
    }

    if (body.reason) {
      record.reason = body.reason;
    }

    return this.maintenanceRepo.save(record);
  }

  private async handleDomainErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof StationNotFoundException || e instanceof ChargerNotFoundException || e instanceof CityNotFoundException) {
        throw new NotFoundException(e.message);
      }
      if (e instanceof DuplicateGeoLocationException || e instanceof DuplicateExternalIdException) {
        throw new ConflictException(e.message);
      }
      if (e instanceof InvalidStationDataException || e instanceof InvalidChargerDataException || e instanceof InvalidStatusTransitionException) {
        throw new UnprocessableEntityException(e.message);
      }
      throw e;
    }
  }
}
