import {
  IsDateString, IsString, IsOptional,
  IsNumber, Min, IsIn, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Supported connector types - VinFast VN standard */
export const CONNECTOR_TYPES = ['CCS', 'CCS2', 'CHAdeMO', 'Type2', 'GB/T', 'Other'] as const;
export type ConnectorType = typeof CONNECTOR_TYPES[number];

export class CreateBookingDto {
  @IsUUID('all')
  chargerId: string;

  @IsUUID('all')
  stationId: string;

  /**
   * Required connector type.
   * VinFast uses CCS2 (DC) and Type2 (AC).
   * Chinese vehicles usually use GB/T.
   */
  @IsString()
  @IsIn(CONNECTOR_TYPES)
  connectorType: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  // depositAmount: REMOVED - backend calculates from pricing_rules
}

export class CancelBookingDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class JoinQueueDto {
  @IsUUID('all')
  chargerId: string;

  @IsOptional()
  @IsString()
  @IsIn(CONNECTOR_TYPES)
  connectorType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  urgencyScore?: number; // 0–10; from vehicle SoC
}

export class AvailabilityQueryDto {
  @IsUUID('all')
  chargerId: string;

  /**
   * Date to check schedule - format: YYYY-MM-DD
   */
  @IsDateString()
  date: string;
}

export class SuggestChargerDto {
  @IsOptional()
  @IsString()
  @IsIn(CONNECTOR_TYPES)
  connectorType?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  startTime?: string;

  @IsOptional()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  budgetVnd?: number;

  @IsOptional()
  @IsString()
  @IsIn(['cost', 'distance'])
  preference?: 'cost' | 'distance';
}
