part of 'charging_session_bloc.dart';

abstract class ChargingState extends Equatable {
  const ChargingState();
  @override
  List<Object?> get props => [];
}

class ChargingInitial extends ChargingState {
  const ChargingInitial();
}

class ChargingLoading extends ChargingState {
  const ChargingLoading();
}

class ChargingActive extends ChargingState {
  final ChargingSessionEntity session;
  final TelemetryData? latestTelemetry;

  const ChargingActive({
    required this.session,
    this.latestTelemetry,
  });

  ChargingActive copyWithTelemetry(TelemetryData data) {
    return ChargingActive(
      session: ChargingSessionEntity(
        id: session.id,
        chargerId: session.chargerId,
        status: session.status,
        energyKwh: data.energyKwh,
        socPercent: data.socPercent,
        powerW: data.powerW,
        amountDue: data.amountDue,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        transactionId: session.transactionId,
      ),
      latestTelemetry: data,
    );
  }

  @override
  List<Object?> get props => [session, latestTelemetry];
}

class ChargingCompleted extends ChargingState {
  final ChargingSessionEntity session;
  const ChargingCompleted({required this.session});
  @override
  List<Object?> get props => [session];
}

class ChargingError extends ChargingState {
  final String message;
  const ChargingError({required this.message});
  @override
  List<Object?> get props => [message];
}
