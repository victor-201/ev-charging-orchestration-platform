import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/charging_session_entity.dart';

/// Charging Session Control and Telemetry Repository Interface
///
/// Defines the data-layer contract for starting and stopping EV charging sessions,
/// querying live session states, fetching historical metrics, and orchestrating
/// real-time telemetry streaming over WebSockets.
abstract class IChargingSessionRepository {
  /// Spawns a new charging session — POST /api/v1/charging/start
  /// chargerId is required; bookingId and qrToken are optional (walk-up session).
  Future<Either<Failure, ChargingSessionEntity>> startSession({
    required String chargerId,
    String? bookingId,
    String? qrToken,
  });

  /// Requests premature termination of an active charging session by its unique identifier.
  Future<Either<Failure, ChargingSessionEntity>> stopSession(String sessionId);

  /// Resolves real-time diagnostics and current billing parameters for a session.
  Future<Either<Failure, ChargingSessionEntity>> getActiveSession(String sessionId);

  /// Queries a list of completed charging sessions for the current user.
  /// GET /api/v1/charging/history uses offset-based pagination, not page-based.
  Future<Either<Failure, List<ChargingSessionEntity>>> getSessionHistory({
    int? limit,
    int? offset,
    String? status,
  });

  /// Establishes a WebSocket tunnel to stream real-time sensor metrics for a charger.
  void connectTelemetry({
    required String chargerId,
    required void Function(TelemetryData) onData,
  });

  /// Closes the active WebSocket telemetry tunnel.
  void disconnectTelemetry();
}
