import 'dart:async';
import 'dart:math' as math;
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:get_it/get_it.dart';
import 'package:flutter_compass/flutter_compass.dart';

import '../bloc/map_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../domain/entities/station_entity.dart';
import '../../domain/usecases/search_stations_usecase.dart';

import '../widgets/user_location_marker.dart';
import '../widgets/station_detail_sheet.dart';
import '../widgets/search_results_overlay.dart';
import '../widgets/map_filter_bar.dart';
import '../widgets/map_cluster_layer.dart';
import '../widgets/map_search_bar.dart';

/// Main Geospatial Charging Stations Map Screen
///
/// Integrates GPS tracking, dynamic clustered marker layers, custom SVG icons,
/// and live connector type searches alongside modal station specification dialogs.
class MapHomeScreen extends StatefulWidget {
  const MapHomeScreen({super.key});

  @override
  State<MapHomeScreen> createState() => _MapHomeScreenState();
}

class _MapHomeScreenState extends State<MapHomeScreen> {
  final MapController _mapController = MapController();

  static const LatLng _defaultCenter = LatLng(21.0285, 105.8542);
  LatLng? _userLocation;

  String? _selectedConnector;

  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  Timer? _debounce;

  List<StationEntity> _searchResults = [];
  bool _searchLoading = false;
  bool _searchOverlayVisible = false;
  int _searchLimit = 3;
  bool _hasMoreSearchResults = false;

  double? _userHeading;
  StreamSubscription? _compassSubscription;
  String? _selectedStationId;
  List<StationEntity> _cachedStations = [];

  static const _connectorTypes = ['CCS', 'CHAdeMO', 'Type2', 'GB/T', 'Other'];
  final GlobalKey _searchFieldKey = GlobalKey();

  LatLng? _lastReloadCenter;
  double? _lastReloadZoom;
  Timer? _mapMoveDebounce;

  // Auto-refresh: silently re-fetch all station statuses every 60 seconds.
  Timer? _refreshTimer;

  /// Computes the approximate radius in kilometres of the visible map viewport
  /// based on the camera's current zoom level and latitude.
  double _calculateVisibleRadiusKm(double zoom, double latitude) {
    const diagonalHalfPx = 450.0;
    final metersPerPx =
        156543.03 * math.cos(latitude * math.pi / 180.0) / math.pow(2, zoom);
    return (diagonalHalfPx * metersPerPx) / 1000.0;
  }

  @override
  void initState() {
    super.initState();
    _checkLocationPermission();
    _initCompass();
    // Periodically re-scan the current viewport to update station availability.
    // Uses MapLoadStations so the BLoC decides whether to hit the API or serve cache.
    _refreshTimer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (!mounted) return;
      try {
        final center = _mapController.camera.center;
        final zoom   = _mapController.camera.zoom;
        final visible = _calculateVisibleRadiusKm(zoom, center.latitude);
        final radius  = (visible * 1.5).clamp(15.0, 2000.0);
        context.read<MapBloc>().add(MapLoadStations(
          lat: center.latitude,
          lng: center.longitude,
          radiusKm: radius,
          connectorType: _selectedConnector,
        ));
      } catch (_) {}
    });
  }

  Future<void> _checkLocationPermission() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return;
    }

    if (permission == LocationPermission.deniedForever) return;

    final pos = await Geolocator.getCurrentPosition();
    if (mounted) {
      final loc = LatLng(pos.latitude, pos.longitude);
      setState(() {
        _userLocation = loc;
      });
      _mapController.move(loc, 15.0);
      context.read<MapBloc>().add(MapLocationUpdated(
            lat: pos.latitude,
            lng: pos.longitude,
          ));
    }
  }

  void _initCompass() {
    _compassSubscription = FlutterCompass.events?.listen((event) {
      if (mounted) {
        setState(() {
          _userHeading = event.heading;
        });
      }
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _debounce?.cancel();
    _mapMoveDebounce?.cancel();
    _compassSubscription?.cancel();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _debounce?.cancel();
    final trimmed = query.trim();

    if (trimmed.isEmpty) {
      setState(() {
        _searchResults = [];
        _searchOverlayVisible = false;
        _searchLoading = false;
        _searchLimit = 3;
        _hasMoreSearchResults = false;
      });
      return;
    }

    setState(() {
      _searchLoading = true;
      _searchOverlayVisible = true;
    });
    _searchFocusNode.requestFocus();

    _debounce = Timer(const Duration(milliseconds: 300), () {
      _searchLimit = 3;
      _performSearch(trimmed);
    });
  }

  Future<void> _performSearch(String trimmed) async {
    if (!mounted) return;

    final usecase = GetIt.instance<SearchStationsUseCase>();
    final result = await usecase(
      trimmed,
      limit: _searchLimit + 1,
      connectorType: _selectedConnector,
    );

    if (!mounted || _searchController.text.trim() != trimmed) return;

    result.fold(
      (_) => setState(() {
        _searchResults = [];
        _searchLoading = false;
        _hasMoreSearchResults = false;
      }),
      (stations) => setState(() {
        if (stations.length > _searchLimit) {
          _searchResults = stations.sublist(0, _searchLimit);
          _hasMoreSearchResults = true;
        } else {
          _searchResults = stations;
          _hasMoreSearchResults = false;
        }
        _searchLoading = false;
      }),
    );
  }

  void _loadMoreSearch() {
    setState(() {
      _searchLimit += 5;
      _searchLoading = true;
    });
    _performSearch(_searchController.text.trim());
  }

  void _selectStation(StationEntity station) {
    _searchController.text = station.name;
    _searchFocusNode.unfocus();
    setState(() {
      _searchOverlayVisible = false;
      _searchResults = [];
      _searchLimit = 3;
      _hasMoreSearchResults = false;
    });
    _mapController.move(LatLng(station.latitude, station.longitude), 16);
    Future.delayed(const Duration(milliseconds: 300), () {
      if (mounted) _showStationBottomSheet(context, station);
    });
  }

  Future<void> _geocodeFallback(String query) async {
    _searchFocusNode.unfocus();
    setState(() {
      _searchOverlayVisible = false;
      _searchResults = [];
    });
    if (query.trim().isEmpty) return;

    try {
      final dio = Dio();
      final response = await dio.get(
        'https://nominatim.openstreetmap.org/search',
        queryParameters: {
          'q': query.trim(),
          'format': 'json',
          'limit': 1,
        },
      );

      if (response.data is List && response.data.isNotEmpty) {
        final first = response.data[0];
        final lat = double.parse(first['lat']);
        final lon = double.parse(first['lon']);
        if (mounted) {
          _mapController.move(LatLng(lat, lon), 15);
        }
      }
    } catch (_) {}
  }

  void _showStationBottomSheet(BuildContext context, StationEntity station) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: true,
      enableDrag: true,
      builder: (context) => StationDetailSheet(
        station: station,
        userLocation: _userLocation,
      ),
    );
  }

  void _applyFilter() {
    context.read<MapBloc>().add(MapFilterChanged(
          connectorType: _selectedConnector,
        ));
  }

  void _recenterMap() {
    final center = _userLocation ?? _defaultCenter;
    _mapController.move(center, 15);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () {
          if (_searchOverlayVisible || _searchFocusNode.hasFocus) {
            _searchFocusNode.unfocus();
            setState(() {
              _searchOverlayVisible = false;
            });
          }
        },
        child: Stack(
          children: [
            BlocBuilder<MapBloc, MapState>(
            builder: (context, state) {
              final stationsToShow = state is MapLoaded
                  ? state.stations
                  : (state is MapLoading ? _cachedStations : <StationEntity>[]);
              if (state is MapLoaded) _cachedStations = state.stations;

              return FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: _userLocation ?? _defaultCenter,
                  initialZoom: 15,
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.all,
                  ),
                  onTap: (tapPosition, point) {
                    if (_searchOverlayVisible || _searchFocusNode.hasFocus) {
                      _searchFocusNode.unfocus();
                      setState(() {
                        _searchOverlayVisible = false;
                      });
                    }
                  },
                  onMapReady: () {
                    if (_userLocation != null) {
                      _mapController.move(_userLocation!, 15);
                    }
                  },
                  onMapEvent: (event) {
                    if (event is MapEventMoveEnd || event is MapEventScrollWheelZoom) {
                      _mapMoveDebounce?.cancel();
                      _mapMoveDebounce = Timer(const Duration(milliseconds: 300), () {
                        if (!mounted) return;
                        final camera = _mapController.camera;
                        final center = camera.center;

                        final visibleRadius = _calculateVisibleRadiusKm(
                          camera.zoom,
                          center.latitude,
                        );

                        // Buffer the load radius by 1.5x so we pre-fetch surrounding stations.
                        // Clamp to at least 15.0 km to leverage the BLoC's containment cache,
                        // avoiding redundant API requests when panning/zooming inside that area.
                        final loadRadius = (visibleRadius * 1.5).clamp(15.0, 2000.0);

                        // Prevent API spamming by ignoring movement smaller than 100m.
                        final distance = _lastReloadCenter == null
                            ? double.infinity
                            : Geolocator.distanceBetween(
                                _lastReloadCenter!.latitude,
                                _lastReloadCenter!.longitude,
                                center.latitude,
                                center.longitude);

                        // Also fetch if zoom level changes significantly (panned/zoomed out)
                        final zoomDiff = _lastReloadZoom == null
                            ? double.infinity
                            : (camera.zoom - _lastReloadZoom!).abs();

                        if (distance > 100 || zoomDiff > 0.5) {
                          _lastReloadCenter = center;
                          _lastReloadZoom = camera.zoom;
                          context.read<MapBloc>().add(MapLoadStations(
                                lat: center.latitude,
                                lng: center.longitude,
                                radiusKm: loadRadius,
                                visibleRadiusKm: visibleRadius,
                                connectorType: _selectedConnector,
                              ));
                        }
                      });
                    }
                  },
                ),
                children: [
                  ColorFiltered(
                    colorFilter: Theme.of(context).brightness == Brightness.dark
                        // Dark mode: dim to 92.5% brightness
                        ? const ColorFilter.matrix(<double>[
                            0.925, 0,     0,     0, 0,
                            0,     0.925, 0,     0, 0,
                            0,     0,     0.925, 0, 0,
                            0,     0,     0,     1, 0,
                          ])
                        : const ColorFilter.matrix(<double>[
                            1, 0, 0, 0, 0,
                            0, 1, 0, 0, 0,
                            0, 0, 1, 0, 0,
                            0, 0, 0, 1, 0,
                          ]),
                    child: TileLayer(
                      urlTemplate: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.evcharging.app',
                    ),
                  ),
                  if (_userLocation != null)
                    MarkerLayer(
                      markers: [
                         Marker(
                          point: _userLocation!,
                          width: 60,
                          height: 60,
                          rotate: true,
                          child: UserLocationMarker(heading: _userHeading),
                        ),
                      ],
                    ),
                  if (stationsToShow.isNotEmpty)
                    MapClusterLayer(
                      stations: stationsToShow,
                      selectedStationId: _selectedStationId,
                      mapController: _mapController,
                      onStationTapped: (station) {
                        setState(() => _selectedStationId = station.id);
                        context.read<MapBloc>().add(MapStationTapped(stationId: station.id));
                        _showStationBottomSheet(context, station);
                      },
                    ),
                  
                ],
              );
            },
          ),

          BlocBuilder<MapBloc, MapState>(
            builder: (context, state) {
              // Initial load spinner
              if (state is MapLoading) {
                return Positioned(
                  bottom: 120,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Card(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            const SizedBox(width: 8),
                            const Text('Đang tải trạm sạc...'),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }
              // Error state with retry button
              if (state is MapError) {
                return Positioned(
                  bottom: 140,
                  left: 24,
                  right: 24,
                  child: Card(
                    color: Theme.of(context).colorScheme.errorContainer,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      child: Row(
                        children: [
                          Icon(Icons.wifi_off_rounded,
                              color: Theme.of(context).colorScheme.onErrorContainer),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Không thể tải trạm sạc',
                              style: TextStyle(
                                  color: Theme.of(context).colorScheme.onErrorContainer),
                            ),
                          ),
                          TextButton(
                            onPressed: () => context.read<MapBloc>().add(
                              MapLoadStations(
                                lat: _userLocation?.latitude  ?? _defaultCenter.latitude,
                                lng: _userLocation?.longitude ?? _defaultCenter.longitude,
                                radiusKm: 15.0,
                              ),
                            ),
                            child: const Text('Thử lại'),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }
              return const SizedBox.shrink();
            },
          ),

          Positioned(
            top: 40,
            left: AppSpacing.lg,
            right: AppSpacing.lg,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                MapSearchBar(
                  key: const ValueKey('search_bar'),
                  searchController: _searchController,
                  searchFocusNode: _searchFocusNode,
                  searchFieldKey: _searchFieldKey,
                  isLoading: _searchLoading,
                  onChanged: _onSearchChanged,
                  onSubmitted: (q) => _geocodeFallback(q),
                  onClear: () {
                    _searchController.clear();
                    _debounce?.cancel();
                    setState(() {
                      _searchResults = [];
                      _searchOverlayVisible = false;
                      _searchLoading = false;
                      _searchLimit = 3;
                      _hasMoreSearchResults = false;
                    });
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                MapFilterBar(
                  key: const ValueKey('filter_chips'),
                  connectorTypes: _connectorTypes,
                  selectedConnector: _selectedConnector,
                  onFilterChanged: (type) {
                    setState(() => _selectedConnector = type);
                    _applyFilter();
                    if (_searchController.text.trim().isNotEmpty) {
                      _onSearchChanged(_searchController.text);
                    }
                  },
                ),
                if (_searchOverlayVisible)
                  SearchResultsOverlay(
                    key: const ValueKey('search_overlay'),
                    results: _searchResults,
                    isLoading: _searchLoading,
                    searchText: _searchController.text,
                    onStationSelected: _selectStation,
                    onGeocodeFallback: () => _geocodeFallback(_searchController.text),
                    hasMore: _hasMoreSearchResults,
                    onLoadMore: _loadMoreSearch,
                  ),
              ],
            ),
          ),

          Positioned(
            bottom: 120,
            right: AppSpacing.lg,
            child: GestureDetector(
              key: const ValueKey('recenter_btn'),
              onTap: _recenterMap,
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: AppColors.primaryGradient,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primaryCyan.withValues(alpha: 0.4),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(Icons.my_location, color: Colors.white, size: 22),
              ),
            ),
          ),
        ],
      ),
     ),
    );
  }




}
