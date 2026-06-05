import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import '../../domain/entities/charging_session_entity.dart';
import '../../domain/repositories/i_charging_session_repository.dart';
import '../../../../core/errors/failures.dart';

part 'charging_session_event.dart';
part 'charging_session_state.dart';

class ChargingSessionBloc
    extends HydratedBloc<ChargingEvent, ChargingState> {
  final IChargingSessionRepository _repository;
  Timer? _pollTimer;

  ChargingSessionBloc({required IChargingSessionRepository repository})
      : _repository = repository,
        super(const ChargingInitial()) {
    on<ChargingStartRequested>(_onStart);
    on<ChargingStopRequested>(_onStop);
    on<ChargingTelemetryReceived>(_onTelemetry);
    on<ChargingSessionLoaded>(_onSessionLoaded);
    on<ChargingSessionFetchRequested>(_onFetch);
    on<ChargingSessionSyncRequested>(_onSync);
    on<ChargingSessionPollRequested>(_onPoll);
    on<ChargingReset>(_onReset);
  }

  void _startPolling(String sessionId) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      add(ChargingSessionPollRequested(sessionId: sessionId));
    });
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  Future<void> _onStart(
      ChargingStartRequested event, Emitter<ChargingState> emit) async {
    emit(const ChargingLoading());
    final result = await _repository.startSession(
      chargerId: event.chargerId,
      bookingId: event.bookingId,
      qrToken: event.qrToken,
    );
    result.fold(
      (f) => emit(ChargingError(message: f.message)),
      (session) {
        emit(ChargingActive(session: session));
        _startPolling(session.id);
        _repository.connectTelemetry(
          sessionId: session.id,
          onData: (data) => add(ChargingTelemetryReceived(data: data)),
        );
      },
    );
  }

  Future<void> _onStop(
      ChargingStopRequested event, Emitter<ChargingState> emit) async {
    _stopPolling();
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

  Future<void> _onFetch(
      ChargingSessionFetchRequested event, Emitter<ChargingState> emit) async {
    emit(const ChargingLoading());
    final result = await _repository.getActiveSession(event.sessionId);
    result.fold(
      (f) {
        if (f is NotFoundFailure || f is UnauthorizedFailure) {
          emit(const ChargingInitial());
        } else {
          emit(ChargingError(message: f.message));
        }
      },
      (session) {
        if (session.status == 'completed' || session.status == 'COMPLETED' || session.endedAt != null) {
          _stopPolling();
          _repository.disconnectTelemetry();
          emit(ChargingCompleted(session: session));
        } else {
          emit(ChargingActive(session: session));
          _startPolling(session.id);
          _repository.connectTelemetry(
            sessionId: session.id,
            onData: (data) => add(ChargingTelemetryReceived(data: data)),
          );
        }
      },
    );
  }

  Future<void> _onSync(
      ChargingSessionSyncRequested event, Emitter<ChargingState> emit) async {
    final result = await _repository.getSessionHistory(limit: 1, status: 'active');
    result.fold(
      (f) {
        if (f is NotFoundFailure || f is UnauthorizedFailure) {
          emit(const ChargingInitial());
        }
      },
      (sessions) {
        if (sessions.isNotEmpty) {
          final activeSession = sessions.first;
          emit(ChargingActive(session: activeSession));
          _startPolling(activeSession.id);
          _repository.connectTelemetry(
            sessionId: activeSession.id,
            onData: (data) => add(ChargingTelemetryReceived(data: data)),
          );
        } else {
          if (state is ChargingActive || state is ChargingLoading) {
            _stopPolling();
            _repository.disconnectTelemetry();
            emit(const ChargingInitial());
          }
        }
      },
    );
  }

  Future<void> _onPoll(
      ChargingSessionPollRequested event, Emitter<ChargingState> emit) async {
    final result = await _repository.getActiveSession(event.sessionId);
    result.fold(
      (f) {
        // Silent failure — poll will retry on next tick
      },
      (session) {
        if (session.status == 'completed' || session.status == 'COMPLETED' || session.endedAt != null) {
          _stopPolling();
          _repository.disconnectTelemetry();
          emit(ChargingCompleted(session: session));
        } else {
          final current = state;
          if (current is ChargingActive) {
            emit(ChargingActive(
              session: session,
              latestTelemetry: current.latestTelemetry,
            ));
          } else {
            emit(ChargingActive(session: session));
          }
          // Try reconnecting telemetry if not already connected
          _repository.connectTelemetry(
            sessionId: session.id,
            onData: (data) => add(ChargingTelemetryReceived(data: data)),
          );
        }
      },
    );
  }

  void _onReset(ChargingReset event, Emitter<ChargingState> emit) {
    _stopPolling();
    _repository.disconnectTelemetry();
    emit(const ChargingInitial());
  }

  @override
  ChargingState? fromJson(Map<String, dynamic> json) {
    // Do NOT restore ChargingActive from persistence — telemetry would be
    // disconnected and the user would see stale data. Let sync discover it.
    return const ChargingInitial();
  }

  @override
  Map<String, dynamic>? toJson(ChargingState state) {
    // Persist completed sessions (e.g. for the summary screen) but NOT
    // active sessions to avoid stale data on next launch.
    if (state is ChargingCompleted) {
      return {
        'type': 'completed',
        'session': {
          'id': state.session.id,
          'chargerId': state.session.chargerId,
          'status': state.session.status,
          'energyKwh': state.session.energyKwh,
          'socPercent': state.session.socPercent,
          'powerW': state.session.powerW,
          'voltageV': state.session.voltageV,
          'currentA': state.session.currentA,
          'temperatureC': state.session.temperatureC,
          'amountDue': state.session.amountDue,
          'startedAt': state.session.startedAt.toIso8601String(),
          'endedAt': state.session.endedAt?.toIso8601String(),
          'transactionId': state.session.transactionId,
        },
      };
    }
    return null;
  }

  @override
  Future<void> close() {
    _stopPolling();
    _repository.disconnectTelemetry();
    return super.close();
  }
}
