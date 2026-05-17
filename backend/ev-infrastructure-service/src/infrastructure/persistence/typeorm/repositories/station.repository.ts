import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Station, StationStatus } from '../../../../domain/entities/station.aggregate';
import { Charger, ChargerStatus, ConnectorType } from '../../../../domain/entities/charger.aggregate';
import {
  IStationRepository,
  StationFilter,
  PaginatedResult,
  CityReadModel,
} from '../../../../domain/repositories/station.repository.interface';
import {
  StationOrmEntity,
  ChargingPointOrmEntity,
  ConnectorOrmEntity,
  CityOrmEntity,
} from '../entities/station.orm-entities';

@Injectable()
export class StationRepository implements IStationRepository {
  constructor(
    @InjectRepository(StationOrmEntity)
    private readonly stationRepo: Repository<StationOrmEntity>,
    @InjectRepository(CityOrmEntity)
    private readonly cityRepo: Repository<CityOrmEntity>,
  ) {}

  async findById(id: string): Promise<Station | null> {
    const e = await this.stationRepo.findOne({ where: { id } });
    if (!e) return null;
    return this.toDomain(e, []);
  }

  async findByIdWithChargers(id: string): Promise<Station | null> {
    const e = await this.stationRepo.findOne({
      where: { id },
      relations: ['chargingPoints', 'chargingPoints.connectors'],
    });
    if (!e) return null;
    const chargers = (e.chargingPoints ?? []).map((cp) => this.chargerToDomain(cp));
    return this.toDomain(e, chargers);
  }

  async findMany(filter: StationFilter): Promise<PaginatedResult<Station>> {
    const qb = this.stationRepo.createQueryBuilder('s');

    if (filter.cityId)  qb.andWhere('s.city_id = :cityId', { cityId: filter.cityId });
    if (filter.status)  qb.andWhere('s.status = :status',  { status: filter.status });
    if (filter.ownerId) qb.andWhere('s.owner_id = :ownerId', { ownerId: filter.ownerId });

    // Geo bounding box — approximation (NOT haversine, used for all queries)
    if (filter.nearLat !== undefined && filter.nearLng !== undefined && filter.radiusKm) {
      const deltaLat = filter.radiusKm / 111;   // 1° lat ≈ 111 km
      const deltaLng = filter.radiusKm / (111 * Math.cos(filter.nearLat * Math.PI / 180));
      qb.andWhere('s.latitude  BETWEEN :latMin AND :latMax', {
        latMin: filter.nearLat - deltaLat,
        latMax: filter.nearLat + deltaLat,
      });
      qb.andWhere('s.longitude BETWEEN :lngMin AND :lngMax', {
        lngMin: filter.nearLng - deltaLng,
        lngMax: filter.nearLng + deltaLng,
      });
    }

    // Full-text search: name OR address (case-insensitive, parameterized — safe from injection)
    if (filter.search && filter.search.trim().length > 0) {
      qb.andWhere(
        '(s.name ILIKE :search OR s.address ILIKE :search)',
        { search: `%${filter.search.trim()}%` },
      );
    }

    const limit  = filter.limit  ?? 20;
    const offset = filter.offset ?? 0;

    qb.leftJoinAndSelect('s.chargingPoints', 'cp');

    qb.orderBy('s.createdAt', 'DESC').take(limit).skip(offset);

    const [rows, total] = await qb.getManyAndCount();
    const items = rows.map((r) => {
      const chargers = (r.chargingPoints ?? []).map((cp) => this.chargerToDomain(cp));
      return this.toDomain(r, chargers);
    });
    
    return { items, total, limit, offset };
  }

  async existsByGeo(latitude: number, longitude: number, excludeId?: string): Promise<boolean> {
    const qb = this.stationRepo.createQueryBuilder('s')
      .where('s.latitude = :lat AND s.longitude = :lng', { lat: latitude, lng: longitude });
    if (excludeId) qb.andWhere('s.id != :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async save(station: Station, manager?: EntityManager): Promise<void> {
    const e: Partial<StationOrmEntity> = {
      id:        station.id,
      name:      station.name,
      address:   station.address,
      cityId:    station.cityId,
      latitude:  station.latitude,
      longitude: station.longitude,
      status:    station.status,
      ownerId:   station.ownerId,
      ownerName: station.ownerName,
    };
    if (manager) await manager.save(StationOrmEntity, e);
    else await this.stationRepo.save(e as StationOrmEntity);
  }

  async findCityById(cityId: string): Promise<CityReadModel | null> {
    const c = await this.cityRepo.findOne({ where: { id: cityId } });
    if (!c) return null;
    return { id: c.id, cityName: c.cityName, region: c.region, countryCode: c.countryCode };
  }

  async findAllCities(): Promise<CityReadModel[]> {
    const rows = await this.cityRepo.find({ order: { cityName: 'ASC' } });
    return rows.map((c) => ({
      id: c.id,
      cityName: c.cityName,
      region: c.region,
      countryCode: c.countryCode,
    }));
  }

  // Mappers

  private toDomain(e: StationOrmEntity, chargers: Charger[]): Station {
    return Station.reconstitute({
      id:        e.id,
      name:      e.name,
      address:   e.address,
      cityId:    e.cityId,
      latitude:  Number(e.latitude),
      longitude: Number(e.longitude),
      status:    e.status as StationStatus,
      ownerId:   e.ownerId,
      ownerName: e.ownerName,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }, chargers);
  }

  private chargerToDomain(cp: ChargingPointOrmEntity): Charger {
    return Charger.reconstitute({
      id:          cp.id,
      stationId:   cp.stationId,
      name:        cp.name,
      externalId:  cp.externalId,
      maxPowerKw:  Number(cp.maxPowerKw),
      status:      cp.status as ChargerStatus,
      connectors:  (cp.connectors ?? []).map((c: ConnectorOrmEntity) => ({
        id:              c.id,
        chargingPointId: c.chargingPointId,
        connectorType:   c.connectorType as ConnectorType,
        maxPowerKw:      c.maxPowerKw ? Number(c.maxPowerKw) : null,
      })),
      createdAt:   cp.createdAt,
      updatedAt:   cp.updatedAt,
    });
  }
}
