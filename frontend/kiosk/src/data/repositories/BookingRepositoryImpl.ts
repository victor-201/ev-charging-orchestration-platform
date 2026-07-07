import { IBookingRepository } from "../../domain/repositories/repository.interfaces";
import { AvailabilitySlot } from "../../domain/entities/entities";
import { apiSessionClient } from "../sources/apiSessionClient";

export class BookingRepositoryImpl implements IBookingRepository {
  async getAvailabilitySlots(chargerId: string, date: string): Promise<AvailabilitySlot[]> {
    const { data } = await apiSessionClient.get<AvailabilitySlot[]>('/bookings/availability', {
      params: { chargerId, date },
    });
    return data;
  }
}
