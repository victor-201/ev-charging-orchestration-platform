import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DomainException } from './domain.exception';

export class BookingConflictException extends ConflictException {
  constructor(chargerId: string) {
    super(`Booking conflict: charger ${chargerId} is already booked for the requested time slot`);
    this.name = 'BookingConflictException';
  }
}

export class BookingNotFoundException extends NotFoundException {
  constructor(bookingId: string) {
    super(`Booking not found: ${bookingId}`);
    this.name = 'BookingNotFoundException';
  }
}

export class InvalidBookingStateException extends BadRequestException {
  constructor(current: string, action: string) {
    super(`Cannot perform '${action}' on booking with status '${current}'`);
    this.name = 'InvalidBookingStateException';
  }
}
