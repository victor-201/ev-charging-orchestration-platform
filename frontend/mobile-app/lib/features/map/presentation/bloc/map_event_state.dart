import 'package:equatable/equatable.dart';
import '../../domain/entities/station_entity.dart';

/// Geospatial Mapping Events and States Contracts
///
/// Models all map events (station queries, map pan movements, filtering triggers)
/// and matching states representing station lists, route details, and user coordinates.
abstract class MapEvent extends Equatable {
  const MapEvent();
  @override
  List<Object?> get props => [];
}

class MapLoadStations extends MapEvent {
  final double lat;
  final double lng;
  final double radiusKm;
  final String? connectorType;
  final String? statusFilter;

  const MapLoadStations({
    required this.lat,
    required this.lng,
    required this.radiusKm,
    this.connectorType,
    this.statusFilter,
  });

  @override
  List<Object?> get props => [lat, lng, radiusKm, connectorType, statusFilter];
}

class MapStationTapped extends MapEvent {
  final String stationId;
  const MapStationTapped({required this.stationId});
  @override
  List<Object?> get props => [stationId];
}

class MapLocationUpdated extends MapEvent {
  final double lat;
  final double lng;
  const MapLocationUpdated({required this.lat, required this.lng});
  @override
  List<Object?> get props => [lat, lng];
}

class MapFilterChanged extends MapEvent {
  final String? connectorType;
  final String? statusFilter;
  final double? radiusKm;
  const MapFilterChanged({
    this.connectorType,
    this.statusFilter,
    this.radiusKm,
  });
  @override
  List<Object?> get props => [connectorType, statusFilter, radiusKm];
}

/// Base state model for the Map BLoC architecture.
abstract class MapState extends Equatable {
  const MapState();
  @override
  List<Object?> get props => [];
}

class MapInitial extends MapState {
  const MapInitial();
}

class MapLoading extends MapState {
  const MapLoading();
}

class MapLoaded extends MapState {
  final List<StationEntity> stations;
  final StationEntity? selectedStation;
  final double userLat;
  final double userLng;
  final String? activeConnectorFilter;
  final String? activeStatusFilter;
  final double radiusKm;

  const MapLoaded({
    required this.stations,
    this.selectedStation,
    required this.userLat,
    required this.userLng,
    this.activeConnectorFilter,
    this.activeStatusFilter,
    this.radiusKm = 5.0,
  });

  @override
  List<Object?> get props => [
        stations,
        selectedStation,
        userLat,
        userLng,
        activeConnectorFilter,
        activeStatusFilter,
        radiusKm,
      ];

  MapLoaded copyWith({
    List<StationEntity>? stations,
    StationEntity? selectedStation,
    double? userLat,
    double? userLng,
    String? activeConnectorFilter,
    String? activeStatusFilter,
    double? radiusKm,
    bool clearSelectedStation = false,
  }) {
    return MapLoaded(
      stations: stations ?? this.stations,
      selectedStation:
          clearSelectedStation ? null : (selectedStation ?? this.selectedStation),
      userLat: userLat ?? this.userLat,
      userLng: userLng ?? this.userLng,
      activeConnectorFilter:
          activeConnectorFilter ?? this.activeConnectorFilter,
      activeStatusFilter: activeStatusFilter ?? this.activeStatusFilter,
      radiusKm: radiusKm ?? this.radiusKm,
    );
  }
}

class MapError extends MapState {
  final String message;
  const MapError({required this.message});
  @override
  List<Object?> get props => [message];
}
