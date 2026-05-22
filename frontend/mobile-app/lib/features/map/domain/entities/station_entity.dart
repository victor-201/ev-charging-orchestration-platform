import 'package:equatable/equatable.dart';

/// Charging Station and Tariffs Domain Entities
///
/// Encapsulates spatial coordinate bounds, live charger specs, and pricing structures
/// mapped from the backend EV Infrastructure Services layer.
class StationEntity extends Equatable {
  final String id;
  final String name;
  final String address;
  final double latitude;
  final double longitude;
  final String status;
  final List<ChargerEntity> chargers;
  final int totalChargers;
  final int availableChargers;
  final double? distanceKm;

  const StationEntity({
    required this.id,
    required this.name,
    required this.address,
    required this.latitude,
    required this.longitude,
    required this.status,
    required this.chargers,
    this.totalChargers = 0,
    this.availableChargers = 0,
    this.distanceKm,
  });

  @override
  List<Object?> get props => [id, name, latitude, longitude, status, totalChargers, availableChargers, chargers];
}

/// Individual charger point representation mapping operational states (AVAILABLE, IN_USE, etc.).
class ChargerEntity extends Equatable {
  final String id;
  final String name;
  final String status; // AVAILABLE | IN_USE | RESERVED | OFFLINE | FAULTED
  final String connectorType; // CCS | CHAdeMO | Type2 | GB/T | Other
  final double powerKw;
  final double? pricePerKwh;
  final String? connectorId;

  const ChargerEntity({
    required this.id,
    required this.name,
    required this.status,
    required this.connectorType,
    required this.powerKw,
    this.pricePerKwh,
    this.connectorId,
  });

  @override
  List<Object?> get props => [id, status, connectorType, powerKw, pricePerKwh, connectorId];
}

/// Charging pricing tariff representation containing base energy cost and idle fees.
class PricingEntity extends Equatable {
  final String chargerId;
  final double pricePerKwh;
  final double? idleFeePerMinute;
  final double? totalEstimateVnd;

  const PricingEntity({
    required this.chargerId,
    required this.pricePerKwh,
    this.idleFeePerMinute,
    this.totalEstimateVnd,
  });

  @override
  List<Object?> get props => [chargerId, pricePerKwh, idleFeePerMinute, totalEstimateVnd];
}
