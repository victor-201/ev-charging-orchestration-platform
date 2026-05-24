import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/booking_entity.dart';
import '../../domain/repositories/i_booking_repository.dart';

/// Charging Slot Reservation and Wait Queue Business Logic Component (BLoC)
///
/// Coordinates all states and operations related to checking slot schedules, reserving EV
/// connectors, tracking booking status changes, and managing virtual FIFO wait queue positions.
part 'booking_event.dart';
part 'booking_state.dart';

class BookingBloc extends Bloc<BookingEvent, BookingState> {
  final IBookingRepository _repository;
  Timer? _pollTimer;
  Timer? _queuePollTimer;

  BookingBloc({required IBookingRepository repository})
      : _repository = repository,
        super(const BookingInitial()) {
    on<BookingLoadHistory>(_onLoadHistory);
    on<BookingLoadAvailability>(_onLoadAvailability);
    on<BookingCreate>(_onCreate);
    on<BookingLoadDetail>(_onLoadDetail);
    on<BookingCancel>(_onCancel);
    on<BookingStartPolling>(_onStartPolling);
    on<BookingStopPolling>(_onStopPolling);
    on<QueueJoin>(_onQueueJoin);
    on<QueueLeave>(_onQueueLeave);
    on<QueueLoadPosition>(_onQueueLoadPosition);
    on<BookingPay>(_onPay);
  }


  Future<void> _onLoadHistory(
      BookingLoadHistory event, Emitter<BookingState> emit) async {
    emit(const BookingLoading());
    final result = await _repository.getMyBookings();
    result.fold(
      (f) => emit(BookingError(message: f.message)),
      (list) => emit(BookingHistoryLoaded(bookings: list)),
    );
  }

  Future<void> _onLoadAvailability(
      BookingLoadAvailability event, Emitter<BookingState> emit) async {
    emit(const BookingLoading());
    final result = await _repository.getAvailability(
      chargerId: event.chargerId,
      date: event.date,
    );
    result.fold(
      (f) => emit(BookingError(message: f.message)),
      (slots) => emit(BookingAvailabilityLoaded(
          slots: slots, chargerId: event.chargerId)),
    );
  }

  Future<void> _onCreate(
      BookingCreate event, Emitter<BookingState> emit) async {
    emit(const BookingLoading());
    final result = await _repository.createBooking(
      chargerId: event.chargerId,
      stationId: event.stationId,
      connectorType: event.connectorType,
      startTime: event.startTime,
      endTime: event.endTime,
    );
    result.fold(
      (f) => emit(BookingError(message: f.message)),
      (booking) => emit(BookingCreated(booking: booking)),
    );
  }

  Future<void> _onLoadDetail(
      BookingLoadDetail event, Emitter<BookingState> emit) async {
    emit(const BookingLoading());
    final result = await _repository.getBookingById(event.id);
    result.fold(
      (f) => emit(BookingError(message: f.message)),
      (booking) => emit(BookingDetailLoaded(booking: booking)),
    );
  }

  Future<void> _onCancel(
      BookingCancel event, Emitter<BookingState> emit) async {
    emit(const BookingLoading());
    final result = await _repository.cancelBooking(event.id);
    result.fold(
      (f) => emit(BookingError(message: f.message)),
      (_) => emit(const BookingCancelled()),
    );
  }

  /// Polls the booking detail endpoint periodically until status reaches confirmation.
  void _onStartPolling(
      BookingStartPolling event, Emitter<BookingState> emit) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      add(BookingLoadDetail(id: event.id));
    });
  }

  void _onStopPolling(
      BookingStopPolling event, Emitter<BookingState> emit) {
    _pollTimer?.cancel();
  }

  Future<void> _onQueueJoin(
      QueueJoin event, Emitter<BookingState> emit) async {
    emit(const QueuePositionState(inQueue: false, isLoading: true));
    final result = await _repository.joinQueue(event.chargerId);
    result.fold(
      (f) => emit(BookingError(message: f.message)),
      (_) {
        emit(const QueuePositionState(inQueue: true, position: 0));
        _queuePollTimer?.cancel();
        _queuePollTimer = Timer.periodic(
          const Duration(seconds: 30),
          (_) => add(QueueLoadPosition(chargerId: event.chargerId)),
        );
      },
    );
  }

  Future<void> _onQueueLeave(
      QueueLeave event, Emitter<BookingState> emit) async {
    _queuePollTimer?.cancel();
    await _repository.leaveQueue(event.chargerId);
    emit(const QueuePositionState(inQueue: false));
  }

  Future<void> _onQueueLoadPosition(
      QueueLoadPosition event, Emitter<BookingState> emit) async {
    final result =
        await _repository.getQueuePosition(event.chargerId);
    result.fold(
      (f) {},
      (pos) => emit(QueuePositionState(
        inQueue: true,
        position: pos.position,
        estimatedWaitMinutes: pos.estimatedWaitMinutes,
      )),
    );
  }

  Future<void> _onPay(
      BookingPay event, Emitter<BookingState> emit) async {
    emit(const BookingLoading());
    final result = await _repository.payForBooking(
      bookingId: event.bookingId,
      amount: event.amount,
      method: event.method,
    );
    result.fold(
      (f) => emit(BookingError(message: f.message)),
      (res) => emit(BookingPaymentInitiated(paymentResult: res)),
    );
  }

  @override
  Future<void> close() {
    _pollTimer?.cancel();
    _queuePollTimer?.cancel();
    return super.close();
  }
}
