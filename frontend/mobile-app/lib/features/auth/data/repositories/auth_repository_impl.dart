import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import '../../domain/entities/user_entity.dart';
import '../../domain/repositories/i_auth_repository.dart';
import '../../../../core/constants/api_paths.dart';
import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failures.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/data/local/secure_storage_service.dart';

/// Remote data schema representing authenticated users
class UserModel extends UserEntity {
  const UserModel({
    required super.id,
    required super.email,
    required super.fullName,
    super.phone,
    super.dateOfBirth,
    required super.role,
    required super.mfaEnabled,
    required super.hasArrears,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      // API may return `userId` instead of `id`
      id: (json['userId'] ?? json['id'])?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      fullName: json['fullName']?.toString() ?? '',
      phone: json['phone']?.toString(),
      dateOfBirth: json['dateOfBirth'] != null
          ? DateTime.tryParse(json['dateOfBirth'].toString())
          : null,
      role: json['role']?.toString() ?? 'user',
      mfaEnabled: json['mfaEnabled'] == true,
      hasArrears: json['hasArrears'] == true || json['hasOutstandingDebt'] == true,
    );
  }
}

class AuthRepositoryImpl implements IAuthRepository {
  final DioClient _client;
  final SecureStorageService _storage;

  AuthRepositoryImpl({
    required DioClient client,
    required SecureStorageService storage,
  })  : _client = client,
        _storage = storage;

  /// Handles both `{ data: { ... } }` (wrapped) and `{ accessToken: ... }` (flat)
  /// response shapes returned by the IAM service.
  static Map<String, dynamic> _extractData(dynamic responseData) {
    if (responseData is Map<String, dynamic>) {
      final inner = responseData['data'];
      if (inner is Map<String, dynamic>) return inner;
      return responseData;
    }
    return {};
  }

  @override
  Future<Either<Failure, LoginResult>> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _client.post(
        ApiPaths.login,
        data: {'email': email, 'password': password},
      );
      final data = _extractData(response.data);

      if (data['mfaRequired'] == true) {
        return Right(const LoginResult(mfaRequired: true));
      }

      final accessToken = data['accessToken']?.toString() ?? '';
      final refreshToken = data['refreshToken']?.toString() ?? '';
      final userData = data['user'] as Map<String, dynamic>? ?? {};

      if (accessToken.isNotEmpty) await _storage.saveAccessToken(accessToken);
      if (refreshToken.isNotEmpty) await _storage.saveRefreshToken(refreshToken);

      return Right(LoginResult(
        accessToken: accessToken,
        refreshToken: refreshToken,
        mfaRequired: false,
        user: UserModel.fromJson(userData),
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, LoginResult>> verifyMfa({
    required String otpCode,
  }) async {
    try {
      final response = await _client.post(
        ApiPaths.mfaVerify,
        data: {'token': otpCode},
      );
      final data = _extractData(response.data);
      final accessToken = data['accessToken']?.toString() ?? '';
      final refreshToken = data['refreshToken']?.toString() ?? '';
      final userData = data['user'] as Map<String, dynamic>? ?? {};

      if (accessToken.isNotEmpty) await _storage.saveAccessToken(accessToken);
      if (refreshToken.isNotEmpty) await _storage.saveRefreshToken(refreshToken);

      return Right(LoginResult(
        accessToken: accessToken,
        refreshToken: refreshToken,
        mfaRequired: false,
        user: UserModel.fromJson(userData),
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, UserEntity>> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
    required DateTime dateOfBirth,
  }) async {
    try {
      final response = await _client.post(
        ApiPaths.register,
        data: {
          'email': email,
          'password': password,
          'fullName': fullName,
          if (phone != null) 'phone': phone,
          'dateOfBirth': dateOfBirth.toIso8601String(),
        },
      );
      final data = _extractData(response.data);
      return Right(UserModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, String>> refreshToken() async {
    try {
      final refresh = await _storage.getRefreshToken();
      if (refresh == null || refresh.isEmpty) {
        return const Left(UnauthorizedFailure());
      }
      final response = await _client.post(
        ApiPaths.refresh,
        data: {'refreshToken': refresh},
      );
      final data = _extractData(response.data);
      final accessToken = data['accessToken']?.toString() ?? '';
      if (accessToken.isNotEmpty) await _storage.saveAccessToken(accessToken);
      return Right(accessToken);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> logout() async {
    try {
      await _client.post(ApiPaths.logout);
      await _storage.clearAll();
      return const Right(null);
    } on DioException catch (e) {
      await _storage.clearAll();
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, UserEntity>> getMe() async {
    try {
      final response = await _client.get(ApiPaths.userProfile);
      final data = _extractData(response.data);
      return Right(UserModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, LoginResult>> verifyEmail({String? token, String? code}) async {
    try {
      final response = await _client.post(
        ApiPaths.verifyEmail,
        data: {
          if (token != null) 'token': token,
          if (code != null) 'code': code,
        },
      );
      final data = response.data['data'] as Map<String, dynamic>? ?? response.data as Map<String, dynamic>;
      final accessToken = data['accessToken']?.toString();
      final refreshToken = data['refreshToken']?.toString();

      if (accessToken != null && accessToken.isNotEmpty) {
        await _storage.saveAccessToken(accessToken);
      }
      if (refreshToken != null && refreshToken.isNotEmpty) {
        await _storage.saveRefreshToken(refreshToken);
      }

      return Right(LoginResult(
        accessToken: accessToken,
        refreshToken: refreshToken,
        mfaRequired: false,
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> resendVerification({required String email}) async {
    try {
      await _client.post(
        ApiPaths.resendVerification,
        data: {'email': email},
      );
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }
}
