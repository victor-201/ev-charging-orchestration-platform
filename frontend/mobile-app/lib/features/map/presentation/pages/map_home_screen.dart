import 'dart:async';
import 'dart:math' as math;
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:get_it/get_it.dart';

import '../bloc/map_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../domain/entities/station_entity.dart';
import '../../domain/usecases/search_stations_usecase.dart';
import '../../domain/usecases/suggest_optimal_station_usecase.dart';

import '../widgets/user_location_marker.dart';
import '../widgets/station_detail_sheet.dart';
import '../widgets/search_results_overlay.dart';
import '../widgets/map_filter_bar.dart';
import '../widgets/map_cluster_layer.dart';
import '../widgets/map_search_bar.dart';
import '../widgets/ai_suggestion_sheet.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';

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

  String? _selectedStationId;
  List<StationEntity> _cachedStations = [];

  // Singleton Dio for geocoding — avoids re-allocation on every search submission.
  static final Dio _geocodeDio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 6),
    receiveTimeout: const Duration(seconds: 8),
    headers: {'User-Agent': 'EVoltSync/1.0 (com.evcharging.app)'},
  ));

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
    // Defer GPS permission check until after the first frame is rendered.
    // This prevents the blocking getCurrentPosition() call from delaying
    // the initial map paint (was causing 30k ms startup lag).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _checkLocationPermission();
    });
    // Periodically re-scan the current viewport to update station availability.
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

    // Use reduced accuracy + timeout to avoid blocking for 30+ seconds
    // waiting for GPS hardware lock on startup.
    final pos = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.reduced,
      timeLimit: const Duration(seconds: 10),
    );
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

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _debounce?.cancel();
    _mapMoveDebounce?.cancel();
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
      final response = await _geocodeDio.get(
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

  void _showAiSuggestionBottomSheet(BuildContext context, StationEntity station) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: true,
      enableDrag: true,
      builder: (context) => AiSuggestionSheet(
        station: station,
        userLocation: _userLocation,
      ),
    );
  }

  void _getAiSuggestion() async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => Center(
        child: Card(
          color: Theme.of(context).cardColor.withValues(alpha: 0.95),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(color: AppColors.primaryCyan),
                SizedBox(height: 16),
                Text(
                  'Đang tối ưu hóa vị trí sạc bằng AI...',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    final usecase = GetIt.instance<SuggestOptimalStationUseCase>();
    final center = _mapController.camera.center;
    final result = await usecase(
      lat: _userLocation?.latitude ?? center.latitude,
      lng: _userLocation?.longitude ?? center.longitude,
      connectorType: _selectedConnector,
    );

    if (mounted) Navigator.of(context).pop();

    result.fold(
      (failure) {
        if (mounted) {
          EVToast.show(context, message: failure.message, isError: true);
        }
      },
      (station) {
        if (mounted) {
          _mapController.move(LatLng(station.latitude, station.longitude), 15.5);
          _showAiSuggestionBottomSheet(context, station);
        }
      },
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
            // Only rebuild the map layer when the stations list changes
            // or the state type changes. Avoids repaint on user-location-only updates.
            buildWhen: (prev, next) {
              if (prev.runtimeType != next.runtimeType) return true;
              if (prev is MapLoaded && next is MapLoaded) {
                return prev.stations != next.stations;
              }
              return true;
            },
            builder: (context, state) {
              final isDark = Theme.of(context).brightness == Brightness.dark;
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
                    colorFilter: isDark
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
                          child: const UserLocationMarker(),
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
            // Only show the overlay on state *type* transitions (e.g. loading -> loaded)
            buildWhen: (prev, next) => prev.runtimeType != next.runtimeType,
            builder: (context, state) {
              // Initial load spinner
              if (state is MapLoading) {
                return const Positioned(
                  bottom: 120,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Card(
                      child: Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            SizedBox(width: 8),
                            Text('Đang tải trạm sạc...'),
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
                  left: AppLayout.sidePadding,
                  right: AppLayout.sidePadding,
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
            left: AppLayout.sidePadding,
            right: AppLayout.sidePadding,
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
            bottom: 176,
            right: AppLayout.sidePadding,
            child: GestureDetector(
              key: const ValueKey('ai_optimizer_btn'),
              onTap: _getAiSuggestion,
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppColors.primaryCyan, AppColors.primaryLime],
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primaryCyan.withValues(alpha: 0.5),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(Icons.psychology_outlined, color: Colors.white, size: 24),
              ),
            ),
          ),

          Positioned(
            bottom: 120,
            right: AppLayout.sidePadding,
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
