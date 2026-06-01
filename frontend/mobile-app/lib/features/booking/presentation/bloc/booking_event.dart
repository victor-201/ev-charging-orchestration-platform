part of 'booking_bloc.dart';

sealed class BookingEvent extends Equatable {
  const BookingEvent();
  @override
  List<Object?> get props => [];
}

final class BookingLoadHistory extends BookingEvent {
  final int page;
  final int limit;
  final String? status;

  const BookingLoadHistory({
    this.page = 1,
    this.limit = 20,
    this.status,
  });

  @override
  List<Object?> get props => [page, limit, status];
}

final class BookingLoadAvailability extends BookingEvent {
  final String chargerId;
  final DateTime date;
  const BookingLoadAvailability({required this.chargerId, required this.date});
  @override
  List<Object?> get props => [chargerId, date];
}

final class BookingCreate extends BookingEvent {
  final String chargerId;
  final String stationId;
  final String connectorType;
  final DateTime startTime;
  final DateTime endTime;
  const BookingCreate({
    required this.chargerId,
    required this.stationId,
    required this.connectorType,
    required this.startTime,
    required this.endTime,
  });
  @override
  List<Object?> get props =>
      [chargerId, stationId, connectorType, startTime, endTime];
}

final class BookingLoadDetail extends BookingEvent {
  final String id;
  final bool quiet;
  const BookingLoadDetail({required this.id, this.quiet = false});
  @override
  List<Object?> get props => [id, quiet];
}

final class BookingCancel extends BookingEvent {
  final String id;
  const BookingCancel({required this.id});
  @override
  List<Object?> get props => [id];
}

final class BookingStartPolling extends BookingEvent {
  final String id;
  const BookingStartPolling({required this.id});
  @override
  List<Object?> get props => [id];
}

final class BookingStopPolling extends BookingEvent {
  const BookingStopPolling();
}

final class BookingPay extends BookingEvent {
  final String bookingId;
  final double amount;
  final String method; // 'wallet' or 'gateway'
  const BookingPay({required this.bookingId, required this.amount, required this.method});
  @override
  List<Object?> get props => [bookingId, amount, method];
}


final class QueueJoin extends BookingEvent {
  final String chargerId;
  const QueueJoin({required this.chargerId});
  @override
  List<Object?> get props => [chargerId];
}

final class QueueLeave extends BookingEvent {
  final String chargerId;
  const QueueLeave({required this.chargerId});
  @override
  List<Object?> get props => [chargerId];
}

final class QueueLoadPosition extends BookingEvent {
  final String chargerId;
  const QueueLoadPosition({required this.chargerId});
  @override
  List<Object?> get props => [chargerId];
}
