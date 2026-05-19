import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import '../../domain/entities/notification_entity.dart';
import '../../domain/repositories/i_notification_repository.dart';
import '../../../../core/constants/api_paths.dart';
import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failures.dart';
import '../../../../core/network/dio_client.dart';

class NotificationRepositoryImpl implements INotificationRepository {
  final DioClient _client;
  NotificationRepositoryImpl({required DioClient client}) : _client = client;

  @override
  Future<Either<Failure, List<NotificationEntity>>> getNotifications({int limit = 20}) async {
    try {
      final res = await _client.get(ApiPaths.notifications, queryParameters: {'limit': limit});
      final list = res.data['data'] as List<dynamic>? ?? [];
      return Right(list.map((e) => _parse(e as Map<String, dynamic>)).toList());
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, int>> getUnreadCount() async {
    try {
      final res = await _client.get(ApiPaths.notificationsUnread);
      return Right((res.data['data']?['count'] as num?)?.toInt() ?? 0);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> markRead(String id) async {
    try {
      await _client.patch(ApiPaths.notificationRead(id));
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> markAllRead() async {
    try {
      await _client.patch(ApiPaths.notificationsReadAll);
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> registerDevice(String pushToken) async {
    try {
      await _client.post(ApiPaths.devicesRegister, data: {
        'pushToken': pushToken,
        'platform': 'android',
      });
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> unregisterDevice(String deviceId) async {
    try {
      await _client.delete(ApiPaths.deviceById(deviceId));
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, NotificationPreferencesEntity>> getPreferences() async {
    try {
      final res = await _client.get(ApiPaths.preferences);
      final d = res.data['data'] as Map<String, dynamic>? ?? {};
      return Right(NotificationPreferencesEntity(
        enablePush: d['enablePush'] == true,
        enableRealtime: d['enableRealtime'] == true,
        enableEmail: d['enableEmail'] == true,
        enableSms: d['enableSms'] == true,
        quietHoursStart: d['quietHoursStart']?.toString(),
        quietHoursEnd: d['quietHoursEnd']?.toString(),
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> updatePreferences(NotificationPreferencesEntity prefs) async {
    try {
      await _client.patch(ApiPaths.preferences, data: {
        'enablePush': prefs.enablePush,
        'enableRealtime': prefs.enableRealtime,
        'enableEmail': prefs.enableEmail,
        'enableSms': prefs.enableSms,
        if (prefs.quietHoursStart != null) 'quietHoursStart': prefs.quietHoursStart,
        if (prefs.quietHoursEnd != null) 'quietHoursEnd': prefs.quietHoursEnd,
      });
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  NotificationEntity _parse(Map<String, dynamic> d) => NotificationEntity(
    id: d['id']?.toString() ?? '',
    title: d['title']?.toString() ?? '',
    body: d['body']?.toString() ?? '',
    type: d['type']?.toString() ?? '',
    isRead: d['isRead'] == true,
    createdAt: d['createdAt'] != null ? DateTime.parse(d['createdAt'].toString()) : DateTime.now(),
    data: (d['data'] as Map<String, dynamic>?)?.map((k, v) => MapEntry(k, v.toString())),
  );
}
