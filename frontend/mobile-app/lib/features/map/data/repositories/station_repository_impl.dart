import 'package:dartz/dartz.dart';
import 'package:dio/dio.dart';
import '../../domain/entities/station_entity.dart';
import '../../domain/repositories/i_station_repository.dart';
import '../../../../core/constants/api_paths.dart';
import '../../../../core/errors/error_mapper.dart';
import '../../../../core/errors/failures.dart';
import '../../../../core/network/dio_client.dart';

/// Charging Infrastructure Station Data Models
///
/// Handles JSON deserialization schemas and remote HTTP requests mapping EV charging stations,
/// charger connector types, and calculated session estimation tariffs.
class StationModel extends StationEntity {
  const StationModel({
    required super.id,
    required super.name,
    required super.address,
    required super.latitude,
    required super.longitude,
    required super.status,
    required super.chargers,
    super.totalChargers,
    super.availableChargers,
    super.distanceKm,
    super.suggestedChargerId,
    super.suggestedConnectorType,
    super.suggestedMaxPowerKw,
    super.suggestedEstimatedPriceVnd,
    super.suggestedScore,
  });

  factory StationModel.fromJson(Map<String, dynamic> json) {
    final chargerList = (json['chargers'] as List<dynamic>? ?? [])
        .map((c) => ChargerModel.fromJson(c as Map<String, dynamic>))
        .toList();
    return StationModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      address: json['address']?.toString() ?? '',
      latitude:
          (json['latitude'] as num?)?.toDouble() ??
          (json['lat'] as num?)?.toDouble() ??
          0,
      longitude:
          (json['longitude'] as num?)?.toDouble() ??
          (json['lng'] as num?)?.toDouble() ??
          0,
      status: json['status']?.toString() ?? 'OFFLINE',
      chargers: chargerList,
      totalChargers: (json['totalChargers'] as num?)?.toInt() ?? 0,
      availableChargers: (json['availableChargers'] as num?)?.toInt() ?? 0,
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
    );
  }
}

class ChargerModel extends ChargerEntity {
  const ChargerModel({
    required super.id,
    required super.name,
    required super.status,
    required super.connectorType,
    required super.powerKw,
    super.pricePerKwh,
    super.connectorId,
  });

  factory ChargerModel.fromJson(Map<String, dynamic> json) {
    // Map the first connector variant in the array as the primary UI configuration.
    final connectors = json['connectors'] as List<dynamic>? ?? [];
    final firstConnectorId = connectors.isNotEmpty
        ? connectors[0]['id']?.toString()
        : null;
    final firstConnectorType = connectors.isNotEmpty
        ? connectors[0]['connectorType']?.toString() ?? 'Other'
        : 'Other';

    final connectorPowerKw = connectors.isNotEmpty
        ? (connectors[0]['maxPowerKw'] as num?)?.toDouble() ?? 0.0
        : 0.0;
        
    final chargerPowerKw = (json['maxPowerKw'] as num?)?.toDouble() ?? 0.0;

    return ChargerModel(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      status: json['status']?.toString() ?? 'OFFLINE',
      connectorType: firstConnectorType,
      powerKw: chargerPowerKw > 0 ? chargerPowerKw : connectorPowerKw,
      pricePerKwh: ((json['pricePerKwhVnd'] ?? json['pricePerKwh'] ?? json['price_per_kwh']) as num?)?.toDouble(),
      connectorId: firstConnectorId,
    );
  }
}

class PricingModel extends PricingEntity {
  const PricingModel({
    required super.chargerId,
    required super.pricePerKwh,
    super.idleFeePerMinute,
    super.totalEstimateVnd,
  });

  factory PricingModel.fromJson(Map<String, dynamic> json) {
    return PricingModel(
      chargerId: json['chargerId']?.toString() ?? '',
      // Support multiple key forms returned by backend pricing APIs (including Vnd suffixes)
      pricePerKwh: ((json['pricePerKwhVnd'] ?? json['pricePerKwh'] ?? json['price_per_kwh_snapshot'] ?? json['price_per_kwh']) as num?)?.toDouble() ?? 0,
      idleFeePerMinute: ((json['idleFeePerMinuteVnd'] ?? json['idleFeePerMinute'] ?? json['idle_fee_per_minute']) as num?)?.toDouble(),
      totalEstimateVnd: ((json['estimatedTotalVnd'] ?? json['totalEstimateVnd'] ?? json['estimated_total_vnd'] ?? json['total_estimate_vnd']) as num?)?.toDouble(),
    );
  }
}

class StationRepositoryImpl implements IStationRepository {
  final DioClient _client;

  StationRepositoryImpl({required DioClient client}) : _client = client;

  @override
  Future<Either<Failure, List<StationEntity>>> getAllStations() async {
    try {
      final response = await _client.get(
        ApiPaths.stations,
        queryParameters: {'limit': 1000},
      );
      List<dynamic> list = [];
      if (response.data is List) {
        list = response.data as List<dynamic>;
      } else if (response.data is Map) {
        list = (response.data['items'] ?? response.data['data'] ?? []) as List<dynamic>;
      }
      return Right(
        list.map((e) => StationModel.fromJson(e as Map<String, dynamic>)).toList(),
      );
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, List<StationEntity>>> getStations({
    required double lat,
    required double lng,
    required double radiusKm,
    String? connectorType,
    String? status,
  }) async {
    try {
      // Use /stations/nearby endpoint ([36]) when coordinates are provided
      final response = await _client.get(
        ApiPaths.stationsNearby,
        queryParameters: {
          'lat': lat,
          'lng': lng,
          'radiusKm': radiusKm,
          'limit': 100,
          if (connectorType != null) 'connectorType': connectorType,
          if (status != null) 'status': status,
        },
      );
      List<dynamic> list = [];
      if (response.data is List) {
        list = response.data as List<dynamic>;
      } else if (response.data is Map) {
        list = (response.data['items'] ?? response.data['data'] ?? []) as List<dynamic>;
      }
      return Right(
        list.map((e) => StationModel.fromJson(e as Map<String, dynamic>)).toList(),
      );
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, StationEntity>> getStationById(String id) async {
    try {
      final response = await _client.get(ApiPaths.stationById(id));
      final data = response.data is Map<String, dynamic>
          ? (response.data['data'] ?? response.data) as Map<String, dynamic>
          : <String, dynamic>{};
      return Right(StationModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, StationEntity>> getStationByChargerId(String chargerId) async {
    try {
      final response = await _client.get(ApiPaths.stationByCharger(chargerId));
      final data = response.data is Map<String, dynamic>
          ? (response.data['data'] ?? response.data) as Map<String, dynamic>
          : <String, dynamic>{};
      return Right(StationModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, PricingEntity>> getChargerPricing({
    required String stationId,
    required String chargerId,
    required String connectorType,
    required DateTime startTime,
    required DateTime endTime,
  }) async {
    try {
      final response = await _client.get(
        ApiPaths.chargerPricing(stationId, chargerId),
        queryParameters: {
          'connectorType': connectorType,
          'startTime': startTime.toUtc().toIso8601String(),
          'endTime': endTime.toUtc().toIso8601String(),
        },
      );
      final data = response.data is Map<String, dynamic>
          ? (response.data['data'] ?? response.data) as Map<String, dynamic>
          : <String, dynamic>{};

      data['chargerId'] ??= chargerId;

      return Right(PricingModel.fromJson(data));
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, List<StationEntity>>> searchStations(
    String keyword, {
    int limit = 8,
    String? connectorType,
  }) async {
    if (keyword.trim().isEmpty) return const Right([]);
    try {
      final response = await _client.get(
        ApiPaths.stations,
        queryParameters: {
          'search': keyword.trim(),
          'limit': limit,
          if (connectorType != null) 'connectorType': connectorType,
        },
      );
      List<dynamic> list = [];
      if (response.data is List) {
        list = response.data as List<dynamic>;
      } else if (response.data is Map) {
        list =
            (response.data['items'] ?? response.data['data'] ?? [])
                as List<dynamic>;
      }
      return Right(
        list
            .map((e) => StationModel.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }

  @override
  Future<Either<Failure, StationEntity>> suggestOptimalStation({
    required double lat,
    required double lng,
    String? connectorType,
    String? preference,
  }) async {
    try {
      final response = await _client.get(
        ApiPaths.bookingSuggest,
        queryParameters: {
          'latitude': lat,
          'longitude': lng,
          if (connectorType != null) 'connectorType': connectorType,
          if (preference != null) 'preference': preference,
        },
      );
      List<dynamic> list = [];
      if (response.data is List) {
        list = response.data as List<dynamic>;
      } else if (response.data is Map) {
        list = (response.data['items'] ?? response.data['data'] ?? []) as List<dynamic>;
      }
      
      if (list.isEmpty) {
        return const Left(ServerFailure('Không tìm thấy gợi ý sạc tối ưu nào lúc này.'));
      }
      
      // Get top 1 suggested charger
      final topSuggestion = list[0] as Map<String, dynamic>;
      final chargerId = topSuggestion['chargerId']?.toString();
      if (chargerId == null || chargerId.isEmpty) {
        return const Left(ServerFailure('Dữ liệu gợi ý không hợp lệ.'));
      }
      
      // Fetch details of this optimal station containing the recommended charger
      final stationResult = await getStationByChargerId(chargerId);
      return stationResult.fold(
        (failure) => Left(failure),
        (station) {
          final model = StationModel(
            id: station.id,
            name: station.name,
            address: station.address,
            latitude: station.latitude,
            longitude: station.longitude,
            status: station.status,
            chargers: station.chargers,
            totalChargers: station.totalChargers,
            availableChargers: station.availableChargers,
            distanceKm: double.tryParse(topSuggestion['distanceKm']?.toString() ?? '') ?? station.distanceKm,
            suggestedChargerId: chargerId,
            suggestedConnectorType: topSuggestion['connectorType']?.toString() ?? connectorType,
            suggestedMaxPowerKw: double.tryParse(topSuggestion['maxPowerKw']?.toString() ?? ''),
            suggestedEstimatedPriceVnd: double.tryParse(topSuggestion['estimatedPriceVnd']?.toString() ?? ''),
            suggestedScore: double.tryParse(topSuggestion['score']?.toString() ?? ''),
          );
          return Right(model);
        },
      );
    } on DioException catch (e) {
      return Left(ErrorMapper.fromDioException(e));
    }
  }
}
