import {
  IsString, IsNotEmpty, IsUUID, IsNumber, IsOptional,
  Min, Max, MinLength, MaxLength, IsEnum, Allow,
} from 'class-validator';
import { Type, Expose } from 'class-transformer';
import { StationStatus } from '../../domain/entities/station.aggregate';

// Create Station

export class CreateStationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsUUID()
  cityId: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  longitude: number;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerName?: string;
}

// Update Station

export class UpdateStationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  longitude?: number;
}

// List Stations Query

export class ListStationsQueryDto {
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsEnum(StationStatus)
  status?: StationStatus;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(2000) // Vietnam spans ~1650 km north-to-south; 2000 km covers the entire country
  @Type(() => Number)
  radiusKm?: number;

  @IsOptional()
  @Allow()
  @Expose()
  @IsString()
  @MaxLength(200)
  search?: string;

  /**
   * Filter stations that have at least one charging point with this connector type.
   * Applied at SQL level so `limit` is respected correctly.
   * Values: 'CCS' | 'CHAdeMO' | 'Type2' | 'GB/T' | 'Other'
   */
  @IsOptional()
  @IsString()
  connectorType?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000) // allow fetching all stations in one request for map display
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  /**
   * Comma-separated list of station UUIDs for batch lookup.
   * When provided, only the specified stations are returned — bypasses full-scan.
   * Example: ?ids=uuid1,uuid2,uuid3
   */
  @IsOptional()
  @IsString()
  ids?: string;

  /**
   * Comma-separated list of charger (charging_point) UUIDs.
   * Returns all stations that contain any of the specified charger IDs.
   * Single query replaces N individual /stations/by-charger/:id calls.
   * Example: ?chargerIds=uuid1,uuid2,uuid3
   */
  @IsOptional()
  @IsString()
  chargerIds?: string;
}

// List Incidents Query
export class ListIncidentsQueryDto {
  @IsOptional()
  @IsString()
  stationId?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}

// List Maintenance Query
export class ListMaintenanceQueryDto {
  @IsOptional()
  @IsString()
  stationId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}
