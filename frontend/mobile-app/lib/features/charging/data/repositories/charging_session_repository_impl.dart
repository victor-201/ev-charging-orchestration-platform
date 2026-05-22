import 'dart:async';
import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import 'package:web_socket_channel/io.dart';
import '../../domain/entities/charging_session_entity.dart';
import '../../domain/repositories/i_charging_session_repository.dart';
import '../../../../core/constants/api_paths.dart';
import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failures.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/config/app_config.dart';

class ChargingSessionModel extends ChargingSessionEntity {
  const ChargingSessionModel({
    required super.id,
    required super.chargerId,
    required super.status,
    required super.energyKwh,
    required super.socPercent,
    required super.powerW,
    required super.amountDue,
    required super.startedAt,
    super.endedAt,
    super.transactionId,
  });

  factory ChargingSessionModel.fromJson(Map<String, dynamic> json) {
    return ChargingSessionModel(
      id: json['id']?.toString() ?? '',
      chargerId: json['chargerId']?.toString() ?? '',
      status: json['status']?.toString() ?? 'INITIATED',
      energyKwh: (json['energyKwh'] as num?)?.toDouble() ?? 0,
      socPercent: (json['socPercent'] as num?)?.toDouble() ?? 0,
      powerW: (json['powerW'] as num?)?.toDouble() ?? 0,
      amountDue: (json['amountDue'] as num?)?.toDouble() ?? 0,
      startedAt: json['startedAt'] != null
          ? DateTime.parse(json['startedAt'].toString())
          : DateTime.now(),
      endedAt: json['endedAt'] != null
          ? DateTime.parse(json['endedAt'].toString())
          : null,
      transactionId: json['transactionId']?.toString(),
    );
  }
}

class ChargingSessionRepositoryImpl
    implements IChargingSessionRepository {
  final DioClient _client;
  IOWebSocketChannel? _wsChannel;
  StreamSubscription? _wsSubscription;

  ChargingSessionRepositoryImpl({required DioClient client})
      : _client = client;

  @override
  Future<Either<Failure, ChargingSessionEntity>> startSession({
    required String chargerId,
    String? bookingId,
    String? qrToken,
  }) async {
    try {
      final response = await _client.post(
        ApiPaths.startSession,
        // POST /charging/start: chargerId required, bookingId and qrToken optional
        data: {
          'chargerId': chargerId,
          if (bookingId != null) 'bookingId': bookingId,
          if (qrToken != null) 'qrToken': qrToken,
        },
        withIdempotency: true,
      );
      // Response may be flat or wrapped in data
      final raw = response.data;
      final data = raw is Map<String, dynamic>
          ? ((raw['data'] as Map<String, dynamic>?) ?? raw)
          : <String, dynamic>{};
      return Right(ChargingSessionModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, ChargingSessionEntity>> stopSession(
      String sessionId) async {
    try {
      final response = await _client.post(
        ApiPaths.stopSession(sessionId),
        withIdempotency: true,
      );
      final data = response.data['data'] as Map<String, dynamic>? ?? {};
      return Right(ChargingSessionModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, ChargingSessionEntity>> getActiveSession(
      String sessionId) async {
    try {
      final response =
          await _client.get(ApiPaths.chargingSessionById(sessionId));
      final data = response.data['data'] as Map<String, dynamic>? ?? {};
      return Right(ChargingSessionModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, List<ChargingSessionEntity>>> getSessionHistory({
    int? limit,
    int? offset,
  }) async {
    try {
      final response = await _client.get(
        ApiPaths.chargingHistory,
        // GET /charging/history uses offset-based pagination
        queryParameters: {
          if (limit != null) 'limit': limit,
          if (offset != null) 'offset': offset,
        },
      );
      final raw = response.data;
      final list = raw is List
          ? raw
          : (raw is Map ? (raw['data'] as List<dynamic>? ?? []) : <dynamic>[]);
      return Right(list
          .map((e) => ChargingSessionModel.fromJson(e as Map<String, dynamic>))
          .toList());
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  void connectTelemetry({
    required String chargerId,
    required void Function(TelemetryData) onData,
  }) {
    final wsUrl =
        '${AppConfig.current.wsBaseUrl}/sessions/$chargerId/telemetry';
    _wsChannel = IOWebSocketChannel.connect(wsUrl);
    _wsSubscription = _wsChannel!.stream.listen((raw) {
      try {
        // Stream raw real-time OCPP energy counts based on §3.5 standards
        final json = raw as Map<String, dynamic>;
        onData(TelemetryData(
          chargerId: json['chargerId']?.toString() ?? chargerId,
          powerW: (json['powerW'] as num?)?.toDouble() ?? 0,
          socPercent: (json['socPercent'] as num?)?.toDouble() ?? 0,
          energyKwh: (json['energyKwh'] as num?)?.toDouble() ?? 0,
          amountDue: (json['amountDue'] as num?)?.toDouble() ?? 0,
          timestamp: DateTime.now(),
        ));
      } catch (_) {}
    });
  }

  @override
  void disconnectTelemetry() {
    _wsSubscription?.cancel();
    _wsChannel?.sink.close();
    _wsChannel = null;
  }
}
