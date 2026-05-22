import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import '../../domain/entities/charging_session_entity.dart';
import '../../domain/repositories/i_charging_session_repository.dart';

part 'charging_session_event.dart';
part 'charging_session_state.dart';

class ChargingSessionBloc
    extends HydratedBloc<ChargingEvent, ChargingState> {
  final IChargingSessionRepository _repository;

  ChargingSessionBloc({required IChargingSessionRepository repository})
      : _repository = repository,
        super(const ChargingInitial()) {
    on<ChargingStartRequested>(_onStart);
    on<ChargingStopRequested>(_onStop);
    on<ChargingTelemetryReceived>(_onTelemetry);
    on<ChargingSessionLoaded>(_onSessionLoaded);
    on<ChargingReset>(_onReset);
  }

  Future<void> _onStart(
      ChargingStartRequested event, Emitter<ChargingState> emit) async {
    emit(const ChargingLoading());
    final result = await _repository.startSession(
      // chargerId is now required by the API
      chargerId: event.chargerId,
      bookingId: event.bookingId,
      qrToken: event.qrToken,
    );
    result.fold(
      (f) => emit(ChargingError(message: f.message)),
      (session) {
        emit(ChargingActive(session: session));
        _repository.connectTelemetry(
          chargerId: session.chargerId,
          onData: (data) => add(ChargingTelemetryReceived(data: data)),
        );
      },
    );
  }

  Future<void> _onStop(
      ChargingStopRequested event, Emitter<ChargingState> emit) async {
    _repository.disconnectTelemetry();
    final result = await _repository.stopSession(event.sessionId);
    result.fold(
      (f) => emit(ChargingError(message: f.message)),
      (session) => emit(ChargingCompleted(session: session)),
    );
  }

  void _onTelemetry(
      ChargingTelemetryReceived event, Emitter<ChargingState> emit) {
    final current = state;
    if (current is ChargingActive) {
      emit(current.copyWithTelemetry(event.data));
    }
  }

  void _onSessionLoaded(
      ChargingSessionLoaded event, Emitter<ChargingState> emit) {
    if (event.session.isActive) {
      emit(ChargingActive(session: event.session));
    } else {
      emit(ChargingCompleted(session: event.session));
    }
  }

  void _onReset(ChargingReset event, Emitter<ChargingState> emit) {
    _repository.disconnectTelemetry();
    emit(const ChargingInitial());
  }

  @override
  ChargingState? fromJson(Map<String, dynamic> json) {
    try {
      if (json['type'] == 'active') {
        final s = json['session'] as Map<String, dynamic>;
        final session = ChargingSessionEntity(
          id: s['id'],
          chargerId: s['chargerId'],
          status: s['status'],
          energyKwh: (s['energyKwh'] as num).toDouble(),
          socPercent: (s['socPercent'] as num).toDouble(),
          powerW: (s['powerW'] as num).toDouble(),
          amountDue: (s['amountDue'] as num).toDouble(),
          startedAt: DateTime.parse(s['startedAt']),
          endedAt: s['endedAt'] != null
              ? DateTime.parse(s['endedAt'])
              : null,
          transactionId: s['transactionId'],
        );
        return ChargingActive(session: session);
      }
    } catch (_) {}
    return const ChargingInitial();
  }

  @override
  Map<String, dynamic>? toJson(ChargingState state) {
    if (state is ChargingActive) {
      return {
        'type': 'active',
        'session': {
          'id': state.session.id,
          'chargerId': state.session.chargerId,
          'status': state.session.status,
          'energyKwh': state.session.energyKwh,
          'socPercent': state.session.socPercent,
          'powerW': state.session.powerW,
          'amountDue': state.session.amountDue,
          'startedAt': state.session.startedAt.toIso8601String(),
          'endedAt': state.session.endedAt?.toIso8601String(),
          'transactionId': state.session.transactionId,
        },
      };
    }
    return null;
  }
}
