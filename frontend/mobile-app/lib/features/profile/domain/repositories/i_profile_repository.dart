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

  /// Updates personal profile details (e.g., name, phone number, date of birth).
  Future<Either<Failure, UserProfileEntity>> updateProfile({String? fullName, String? phone, DateTime? dateOfBirth});

  /// Changes the user's password credential.
  Future<Either<Failure, void>> changePassword({required String currentPassword, required String newPassword});

  /// Queries all registered active device sessions for this user.
  Future<Either<Failure, List<SessionDeviceEntity>>> getSessions();

  /// Terminates a specific device session.
  Future<Either<Failure, void>> revokeSession(String id);

  /// Force terminates all active device sessions for the current account.
  Future<Either<Failure, void>> revokeAllSessions();

  /// Retrieves all electric vehicles registered under this user account.
  Future<Either<Failure, List<VehicleEntity>>> getVehicles();

  /// Adds a new electric vehicle configuration.
  Future<Either<Failure, VehicleEntity>> addVehicle({
    required String plateNumber,
    required String model,
    required String brand,
    required String connectorType,
    required double batteryCapacityKwh,
  });

  /// Updates details for an existing vehicle configuration.
  Future<Either<Failure, VehicleEntity>> updateVehicle(
    String id, {
    String? plateNumber,
    String? model,
    String? brand,
    String? connectorType,
    double? batteryCapacityKwh,
  });

  /// Deletes a registered vehicle configuration from the user's profile.
  Future<Either<Failure, void>> deleteVehicle(String id);

  /// Configures a targeted vehicle as the default primary option.
  Future<Either<Failure, void>> setPrimaryVehicle(String id);

  /// Registers or modifies the AutoCharge MAC address for a vehicle.
  Future<Either<Failure, void>> setAutoCharge(String id, String macAddress);
}
