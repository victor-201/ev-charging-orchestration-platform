part of 'charging_session_bloc.dart';

abstract class ChargingEvent extends Equatable {
  const ChargingEvent();
  @override
  List<Object?> get props => [];
}

/// Start charging — POST /api/v1/charging/start
/// chargerId is required; bookingId and qrToken are optional.
class ChargingStartRequested extends ChargingEvent {
  final String chargerId;
  final String? bookingId;
  final String? qrToken;
  const ChargingStartRequested({
    required this.chargerId,
    this.bookingId,
    this.qrToken,
  });
  @override
  List<Object?> get props => [chargerId, bookingId, qrToken];
}

class ChargingStopRequested extends ChargingEvent {
  final String sessionId;
  const ChargingStopRequested({required this.sessionId});
  @override
  List<Object?> get props => [sessionId];
}

class ChargingTelemetryReceived extends ChargingEvent {
  final TelemetryData data;
  const ChargingTelemetryReceived({required this.data});
  @override
  List<Object?> get props => [data];
}

class ChargingSessionLoaded extends ChargingEvent {
  final ChargingSessionEntity session;
  const ChargingSessionLoaded({required this.session});
  @override
  List<Object?> get props => [session];
}

class ChargingSessionFetchRequested extends ChargingEvent {
  final String sessionId;
  const ChargingSessionFetchRequested({required this.sessionId});
  @override
  List<Object?> get props => [sessionId];
}

class ChargingReset extends ChargingEvent {
  const ChargingReset();
}

class ChargingSessionSyncRequested extends ChargingEvent {
  const ChargingSessionSyncRequested();
}

/// Lightweight periodic poll — fetches session data WITHOUT showing loading
/// spinner. Used as a fallback when WebSocket telemetry is unavailable.
class ChargingSessionPollRequested extends ChargingEvent {
  final String sessionId;
  const ChargingSessionPollRequested({required this.sessionId});
  @override
  List<Object?> get props => [sessionId];
}

