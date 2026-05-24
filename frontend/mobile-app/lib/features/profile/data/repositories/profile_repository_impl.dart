import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import '../../domain/entities/profile_entity.dart';
import '../../domain/repositories/i_profile_repository.dart';
import '../../../../core/constants/api_paths.dart';
import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failures.dart';
import '../../../../core/network/dio_client.dart';

class ProfileRepositoryImpl implements IProfileRepository {
  final DioClient _client;
  ProfileRepositoryImpl({required DioClient client}) : _client = client;

  /// Extracts the payload from either a flat `{key:val}` or wrapped `{data:{key:val}}` response.
  static Map<String, dynamic> _extract(dynamic responseData) {
    if (responseData is Map<String, dynamic>) {
      final inner = responseData['data'];
      if (inner is Map<String, dynamic>) return inner;
      return responseData;
    }
    return {};
  }

  UserProfileEntity _parseProfile(Map<String, dynamic> d) => UserProfileEntity(
        // API may return userId or id
        id: (d['userId'] ?? d['id'])?.toString() ?? '',
        email: d['email']?.toString() ?? '',
        fullName: d['fullName']?.toString() ?? '',
        phone: d['phone']?.toString(),
        dateOfBirth: d['dateOfBirth'] != null
            ? DateTime.tryParse(d['dateOfBirth'].toString())
            : null,
        role: d['role']?.toString() ?? 'user',
        mfaEnabled: d['mfaEnabled'] == true,
        status: d['status']?.toString(),
        emailVerified: d['emailVerified'] == true,
        avatarUrl: d['avatarUrl']?.toString(),
        address: d['address']?.toString(),
        hasArrears: d['hasOutstandingDebt'] == true || d['hasArrears'] == true,
        arrearsAmount: d['arrearsAmount'] != null
            ? (double.tryParse(d['arrearsAmount'].toString()) ?? 0.0)
            : 0.0,
      );

  VehicleEntity _parseVehicle(Map<String, dynamic> d) => VehicleEntity(
    id: d['id']?.toString() ?? '',
    plateNumber: d['plateNumber']?.toString() ?? '',
    // API field is "modelName", not "model"
    modelName: (d['modelName'] ?? d['model'])?.toString() ?? '',
    brand: d['brand']?.toString() ?? '',
    year: (d['year'] as num?)?.toInt() ?? DateTime.now().year,
    color: d['color']?.toString() ?? '',
    connectorType: d['connectorType']?.toString() ?? 'Other',
    batteryCapacityKwh: (d['batteryCapacityKwh'] as num?)?.toDouble() ?? 0,
    isPrimary: d['isPrimary'] == true,
    // AutoCharge fields
    macAddress: d['macAddress']?.toString(),
    vinNumber: d['vinNumber']?.toString(),
    autochargeEnabled: d['autochargeEnabled'] == true,
  );

  @override
  Future<Either<Failure, UserProfileEntity>> getMe() async {
    try {
      // GET /api/v1/users/me — returns full profile (not /auth/me which returns only id/email/roles)
      final r = await _client.get(ApiPaths.userProfile);
      return Right(_parseProfile(_extract(r.data)));
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, UserProfileEntity>> getProfile() async {
    try {
      final r = await _client.get(ApiPaths.userProfile);
      return Right(_parseProfile(_extract(r.data)));
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, UserProfileEntity>> updateProfile({
    String? avatarUrl,
    String? address,
  }) async {
    try {
      // PATCH /api/v1/users/me only accepts avatarUrl and address
      final r = await _client.patch(ApiPaths.userProfile, data: {
        if (avatarUrl != null) 'avatarUrl': avatarUrl,
        if (address != null) 'address': address,
      });
      return Right(_parseProfile(_extract(r.data)));
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, void>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      await _client.patch(ApiPaths.changePassword, data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      });
      return const Right(null);
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, List<SessionDeviceEntity>>> getSessions() async {
    try {
      final r = await _client.get(ApiPaths.sessions);
      // Response is an array directly or wrapped in data
      final raw = r.data;
      final List<dynamic> list = raw is List
          ? raw
          : (raw is Map ? (raw['data'] as List<dynamic>? ?? []) : []);
      return Right(list.map((e) {
        final d = e as Map<String, dynamic>;
        return SessionDeviceEntity(
          id: d['id']?.toString() ?? '',
          // API returns "ip" not "ipAddress"
          ipAddress: (d['ip'] ?? d['ipAddress'])?.toString() ?? '',
          userAgent: d['userAgent']?.toString() ?? '',
          createdAt: d['createdAt'] != null
              ? DateTime.parse(d['createdAt'].toString())
              : DateTime.now(),
          isCurrentSession: d['isCurrent'] == true,
        );
      }).toList());
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, void>> revokeSession(String id) async {
    try { await _client.delete(ApiPaths.sessionById(id)); return const Right(null); }
    on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, void>> revokeAllSessions() async {
    try { await _client.delete(ApiPaths.sessions); return const Right(null); }
    on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, List<VehicleEntity>>> getVehicles() async {
    try {
      final r = await _client.get(ApiPaths.vehicles);
      // GET /users/me/vehicles returns array directly or { data: [] }
      final raw = r.data;
      final List<dynamic> list = raw is List
          ? raw
          : (raw is Map ? (raw['data'] as List<dynamic>? ?? []) : []);
      return Right(list.map((e) => _parseVehicle(e as Map<String, dynamic>)).toList());
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, VehicleEntity>> addVehicle({
    required String brand,
    required String modelName,
    required int year,
    required String plateNumber,
    required String color,
    required double batteryCapacityKwh,
    String? macAddress,
    String? vinNumber,
  }) async {
    try {
      // POST /api/v1/users/me/vehicles — required: brand, modelName, year, plateNumber, color, batteryCapacityKwh
      final r = await _client.post(ApiPaths.vehicles, data: {
        'brand': brand,
        'modelName': modelName,
        'year': year,
        'plateNumber': plateNumber,
        'color': color,
        'batteryCapacityKwh': batteryCapacityKwh,
        if (macAddress != null) 'macAddress': macAddress,
        if (vinNumber != null) 'vinNumber': vinNumber,
      });
      final data = _extract(r.data);
      return Right(_parseVehicle(data));
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, VehicleEntity>> updateVehicle(
    String id, {
    String? color,
  }) async {
    try {
      // PATCH /api/v1/users/me/vehicles/:id — only accepts color
      final r = await _client.patch(ApiPaths.vehicleById(id), data: {
        if (color != null) 'color': color,
      });
      final data = _extract(r.data);
      return Right(_parseVehicle(data));
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, void>> deleteVehicle(String id) async {
    try { await _client.delete(ApiPaths.vehicleById(id)); return const Right(null); }
    on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, void>> setPrimaryVehicle(String id) async {
    try {
      // PATCH /api/v1/users/me/vehicles/:id/primary
      await _client.patch(ApiPaths.vehiclePrimary(id));
      return const Right(null);
    }
    on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, VehicleEntity>> setAutoCharge(
    String vehicleId, {
    String? macAddress,
    String? vinNumber,
    bool? autochargeEnabled,
  }) async {
    try {
      // PATCH /api/v1/users/me/vehicles/:id/autocharge-setup
      final r = await _client.patch(ApiPaths.vehicleAutocharge(vehicleId), data: {
        if (macAddress != null) 'macAddress': macAddress,
        if (vinNumber != null) 'vinNumber': vinNumber,
        if (autochargeEnabled != null) 'autochargeEnabled': autochargeEnabled,
      });
      final data = _extract(r.data);
      return Right(_parseVehicle(data));
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, List<AuditLogEntity>>> getAuditLogs({int limit = 20}) async {
    try {
      final r = await _client.get(
        ApiPaths.userAuditLogs,
        queryParameters: {'limit': limit},
      );
      final raw = r.data;
      final List<dynamic> list = raw is List
          ? raw
          : (raw is Map ? (raw['data'] as List<dynamic>? ?? []) : []);
      
      return Right(list.map((e) {
        final d = e as Map<String, dynamic>;
        return AuditLogEntity(
          action: d['action']?.toString() ?? '',
          changedAt: d['changedAt'] != null
              ? DateTime.parse(d['changedAt'].toString())
              : (d['createdAt'] != null ? DateTime.parse(d['createdAt'].toString()) : DateTime.now()),
          details: d['details'] is Map<String, dynamic>
              ? d['details'] as Map<String, dynamic>
              : <String, dynamic>{},
        );
      }).toList());
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, List<AuditLogEntity>>> getVehicleAuditLogs(String vehicleId, {int limit = 20}) async {
    try {
      final r = await _client.get(
        ApiPaths.vehicleAudit(vehicleId),
        queryParameters: {'limit': limit},
      );
      final raw = r.data;
      final List<dynamic> list = raw is List
          ? raw
          : (raw is Map ? (raw['data'] as List<dynamic>? ?? []) : []);
      
      return Right(list.map((e) {
        final d = e as Map<String, dynamic>;
        return AuditLogEntity(
          action: d['action']?.toString() ?? '',
          changedAt: d['changedAt'] != null
              ? DateTime.parse(d['changedAt'].toString())
              : (d['createdAt'] != null ? DateTime.parse(d['createdAt'].toString()) : DateTime.now()),
          details: d['details'] is Map<String, dynamic>
              ? d['details'] as Map<String, dynamic>
              : <String, dynamic>{},
        );
      }).toList());
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, Map<String, dynamic>>> setupMfa() async {
    try {
      final r = await _client.post(ApiPaths.mfaSetup);
      final data = _extract(r.data);
      return Right(data);
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, List<String>>> verifyAndEnableMfa(String token) async {
    try {
      final r = await _client.post(
        ApiPaths.mfaVerify,
        data: {'token': token},
      );
      final data = _extract(r.data);
      final backupCodes = (data['backupCodes'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList();
      return Right(backupCodes);
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }

  @override
  Future<Either<Failure, void>> disableMfa(String password) async {
    try {
      await _client.post(
        ApiPaths.mfaDisable,
        data: {'password': password},
      );
      return const Right(null);
    } on DioException catch (e) { return Left(ErrorMapper.fromDioException(e)); }
  }
}
