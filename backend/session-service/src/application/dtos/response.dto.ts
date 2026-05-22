import { BookingStatus } from '../../domain/value-objects/booking-status.vo';

export class BookingResponseDto {
  id: string;
  userId: string;
  chargerId: string;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  durationMinutes: number;
  /** One-time QR Token - only available after successful payment (status = confirmed) */
  qrToken: string | null;
  /** Deposit amount (VND) */
  depositAmount: number | null;
  /** Booked connector type */
  connectorType: string | null;
  createdAt: Date;
}

export class AvailabilitySlotDto {
  startTime: Date;
  endTime: Date;
  isBooked: boolean;
}

export class SuggestChargerResponseDto {
  chargerId: string;
  stationId: string;
  score: number;
  rank: number;
}

export class QueuePositionResponseDto {
  position: number;
  userId: string;
  chargerId: string;
  estimatedWaitMinutes: number;
}
