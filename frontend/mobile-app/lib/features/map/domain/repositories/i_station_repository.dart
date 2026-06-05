import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/station_entity.dart';

/// Charging Station Operations Repository Interface
///
/// Defines the data-layer contract for fetching stations.
/// The primary map-display flow uses [getAllStations] once on init and
/// never calls the network again for pan / zoom — filtering is done locally.
abstract class IStationRepository {
  /// Fetches ALL charging stations without geographic filter.
  ///
  /// Used on initial map load to populate the full in-memory station cache.
  /// Passes limit=1000 internally; server enforces @Max(1000).
  Future<Either<Failure, List<StationEntity>>> getAllStations();

  /// Fetches charging stations within a specific coordinate bounding circle.
  ///
  /// Kept for optional geo-filtered use-cases (e.g. nearby endpoint).
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

  /// Resolves station details containing the given charger.
  Future<Either<Failure, StationEntity>> getStationByChargerId(String chargerId);

  /// Resolves stations containing any of the given charger IDs (batch lookup).
  Future<Either<Failure, List<StationEntity>>> getStationsByChargerIds(List<String> chargerIds);

  /// Searches for charging stations matching a keyword query (name or address).
  /// Optionally filter by [connectorType] — pushed to the server so [limit] is applied
  /// only to stations that already have the requested connector type.
  Future<Either<Failure, List<StationEntity>>> searchStations(
    String keyword, {
    int limit = 8,
    String? connectorType,
  });

  /// Fetches an AI optimal charging point recommendation based on user location.
  Future<Either<Failure, StationEntity>> suggestOptimalStation({
    required double lat,
    required double lng,
    String? connectorType,
    String? preference,
  });
}
