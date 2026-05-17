import 'dart:async';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/repositories/i_station_repository.dart';
import 'map_event_state.dart';

/// Geospatial Charging Hub Map Business Logic Component (BLoC)
///
/// Orchestrates coordinate navigation states, searches within circular query radiuses,
/// applies connector type and status filters, and triggers interactive station detail overlays.
/// Leverages a 500ms debounce timer to prevent API request spamming during rapid map panning.
class MapBloc extends Bloc<MapEvent, MapState> {
  final IStationRepository _repository;
  Timer? _debounce;

  static const double _defaultLat = 21.0285; // Hanoi
  static const double _defaultLng = 105.8542;
  static const double _defaultRadius = 5.0; // km

  MapBloc({required IStationRepository repository})
      : _repository = repository,
        super(const MapInitial()) {
    on<MapLocationUpdated>(_onLocationUpdated);
    on<MapLoadStations>(_onLoadStations);
    on<MapStationTapped>(_onStationTapped);
    on<MapFilterChanged>(_onFilterChanged);
  }

  void _onLocationUpdated(
      MapLocationUpdated event, Emitter<MapState> emit) {
    _scheduleLoad(
      lat: event.lat,
      lng: event.lng,
      radiusKm: _defaultRadius,
      emit: emit,
    );
  }

  void _scheduleLoad({
    required double lat,
    required double lng,
    required double radiusKm,
    required Emitter<MapState> emit,
    String? connectorType,
    String? statusFilter,
  }) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      add(MapLoadStations(
        lat: lat,
        lng: lng,
        radiusKm: radiusKm,
        connectorType: connectorType,
        statusFilter: statusFilter,
      ));
    });
  }

  Future<void> _onLoadStations(
      MapLoadStations event, Emitter<MapState> emit) async {
    if (state is! MapLoaded) emit(const MapLoading());

    final result = await _repository.getStations(
      lat: event.lat,
      lng: event.lng,
      radiusKm: event.radiusKm,
      connectorType: event.connectorType,
      status: event.statusFilter,
    );

    result.fold(
      (failure) => emit(MapError(message: failure.message)),
      (stations) {
        final current = state;
        if (current is MapLoaded) {
          emit(current.copyWith(
            stations: stations,
            activeConnectorFilter: event.connectorType,
            activeStatusFilter: event.statusFilter,
          ));
        } else {
          emit(MapLoaded(
            stations: stations,
            userLat: event.lat,
            userLng: event.lng,
            activeConnectorFilter: event.connectorType,
            activeStatusFilter: event.statusFilter,
            radiusKm: event.radiusKm,
          ));
        }
      },
    );
  }

  Future<void> _onStationTapped(
      MapStationTapped event, Emitter<MapState> emit) async {
    final result = await _repository.getStationById(event.stationId);
    result.fold(
      (failure) {},
      (station) {
        final current = state;
        if (current is MapLoaded) {
          emit(current.copyWith(selectedStation: station));
        }
      },
    );
  }

  void _onFilterChanged(
      MapFilterChanged event, Emitter<MapState> emit) {
    final current = state;
    if (current is MapLoaded) {
      _scheduleLoad(
        lat: current.userLat,
        lng: current.userLng,
        radiusKm: event.radiusKm ?? current.radiusKm,
        connectorType: event.connectorType,
        statusFilter: event.statusFilter,
        emit: emit,
      );
    }
  }

  @override
  Future<void> close() {
    _debounce?.cancel();
    return super.close();
  }
}
