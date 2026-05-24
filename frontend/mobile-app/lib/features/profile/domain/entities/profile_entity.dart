import 'package:equatable/equatable.dart';

/// Full user profile entity — matches GET /api/v1/users/me response
class UserProfileEntity extends Equatable {
  final String id;
  final String email;
  final String fullName;
  final String? phone;
  final DateTime? dateOfBirth;
  final String role;
  final bool mfaEnabled;
  final String? status;
  final bool emailVerified;
  final String? avatarUrl;
  final String? address;
  final bool hasArrears;
  final double arrearsAmount;

  const UserProfileEntity({
    required this.id,
    required this.email,
    required this.fullName,
    this.phone,
    this.dateOfBirth,
    required this.role,
    required this.mfaEnabled,
    this.status,
    this.emailVerified = false,
    this.avatarUrl,
    this.address,
    required this.hasArrears,
    required this.arrearsAmount,
  });

  @override
  List<Object?> get props => [
        id,
        email,
        fullName,
        mfaEnabled,
        status,
        emailVerified,
        avatarUrl,
        address,
        hasArrears,
        arrearsAmount,
      ];
}

/// Vehicle entity — matches GET/POST /api/v1/users/me/vehicles response
///
/// Field names align exactly with API JSON keys:
///   modelName, year, color, batteryCapacityKwh, macAddress, vinNumber, autochargeEnabled
class VehicleEntity extends Equatable {
  final String id;
  final String plateNumber;
  // API returns "modelName" (not "model")
  final String modelName;
  final String brand;
  final int year;
  final String color;
  final String connectorType; // CCS2 | CHAdeMO | Type2 | GB/T | Other
  final double batteryCapacityKwh;
  final bool isPrimary;
  // AutoCharge fields — PATCH /users/me/vehicles/:id/autocharge-setup
  final String? macAddress;
  final String? vinNumber;
  final bool autochargeEnabled;

  const VehicleEntity({
    required this.id,
    required this.plateNumber,
    required this.modelName,
    required this.brand,
    required this.year,
    required this.color,
    required this.connectorType,
    required this.batteryCapacityKwh,
    required this.isPrimary,
    this.macAddress,
    this.vinNumber,
    this.autochargeEnabled = false,
  });

  @override
  List<Object?> get props => [id, plateNumber, isPrimary, vinNumber, autochargeEnabled];
}

/// Login device/session entity — matches GET /api/v1/auth/sessions
class SessionDeviceEntity extends Equatable {
  final String id;
  final String ipAddress;
  final String userAgent;
  final DateTime createdAt;
  final bool isCurrentSession;

  const SessionDeviceEntity({
    required this.id,
    required this.ipAddress,
    required this.userAgent,
    required this.createdAt,
    required this.isCurrentSession,
  });

  @override
  List<Object?> get props => [id];
}

/// Audit Log entity — matches GET /api/v1/users/me/audit-log
class AuditLogEntity extends Equatable {
  final String action;
  final DateTime changedAt;
  final Map<String, dynamic> details;

  const AuditLogEntity({
    required this.action,
    required this.changedAt,
    required this.details,
  });

  @override
  List<Object?> get props => [action, changedAt, details];
}
