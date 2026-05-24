import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/profile_entity.dart';

/// User Profile and Fleet Management Repository Interface
///
/// Defines the data-layer contract for retrieving personal profiles, modifying account
/// credentials, managing security sessions, and organizing vehicle registries.
abstract class IProfileRepository {
  /// Resolves the authenticated user account and current security contexts.
  Future<Either<Failure, UserProfileEntity>> getMe();

  /// Retrieves detailed contact and settings metadata for the current user profile.
  Future<Either<Failure, UserProfileEntity>> getProfile();

  /// Updates mutable profile display fields — only avatarUrl and address are accepted
  /// by PATCH /api/v1/users/me. fullName/phone are set at registration only.
  Future<Either<Failure, UserProfileEntity>> updateProfile({
    String? avatarUrl,
    String? address,
  });

  /// Changes the user's password credential.
  Future<Either<Failure, void>> changePassword({
    required String currentPassword,
    required String newPassword,
  });

  /// Queries all registered active device sessions for this user.
  Future<Either<Failure, List<SessionDeviceEntity>>> getSessions();

  /// Terminates a specific device session.
  Future<Either<Failure, void>> revokeSession(String id);

  /// Force terminates all active device sessions for the current account.
  Future<Either<Failure, void>> revokeAllSessions();

  /// Retrieves all electric vehicles registered under this user account.
  Future<Either<Failure, List<VehicleEntity>>> getVehicles();

  /// Adds a new EV — POST /api/v1/users/me/vehicles
  /// Required: brand, modelName, year, plateNumber, color, batteryCapacityKwh
  Future<Either<Failure, VehicleEntity>> addVehicle({
    required String brand,
    required String modelName,
    required int year,
    required String plateNumber,
    required String color,
    required double batteryCapacityKwh,
    String? macAddress,
    String? vinNumber,
  });

  /// Updates mutable vehicle fields — only color is accepted by PATCH /users/me/vehicles/:id
  Future<Either<Failure, VehicleEntity>> updateVehicle(
    String id, {
    String? color,
  });

  /// Deletes a registered vehicle configuration from the user's profile.
  Future<Either<Failure, void>> deleteVehicle(String id);

  /// Configures a targeted vehicle as the default primary option.
  Future<Either<Failure, void>> setPrimaryVehicle(String id);

  /// Configures AutoCharge settings — PATCH /users/me/vehicles/:id/autocharge-setup
  /// All fields optional; at least one should be provided.
  Future<Either<Failure, VehicleEntity>> setAutoCharge(
    String vehicleId, {
    String? macAddress,
    String? vinNumber,
    bool? autochargeEnabled,
  });

  /// Queries all security and profile change audit logs for the current user.
  Future<Either<Failure, List<AuditLogEntity>>> getAuditLogs({int limit = 20});

  /// Queries all audit logs for a specific vehicle by its ID.
  Future<Either<Failure, List<AuditLogEntity>>> getVehicleAuditLogs(String vehicleId, {int limit = 20});

  /// Generates a TOTP secret and QR URL to setup MFA.
  Future<Either<Failure, Map<String, dynamic>>> setupMfa();

  /// Verifies a 6-digit TOTP token to activate MFA. Returns backup codes.
  Future<Either<Failure, List<String>>> verifyAndEnableMfa(String token);

  /// Disables MFA for the current account. Requires current password.
  Future<Either<Failure, void>> disableMfa(String password);
}
