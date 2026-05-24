import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import '../../domain/entities/station_entity.dart';
import '../../domain/usecases/get_stations_usecase.dart';
import '../../domain/usecases/get_station_by_id_usecase.dart';

part 'map_event.dart';
part 'map_state.dart';

/// Helper to track loaded bounding circles in memory.
class LoadedRegion {
  final double lat;
  final double lng;
  final double radiusKm;

  const LoadedRegion({
    required this.lat,
    required this.lng,
    required this.radiusKm,
  });

  /// Checks if another circle (center [otherLat], [otherLng] and radius [otherRadiusKm])
  /// is fully contained within this circle using the triangle inequality:
  ///
  /// `Distance(CenterA, CenterB) + RadiusB <= RadiusA`
  bool containsCircle(double otherLat, double otherLng, double otherRadiusKm) {
    final distanceKm = Geolocator.distanceBetween(lat, lng, otherLat, otherLng) / 1000.0;
    return (distanceKm + otherRadiusKm) <= radiusKm;
  }
}

/// Geospatial Charging Hub Map BLoC
///
/// ## Hybrid Bounding-Circle Cache Architecture
///
/// Resolves station loading issues by combining dynamic, unlimited coordinate-based
/// backend loading with an in-memory geo-containment cache.
///
/// 1. Pan/zoom events trigger [MapLoadStations] with viewport center and computed radius.
/// 2. BLoC checks if the requested region is fully contained within a previously loaded region.
/// 3. **Cache Hit**: Instant local filter and render from `_allCachedStations`. Zero requests.
/// 4. **Cache Miss**: Fetch stations from backend `/stations` with `limit=1000` (unlimited).
/// 5. Results are merged into `_allCachedStations` and the new region is cached.
/// 6. Custom filters (e.g. connector type) are instantly applied locally on top of this cache.
class MapBloc extends Bloc<MapEvent, MapState> {
  final GetStationsUseCase _getStationsUseCase;
  final GetStationByIdUseCase _getStationByIdUseCase;

  /// Unified local cache of all loaded stations (indexed by ID).
  final Map<String, StationEntity> _allCachedStations = {};

  /// History of successfully loaded geographic circles.
  final List<LoadedRegion> _loadedRegions = [];

  static const double _defaultLat = 21.0285; // Hanoi
  static const double _defaultLng = 105.8542;

  double _userLat = _defaultLat;
  double _userLng = _defaultLng;

  MapBloc({
    required GetStationsUseCase getStationsUseCase,
    required GetStationByIdUseCase getStationByIdUseCase,
  })  : _getStationsUseCase = getStationsUseCase,
        _getStationByIdUseCase = getStationByIdUseCase,
        super(const MapInitial()) {
    on<MapLoadStations>(_onLoadStations);
    on<MapLocationUpdated>(_onLocationUpdated);
    on<MapStationTapped>(_onStationTapped);
    on<MapFilterChanged>(_onFilterChanged);

    // Initial default scan around current center
    add(const MapLoadStations(
      lat: _defaultLat,
      lng: _defaultLng,
      radiusKm: 15.0,
    ));
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  Future<void> _onLoadStations(
      MapLoadStations event, Emitter<MapState> emit) async {
    final current = state;
    final connector = event.connectorType ??
        (current is MapLoaded ? current.activeConnectorFilter : null);
    final status = event.statusFilter ??
        (current is MapLoaded ? current.activeStatusFilter : null);

    // 1. Check if the requested viewport is already cached in a loaded region
    bool isCached = false;
    for (final region in _loadedRegions) {
      if (region.containsCircle(event.lat, event.lng, event.radiusKm)) {
        isCached = true;
        break;
      }
    }

    if (isCached) {
      // Cache Hit: Render instantly from memory.
      final filtered = _applyFilters(
        _allCachedStations.values.toList(),
        connectorType: connector,
        statusFilter: status,
      );

      if (current is MapLoaded) {
        emit(current.copyWith(
          stations: filtered,
          activeConnectorFilter: connector,
          activeStatusFilter: status,
        ));
      } else {
        emit(MapLoaded(
          stations: filtered,
          userLat: _userLat,
          userLng: _userLng,
          activeConnectorFilter: connector,
          activeStatusFilter: status,
        ));
      }
      return;
    }

    // Cache Miss: Query the backend. Show spinner only if there's no cached data yet.
    if (_allCachedStations.isEmpty) {
      emit(const MapLoading());
    }

    final result = await _getStationsUseCase(
      lat: event.lat,
      lng: event.lng,
      radiusKm: event.radiusKm,
    );

    result.fold(
      (failure) {
        if (_allCachedStations.isNotEmpty) {
          // If we have cached data, swallow the network failure so the map remains usable.
          return;
        }
        emit(MapError(message: failure.message));
      },
      (stations) {
        // Merge results into unified cache
        for (final station in stations) {
          _allCachedStations[station.id] = station;
        }

        // Record the successfully loaded region
        _loadedRegions.add(LoadedRegion(
          lat: event.lat,
          lng: event.lng,
          radiusKm: event.radiusKm,
        ));

        // Filter and emit state
        final filtered = _applyFilters(
          _allCachedStations.values.toList(),
          connectorType: connector,
          statusFilter: status,
        );

        if (current is MapLoaded) {
          emit(current.copyWith(
            stations: filtered,
            activeConnectorFilter: connector,
            activeStatusFilter: status,
          ));
        } else {
          emit(MapLoaded(
            stations: filtered,
            userLat: _userLat,
            userLng: _userLng,
            activeConnectorFilter: connector,
            activeStatusFilter: status,
          ));
        }
      },
    );
  }

  void _onLocationUpdated(
      MapLocationUpdated event, Emitter<MapState> emit) {
    _userLat = event.lat;
    _userLng = event.lng;
    final current = state;
    if (current is MapLoaded) {
      emit(current.copyWith(userLat: event.lat, userLng: event.lng));
    }
  }

  Future<void> _onStationTapped(
      MapStationTapped event, Emitter<MapState> emit) async {
    final cached = _allCachedStations[event.stationId];
    if (cached != null) {
      final current = state;
      if (current is MapLoaded) {
        final updatedStations = List<StationEntity>.from(current.stations);
        if (!updatedStations.any((s) => s.id == cached.id)) {
          updatedStations.add(cached);
        }
        emit(current.copyWith(selectedStation: cached, stations: updatedStations));
      }
    }

    final result = await _getStationByIdUseCase(event.stationId);
    result.fold(
      (_) {},
      (station) {
        _allCachedStations[station.id] = station;
        final current = state;
        if (current is MapLoaded) {
          final updatedStations = List<StationEntity>.from(current.stations);
          final index = updatedStations.indexWhere((s) => s.id == station.id);
          if (index >= 0) {
            updatedStations[index] = station;
          } else {
            updatedStations.add(station);
          }
          emit(current.copyWith(selectedStation: station, stations: updatedStations));
        }
      },
    );
  }

  void _onFilterChanged(
      MapFilterChanged event, Emitter<MapState> emit) {
    final current = state;
    if (current is! MapLoaded) return;

    final filtered = _applyFilters(
      _allCachedStations.values.toList(),
      connectorType: event.connectorType,
      statusFilter: event.statusFilter,
    );

    emit(current.copyWith(
      stations: filtered,
      activeConnectorFilter: event.connectorType,
      activeStatusFilter: event.statusFilter,
    ));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /// Pure in-memory filter pass over [stations] for instant responsiveness.
  List<StationEntity> _applyFilters(
    List<StationEntity> stations, {
    String? connectorType,
    String? statusFilter,
  }) {
    var result = stations;
    if (connectorType != null) {
      result = result
          .where((s) => s.chargers.any((c) => c.connectorType == connectorType))
          .toList();
    }
    if (statusFilter != null) {
      result = result.where((s) => s.status == statusFilter).toList();
    }
    return result;
  }
}
