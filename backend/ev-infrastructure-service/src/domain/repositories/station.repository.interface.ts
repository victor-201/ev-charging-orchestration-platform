import { EntityManager } from 'typeorm';
import { Station, StationStatus } from '../entities/station.aggregate';

export const STATION_REPOSITORY = Symbol('STATION_REPOSITORY');

export interface StationFilter {
  cityId?: string;
  status?: StationStatus;
  statusNotIn?: StationStatus[]; // Exclude stations with these statuses (e.g. hide 'inactive' from map)
  ownerId?: string;
  nearLat?: number;
  nearLng?: number;
  radiusKm?: number;
  search?: string;        // full-text search: name ILIKE OR address ILIKE
  connectorType?: string; // filter stations that have at least one connector of this type
  ids?: string[];         // batch lookup: return only stations with these IDs
  chargerIds?: string[];  // batch lookup: return stations containing any of these charger IDs
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface CityReadModel {
  id: string;
  cityName: string;
  region: string;
  countryCode: string;
}

export interface IStationRepository {
  /** Finds by primary key — returns null if not found */
  findById(id: string): Promise<Station | null>;

  /** Find with chargers loaded */
  findByIdWithChargers(id: string): Promise<Station | null>;

  /** List + filter + pagination */
  findMany(filter: StationFilter): Promise<PaginatedResult<Station>>;

  /** Checks for duplicate geographic coordinates */
  existsByGeo(latitude: number, longitude: number, excludeId?: string): Promise<boolean>;

  /** Persist (INSERT or UPDATE) */
  save(station: Station, manager?: EntityManager): Promise<void>;

  /** Find city by id */
  findCityById(cityId: string): Promise<CityReadModel | null>;

  /** List all cities */
  findAllCities(): Promise<CityReadModel[]>;
}
