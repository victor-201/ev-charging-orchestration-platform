import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/station_entity.dart';

/// Charging Station Operations Repository Interface
///
/// Defines the data-layer contract for fetching stations in a geospatial radius,
/// resolving detailed station profiles, querying dynamic connector pricing,
/// and searching stations by keyword match.
abstract class IStationRepository {
  /// Fetches charging stations within a specific coordinate bounding circle.
  Future<Either<Failure, List<StationEntity>>> getStations({
    required double lat,
    required double lng,
    required double radiusKm,
    String? connectorType,
    String? status,
  });

  /// Resolves detailed metadata and live status for a single station.
  Future<Either<Failure, StationEntity>> getStationById(String id);

  /// Queries the active billing tariffs and dynamic pricing for a given connector.
  Future<Either<Failure, PricingEntity>> getChargerPricing({
    required String stationId,
    required String chargerId,
    required String connectorType,
    required DateTime startTime,
    required DateTime endTime,
  });

  /// Searches for charging stations matching a keyword query (name or address).
  ///
  /// Leverages case-insensitive SQL matching, capped at a custom results [limit].
  Future<Either<Failure, List<StationEntity>>> searchStations(
    String keyword, {
    int limit = 8,
  });
}
