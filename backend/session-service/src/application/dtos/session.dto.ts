import { IsString, IsOptional, IsNumber, IsEnum, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class StartSessionDto {
  /** Charger ID selected by user on kiosk screen. */
  @IsUUID('all')
  chargerId: string;

  /**
   * Pre-booked flow:
   * bookingId is retrieved from QR code (app generates when booking, kiosk scans and sends).
   * If none -> walk-in.
   */
  @IsOptional()
  @IsUUID('all')
  bookingId?: string;

  /**
   * QR verification token (short-lived JWT containing bookingId + userId).
   * Required when bookingId is present, system verifies before starting session.
   */
  @IsOptional()
  @IsString()
  qrToken?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  startMeterWh?: number;

  // userId is NOT allowed to be sent from client - always get from JWT (CurrentUser).
  // initiatedBy is always 'user' because user operates at kiosk.
}

export class StopSessionDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  endMeterWh: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RecordTelemetryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  powerKw?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  meterWh?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  socPercent?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  temperatureC?: number;

  @IsOptional()
  @IsString()
  errorCode?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  voltage?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  currentA?: number;
}
