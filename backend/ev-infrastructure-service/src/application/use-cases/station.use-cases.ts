import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Station, StationStatus } from '../../domain/entities/station.aggregate';
import { Charger } from '../../domain/entities/charger.aggregate';
import {
  IStationRepository,
  StationFilter,
  PaginatedResult,
} from '../../domain/repositories/station.repository.interface';
import { IChargerRepository } from '../../domain/repositories/charger.repository.interface';
import { STATION_REPOSITORY } from '../../domain/repositories/station.repository.interface';
import { CHARGER_REPOSITORY } from '../../domain/repositories/charger.repository.interface';
import { IEventBus, EVENT_BUS } from '../../infrastructure/messaging/outbox/outbox-event-bus';
import {
  StationNotFoundException, ChargerNotFoundException, CityNotFoundException,
  DuplicateGeoLocationException, DuplicateExternalIdException,
} from '../../domain/exceptions/station.exceptions';
import { CreateStationDto, UpdateStationDto, ListStationsQueryDto } from '../dtos/station.dto';
import { AddChargerDto, UpdateChargerStatusDto } from '../dtos/charger.dto';
import { RedisAvailabilityCache } from '../../infrastructure/cache/redis-availability.cache';
import { ConnectorOrmEntity } from '../../infrastructure/persistence/typeorm/entities/station.orm-entities';




export interface StationResponse {
  id: string;
  name: string;
  address: string | null;
  cityId: string;
  latitude: number;
  longitude: number;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  totalChargers: number;
  availableChargers: number;
  chargers?: ChargerResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StationDetailResponse extends StationResponse {
  chargers: ChargerResponse[];
}

export interface ChargerResponse {
  id: string;
  stationId: string;
  name: string;
  externalId: string | null;
  maxPowerKw: number;
  status: string;
  connectors: { id: string; connectorType: string; maxPowerKw: number | null }[];
  updatedAt: Date;
}



function toStationResponse(s: Station): StationResponse {
  return {
    id:                s.id,
    name:              s.name,
    address:           s.address,
    cityId:            s.cityId,
    latitude:          s.latitude,
    longitude:         s.longitude,
    status:            s.status,
    ownerId:           s.ownerId,
    ownerName:         s.ownerName,
    totalChargers:     s.getTotalChargerCount(),
    availableChargers: s.getAvailableChargerCount(),
    chargers:          s.getChargers().map(toChargerResponse),
    createdAt:         s.createdAt,
    updatedAt:         s.updatedAt,
  };
}

function toChargerResponse(c: Charger): ChargerResponse {
  return {
    id:          c.id,
    stationId:   c.stationId,
    name:        c.name,
    externalId:  c.externalId,
    maxPowerKw:  c.maxPowerKw,
    status:      c.status,
    connectors:  c.connectors.map((cn) => ({
      id:            cn.id,
      connectorType: cn.connectorType,
      maxPowerKw:    cn.maxPowerKw,
    })),
    updatedAt: c.updatedAt,
  };
}



@Injectable()
export class CreateStationUseCase {
  constructor(
    @Inject(STATION_REPOSITORY)  private readonly stationRepo: IStationRepository,
    @Inject(EVENT_BUS)           private readonly eventBus: IEventBus,
    private readonly dataSource: DataSource,
  ) {}

  async execute(dto: CreateStationDto): Promise<StationResponse> {
    // Validate city exists
    const city = await this.stationRepo.findCityById(dto.cityId);
    if (!city) throw new CityNotFoundException(dto.cityId);

    // Check duplicate geo (unique constraint on lat/lng)
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      const exists = await this.stationRepo.existsByGeo(dto.latitude, dto.longitude);
      if (exists) throw new DuplicateGeoLocationException(dto.latitude, dto.longitude);
    }

    const station = Station.create({
      name:      dto.name,
      address:   dto.address,
      cityId:    dto.cityId,
      latitude:  dto.latitude,
      longitude: dto.longitude,
      ownerId:   dto.ownerId,
      ownerName: dto.ownerName,
    });

    await this.dataSource.transaction(async (manager) => {
      await this.stationRepo.save(station, manager);
      await this.eventBus.publishAll(station.domainEvents, manager);
    });

    station.clearDomainEvents();
    return toStationResponse(station);
  }
}



@Injectable()
export class UpdateStationUseCase {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    @Inject(EVENT_BUS)          private readonly eventBus: IEventBus,
    private readonly cache: RedisAvailabilityCache,
    private readonly dataSource: DataSource,
  ) {}

  async execute(stationId: string, dto: UpdateStationDto): Promise<StationResponse> {
    const station = await this.stationRepo.findById(stationId);
    if (!station) throw new StationNotFoundException(stationId);

    if (dto.name !== undefined || dto.address !== undefined) {
      station.update({ name: dto.name, address: dto.address });
    }
    if (dto.status !== undefined) {
      station.changeStatus(dto.status);
    }

    await this.dataSource.transaction(async (manager) => {
      await this.stationRepo.save(station, manager);
      await this.eventBus.publishAll(station.domainEvents, manager);
    });

    station.clearDomainEvents();

    if (dto.status !== undefined) {
      try {
        const chargers = await this.chargerRepo.findByStationId(stationId);
        for (const charger of chargers) {
          await this.cache.invalidateCharger(charger.id);
        }
        await this.cache.invalidateStation(stationId);
      } catch (err) {
        // Log cache invalidation errors, do not fail operation
      }
    }

    return toStationResponse(station);
  }
}



@Injectable()
export class DeleteStationUseCase {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    @Inject(EVENT_BUS)          private readonly eventBus: IEventBus,
    private readonly cache: RedisAvailabilityCache,
    private readonly dataSource: DataSource,
  ) {}

  async execute(stationId: string): Promise<void> {
    const station = await this.stationRepo.findById(stationId);
    if (!station) throw new StationNotFoundException(stationId);

    // Soft delete by changing status
    station.changeStatus(StationStatus.INACTIVE);

    await this.dataSource.transaction(async (manager) => {
      await this.stationRepo.save(station, manager);
      await this.eventBus.publishAll(station.domainEvents, manager);
    });

    station.clearDomainEvents();

    try {
      const chargers = await this.chargerRepo.findByStationId(stationId);
      for (const charger of chargers) {
        await this.cache.invalidateCharger(charger.id);
      }
      await this.cache.invalidateStation(stationId);
    } catch (err) {
      // Log cache invalidation errors
    }
  }
}



@Injectable()
export class GetStationUseCase {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
  ) {}

  async execute(stationId: string): Promise<StationDetailResponse> {
    const station = await this.stationRepo.findByIdWithChargers(stationId);
    if (!station) throw new StationNotFoundException(stationId);

    return {
      ...toStationResponse(station),
      chargers: station.getChargers().map(toChargerResponse),
    };
  }
}



@Injectable()
export class ListStationsUseCase {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
  ) {}

  async execute(query: ListStationsQueryDto): Promise<PaginatedResult<StationResponse>> {
    const filter: StationFilter = {
      cityId:        query.cityId,
      status:        query.status,
      nearLat:       query.lat,
      nearLng:       query.lng,
      radiusKm:      query.radiusKm,
      search:        query.search,
      connectorType: query.connectorType,
      limit:         query.limit ?? 20,
      offset:        query.offset ?? 0,
    };

    const result = await this.stationRepo.findMany(filter);
    return {
      ...result,
      items: result.items.map(toStationResponse),
    };
  }
}



@Injectable()
export class GetNearbyStationsUseCase {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
  ) {}

  async execute(lat: number, lng: number, radiusKm = 10, limit = 20, status?: StationStatus): Promise<StationResponse[]> {
    const result = await this.stationRepo.findMany({
      nearLat:  lat,
      nearLng:  lng,
      radiusKm,
      // If caller requests a specific status, honor it.
      // Otherwise exclude 'inactive' (permanently offline) — shown on request via filter only.
      ...(status
        ? { status }
        : { statusNotIn: [StationStatus.INACTIVE] }),
      limit,
      offset:   0,
    });
    return result.items.map(toStationResponse);
  }
}



@Injectable()
export class AddChargerUseCase {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    @Inject(EVENT_BUS)          private readonly eventBus: IEventBus,
    private readonly dataSource: DataSource,
  ) {}

  async execute(stationId: string, dto: AddChargerDto): Promise<ChargerResponse> {
    const station = await this.stationRepo.findById(stationId);
    if (!station) throw new StationNotFoundException(stationId);

    // Check externalId uniqueness (OCPP constraint)
    if (dto.externalId) {
      const exists = await this.chargerRepo.existsByExternalId(dto.externalId);
      if (exists) throw new DuplicateExternalIdException(dto.externalId);
    }

    const charger = Charger.create({
      stationId,
      name:        dto.name,
      externalId:  dto.externalId,
      maxPowerKw:  dto.maxPowerKw,
      connectors:  dto.connectors,
    });

    // Validate via domain aggregate
    station.addCharger(charger);

    await this.dataSource.transaction(async (manager) => {
      await this.chargerRepo.save(charger, manager);
      await this.eventBus.publishAll(charger.domainEvents, manager);
    });

    charger.clearDomainEvents();
    return toChargerResponse(charger);
  }
}



@Injectable()
export class UpdateChargerStatusUseCase {
  constructor(
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    @Inject(EVENT_BUS)          private readonly eventBus: IEventBus,
    private readonly dataSource: DataSource,
  ) {}

  async execute(chargerId: string, dto: UpdateChargerStatusDto): Promise<ChargerResponse> {
    const charger = await this.chargerRepo.findById(chargerId);
    if (!charger) throw new ChargerNotFoundException(chargerId);

    // Domain FSM validates transition
    charger.updateStatus(dto.status);

    await this.dataSource.transaction(async (manager) => {
      await this.chargerRepo.updateStatus(chargerId, dto.status, manager);
      await this.eventBus.publishAll(charger.domainEvents, manager);
    });

    charger.clearDomainEvents();
    return toChargerResponse(charger);
  }
}



@Injectable()
export class GetChargersUseCase {
  constructor(
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
  ) {}

  async execute(stationId: string): Promise<ChargerResponse[]> {
    const station = await this.stationRepo.findById(stationId);
    if (!station) throw new StationNotFoundException(stationId);

    const chargers = await this.chargerRepo.findByStationId(stationId);
    return chargers.map(toChargerResponse);
  }
}



@Injectable()
export class GetCitiesUseCase {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
  ) {}

  async execute() {
    return this.stationRepo.findAllCities();
  }
}



@Injectable()
export class GetChargerAvailabilityUseCase {
  constructor(
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    private readonly cache: RedisAvailabilityCache,
  ) {}

  async execute(chargerId: string): Promise<{ chargerId: string; status: string; fromCache: boolean }> {
    const cached = await this.cache.getChargerStatus(chargerId);
    if (cached) {
      return { chargerId, status: cached.status, fromCache: true };
    }

    const charger = await this.chargerRepo.findById(chargerId);
    if (!charger) throw new ChargerNotFoundException(chargerId);

    // Warm cache
    await this.cache.setChargerStatus(chargerId, charger.status);
    return { chargerId, status: charger.status, fromCache: false };
  }
}



@Injectable()
export class SlaMonitoringUseCase {
  private readonly logger = new Logger(SlaMonitoringUseCase.name);
  private readonly UPTIME_THRESHOLD = 0.95; // 95%

  constructor(
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
  ) {}

  /**
   * Called via @Cron — computes uptime % for each station over the last 24h.
   * Alerts if uptime < 95%
   */
  async computeDailySla(): Promise<{ stationId: string; uptimePct: number; alert: boolean }[]> {
    const stations = await this.stationRepo.findMany({ limit: 500, offset: 0 });
    const results: { stationId: string; uptimePct: number; alert: boolean }[] = [];

    for (const station of stations.items) {
      const chargers = await this.chargerRepo.findByStationId(station.id);
      const totalChargers = chargers.length;
      if (totalChargers === 0) continue;

      const availableCount = chargers.filter(c => c.status === 'available').length;
      const uptimePct = availableCount / totalChargers;
      const alert = uptimePct < this.UPTIME_THRESHOLD;

      if (alert) {
        this.logger.warn(
          `SLA ALERT: station ${station.id} uptime ${(uptimePct * 100).toFixed(1)}% < ${this.UPTIME_THRESHOLD * 100}%`,
        );
      }

      results.push({ stationId: station.id, uptimePct, alert });
    }

    return results;
  }
}


@Injectable()
export class GetStationByChargerUseCase {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stationRepo: IStationRepository,
    @Inject(CHARGER_REPOSITORY) private readonly chargerRepo: IChargerRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(chargerId: string): Promise<StationDetailResponse> {
    let stationId: string | null = null;
    let matchedChargingPointId: string | null = null;

    // 1. Try to find if chargerId matches a connector ID in 'connectors' table
    const connector = await this.dataSource.getRepository(ConnectorOrmEntity).findOne({
      where: { id: chargerId },
      relations: ['chargingPoint'],
    });

    if (connector && connector.chargingPoint) {
      stationId = connector.chargingPoint.stationId;
      matchedChargingPointId = connector.chargingPoint.id;
    } else {
      // 2. Fallback to check if chargerId matches a charging point ID
      const charger = await this.chargerRepo.findById(chargerId);
      if (charger) {
        stationId = charger.stationId;
        matchedChargingPointId = charger.id;
      }
    }

    if (!stationId || !matchedChargingPointId) {
      throw new ChargerNotFoundException(chargerId);
    }

    const station = await this.stationRepo.findByIdWithChargers(stationId);
    if (!station) throw new StationNotFoundException(stationId);

    // Filter chargers to only include the single matched charging point (Trụ sạc)
    const allChargers = station.getChargers();
    const matchedCharger = allChargers.find((c) => c.id === matchedChargingPointId);

    let chargersResponse: ChargerResponse[] = [];
    if (matchedCharger) {
      const chargerRes = toChargerResponse(matchedCharger);
      // Optional: Filter connectors of this charging point to only include the booked connector
      if (connector) {
        chargerRes.connectors = chargerRes.connectors.filter((cn) => cn.id === chargerId);
      }
      chargersResponse = [chargerRes];
    }

    return {
      ...toStationResponse(station),
      chargers: chargersResponse,
    };
  }
}

