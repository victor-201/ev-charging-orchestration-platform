part of 'profile_bloc.dart';

abstract class ProfileState extends Equatable {
  const ProfileState();
  @override
  List<Object?> get props => [];
}

class ProfileInitial extends ProfileState {
  const ProfileInitial();
}

class ProfileLoading extends ProfileState {
  const ProfileLoading();
}

class ProfileLoaded extends ProfileState {
  final UserProfileEntity profile;
  final List<VehicleEntity> vehicles;
  final List<SessionDeviceEntity> sessions;
  final List<AuditLogEntity> auditLogs;
  final List<AuditLogEntity> vehicleAuditLogs;

  const ProfileLoaded({
    required this.profile,
    this.vehicles = const [],
    this.sessions = const [],
    this.auditLogs = const [],
    this.vehicleAuditLogs = const [],
  });

  ProfileLoaded copyWith({
    UserProfileEntity? profile,
    List<VehicleEntity>? vehicles,
    List<SessionDeviceEntity>? sessions,
    List<AuditLogEntity>? auditLogs,
    List<AuditLogEntity>? vehicleAuditLogs,
  }) =>
      ProfileLoaded(
        profile: profile ?? this.profile,
        vehicles: vehicles ?? this.vehicles,
        sessions: sessions ?? this.sessions,
        auditLogs: auditLogs ?? this.auditLogs,
        vehicleAuditLogs: vehicleAuditLogs ?? this.vehicleAuditLogs,
      );

  @override
  List<Object?> get props => [profile, vehicles, sessions, auditLogs, vehicleAuditLogs];
}

class ProfileError extends ProfileState {
  final String message;
  const ProfileError({required this.message});
  @override
  List<Object?> get props => [message];
}

class ProfileSuccess extends ProfileState {
  final String message;
  const ProfileSuccess({required this.message});
  @override
  List<Object?> get props => [message];
}
