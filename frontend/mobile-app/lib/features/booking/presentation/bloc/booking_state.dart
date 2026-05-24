part of 'booking_bloc.dart';

sealed class BookingState extends Equatable {
  const BookingState();
  @override
  List<Object?> get props => [];
}

final class BookingInitial extends BookingState {
  const BookingInitial();
}

final class BookingLoading extends BookingState {
  const BookingLoading();
}

final class BookingHistoryLoaded extends BookingState {
  final List<BookingEntity> bookings;
  const BookingHistoryLoaded({required this.bookings});
  @override
  List<Object?> get props => [bookings];
}

final class BookingAvailabilityLoaded extends BookingState {
  final List<AvailabilitySlotEntity> slots;
  final String chargerId;
  const BookingAvailabilityLoaded({required this.slots, required this.chargerId});
  @override
  List<Object?> get props => [slots, chargerId];
}

final class BookingDetailLoaded extends BookingState {
  final BookingEntity booking;
  const BookingDetailLoaded({required this.booking});
  @override
  List<Object?> get props => [booking];
}

final class BookingCreated extends BookingState {
  final BookingEntity booking;
  const BookingCreated({required this.booking});
  @override
  List<Object?> get props => [booking];
}

final class BookingCancelled extends BookingState {
  const BookingCancelled();
}

final class BookingPaymentInitiated extends BookingState {
  final PaymentResultEntity paymentResult;
  const BookingPaymentInitiated({required this.paymentResult});
  @override
  List<Object?> get props => [paymentResult];
}


final class QueuePositionState extends BookingState {
  final int? position;
  final int? estimatedWaitMinutes;
  final bool inQueue;
  final bool isLoading;
  const QueuePositionState({
    this.position,
    this.estimatedWaitMinutes,
    this.inQueue = false,
    this.isLoading = false,
  });
  @override
  List<Object?> get props =>
      [position, estimatedWaitMinutes, inQueue, isLoading];
}

final class BookingError extends BookingState {
  final String message;
  const BookingError({required this.message});
  @override
  List<Object?> get props => [message];
}
