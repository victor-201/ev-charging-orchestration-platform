import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/booking_entity.dart';

/// Reservation and Charging Queue Repository Interface
///
/// Defines the data-layer contract for checking slot availabilities, managing charging
/// reservations, processing cancellations, and entering or leaving live wait queues.
abstract class IBookingRepository {
  /// Queries available charging slot schedules for a given charger and target date.
  Future<Either<Failure, List<AvailabilitySlotEntity>>> getAvailability({
    required String chargerId,
    required DateTime date,
  });

  /// Queries all reservation history records linked to the current customer.
  Future<Either<Failure, List<BookingEntity>>> getMyBookings({
    int page = 1,
    int limit = 20,
    String? status,
  });

  /// Submits a request to create a new reservation for an EV charging connector.
  Future<Either<Failure, BookingEntity>> createBooking({
    required String chargerId,
    required String stationId,
    required String connectorType,
    required DateTime startTime,
    required DateTime endTime,
  });

  /// Resolves the current parameters and state metadata of a single reservation.
  Future<Either<Failure, BookingEntity>> getBookingById(String id);

  /// Cancels a pending or active reservation.
  Future<Either<Failure, void>> cancelBooking(String id);

  /// Enters a virtual FIFO reservation queue when all station connectors are occupied.
  Future<Either<Failure, void>> joinQueue(String chargerId);

  /// Exits the virtual reservation wait queue prematurely.
  Future<Either<Failure, void>> leaveQueue(String chargerId);

  /// Resolves the customer's current index and estimated wait duration in the queue.
  Future<Either<Failure, QueuePositionEntity>> getQueuePosition(String chargerId);

  /// Submits payment for a pending booking. Returns method ('wallet' or 'gateway') and paymentUrl if gateway.
  Future<Either<Failure, PaymentResultEntity>> payForBooking({
    required String bookingId,
    required double amount,
    String method = 'wallet',
  });
}
