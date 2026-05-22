import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import '../../domain/entities/booking_entity.dart';
import '../../domain/repositories/i_booking_repository.dart';
import '../../../../core/constants/api_paths.dart';
import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failures.dart';
import '../../../../core/network/dio_client.dart';

class BookingModel extends BookingEntity {
  const BookingModel({
    required super.id,
    required super.chargerId,
    required super.stationId,
    required super.connectorType,
    required super.startTime,
    required super.endTime,
    required super.status,
    required super.depositAmount,
    super.qrToken,
    super.penaltyAmount,
    super.refundAmount,
  });

  factory BookingModel.fromJson(Map<String, dynamic> json) {
    return BookingModel(
      id: json['id']?.toString() ?? '',
      chargerId: json['chargerId']?.toString() ?? '',
      stationId: json['stationId']?.toString() ?? '',
      connectorType: json['connectorType']?.toString() ?? '',
      startTime: DateTime.parse(json['startTime'].toString()),
      endTime: DateTime.parse(json['endTime'].toString()),
      status: (json['status']?.toString() ?? 'PENDING_PAYMENT')
          .toUpperCase()
          .replaceAll('-', '_'),
      // PostgreSQL NUMERIC columns are serialised as Strings in JSON
      // (e.g. "50000") to preserve precision — parse safely with tryParse.
      depositAmount: _parseNum(json['depositAmount']) ?? 0,
      qrToken: json['qrToken']?.toString(),
      penaltyAmount: _parseNum(json['penaltyAmount']),
      refundAmount: _parseNum(json['refundAmount']),
    );
  }

  /// Safely converts a value that may be a [num] or a [String] to [double].
  static double? _parseNum(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }
}

class BookingRepositoryImpl implements IBookingRepository {
  final DioClient _client;

  BookingRepositoryImpl({required DioClient client}) : _client = client;

  @override
  Future<Either<Failure, List<AvailabilitySlotEntity>>> getAvailability({
    required String chargerId,
    required DateTime date,
  }) async {
    try {
      // ignore: avoid_print
      print('=== [DEBUG] getAvailability CALLED WITH: chargerId = "$chargerId", date = "$date" ===');
      final response = await _client.get(
        ApiPaths.bookingAvailability,
        queryParameters: {
          'chargerId': chargerId,
          // API expects YYYY-MM-DD format
          'date': date.toIso8601String().split('T')[0],
        },
      );
      // GET /bookings/availability returns a list of slots containing startTime, endTime, and isBooked
      final raw = response.data;
      final list = raw is List
          ? raw
          : (raw is Map ? (raw['data'] as List<dynamic>? ?? []) : <dynamic>[]);
      return Right(list.map((s) {
        final m = s as Map<String, dynamic>;
        DateTime slotStart;
        DateTime slotEnd;

        if (m.containsKey('startTime')) {
          slotStart = DateTime.parse(m['startTime'].toString()).toLocal();
          slotEnd = m.containsKey('endTime')
              ? DateTime.parse(m['endTime'].toString()).toLocal()
              : slotStart.add(const Duration(minutes: 30));
        } else {
          // Fallback to slot: "08:00" format
          final slotStr = m['slot']?.toString() ?? '00:00';
          final parts = slotStr.split(':');
          final slotHour = int.tryParse(parts[0]) ?? 0;
          final slotMin = int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0;
          slotStart = DateTime(
            date.year, date.month, date.day, slotHour, slotMin);
          slotEnd = slotStart.add(const Duration(minutes: 30));
        }

        return AvailabilitySlotEntity(
          startTime: slotStart,
          endTime: slotEnd,
          // API field is "isBooked" (not "isAvailable")
          isAvailable: m['isBooked'] != true,
        );
      }).toList());
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, List<BookingEntity>>> getMyBookings() async {
    try {
      final response = await _client.get(ApiPaths.myBookings);
      // GET /bookings/me returns { items: [...], total: number }
      final raw = response.data;
      final List<dynamic> list = raw is Map
          ? ((raw['items'] ?? raw['data']) as List<dynamic>? ?? [])
          : (raw is List ? raw : []);
      return Right(list
          .map((e) => BookingModel.fromJson(e as Map<String, dynamic>))
          .toList());
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, BookingEntity>> createBooking({
    required String chargerId,
    required String stationId,
    required String connectorType,
    required DateTime startTime,
    required DateTime endTime,
  }) async {
    try {
      final response = await _client.post(
        ApiPaths.bookings,
        data: {
          'chargerId': chargerId,
          'stationId': stationId,
          'connectorType': connectorType,
          'startTime': startTime.toIso8601String(),
          'endTime': endTime.toIso8601String(),
        },
        withIdempotency: true,
      );
      // POST /bookings returns the booking object directly (not wrapped in data)
      final raw = response.data;
      final data = raw is Map<String, dynamic>
          ? ((raw['data'] as Map<String, dynamic>?) ?? raw)
          : <String, dynamic>{};
      return Right(BookingModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, BookingEntity>> getBookingById(String id) async {
    try {
      final response = await _client.get(ApiPaths.bookingById(id));
      // GET /bookings/:id returns the booking object directly (not wrapped in data)
      final raw = response.data;
      final data = raw is Map<String, dynamic>
          ? ((raw['data'] as Map<String, dynamic>?) ?? raw)
          : <String, dynamic>{};
      return Right(BookingModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> cancelBooking(String id) async {
    try {
      await _client.delete(ApiPaths.bookingById(id));
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> joinQueue(String chargerId) async {
    try {
      await _client.post(ApiPaths.queue,
          data: {'chargerId': chargerId}, withIdempotency: true);
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, void>> leaveQueue(String chargerId) async {
    try {
      await _client.delete(ApiPaths.leaveQueue(chargerId));
      return const Right(null);
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, QueuePositionEntity>> getQueuePosition(
      String chargerId) async {
    try {
      final response =
          await _client.get(ApiPaths.queuePosition(chargerId));
      final data = response.data['data'] as Map<String, dynamic>? ?? {};
      final position = (data['position'] as num?)?.toInt() ?? 0;
      return Right(QueuePositionEntity(
        position: position,
        estimatedWaitMinutes: position * 45, // Backend logic: position × 45
      ));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }
}
