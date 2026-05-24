part of 'profile_bloc.dart';

abstract class ProfileEvent extends Equatable {
  const ProfileEvent();
  @override
  List<Object?> get props => [];
}

class ProfileLoad extends ProfileEvent {
  const ProfileLoad();
}

/// Update mutable display fields — API only accepts avatarUrl and address
class ProfileUpdate extends ProfileEvent {
  final String? avatarUrl;
  final String? address;

  const ProfileUpdate({this.avatarUrl, this.address});

  @override
  List<Object?> get props => [avatarUrl, address];
}

class ProfileChangePassword extends ProfileEvent {
  final String currentPassword;
  final String newPassword;

  const ProfileChangePassword({
    required this.currentPassword,
    required this.newPassword,
  });

  @override
  List<Object?> get props => [currentPassword];
}

class ProfileLoadSessions extends ProfileEvent {
  const ProfileLoadSessions();
}

class ProfileRevokeSession extends ProfileEvent {
  final String id;
  const ProfileRevokeSession({required this.id});
  @override
  List<Object?> get props => [id];
}

class ProfileRevokeAllSessions extends ProfileEvent {
  const ProfileRevokeAllSessions();
}

class VehicleLoad extends ProfileEvent {
  const VehicleLoad();
}

/// Add vehicle — fields match POST /api/v1/users/me/vehicles
class VehicleAdd extends ProfileEvent {
  final String plateNumber;
  final String modelName;
  final String brand;
  final int year;
  final String color;
  final double batteryCapacityKwh;
  final String? macAddress;
  final String? vinNumber;

  const VehicleAdd({
    required this.plateNumber,
    required this.modelName,
    required this.brand,
    required this.year,
    required this.color,
    required this.batteryCapacityKwh,
    this.macAddress,
    this.vinNumber,
  });

  @override
  List<Object?> get props => [plateNumber, modelName];
}

class VehicleDelete extends ProfileEvent {
  final String id;
  const VehicleDelete({required this.id});
  @override
  List<Object?> get props => [id];
}

class VehicleSetPrimary extends ProfileEvent {
  final String id;
  const VehicleSetPrimary({required this.id});
  @override
  List<Object?> get props => [id];
}

/// AutoCharge setup — PATCH /api/v1/users/me/vehicles/:id/autocharge-setup
class VehicleSetAutoCharge extends ProfileEvent {
  final String vehicleId;
  final String? macAddress;
  final String? vinNumber;
  final bool? autochargeEnabled;

  const VehicleSetAutoCharge({
    required this.vehicleId,
    this.macAddress,
    this.vinNumber,
    this.autochargeEnabled,
  });

  @override
  List<Object?> get props => [vehicleId, macAddress, vinNumber, autochargeEnabled];
}

class ProfileLoadAuditLogs extends ProfileEvent {
  const ProfileLoadAuditLogs();
}

class VehicleLoadAuditLogs extends ProfileEvent {
  final String vehicleId;
  const VehicleLoadAuditLogs({required this.vehicleId});

  @override
  List<Object?> get props => [vehicleId];
}
