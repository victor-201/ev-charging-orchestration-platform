import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_map_marker_cluster/flutter_map_marker_cluster.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:get_it/get_it.dart';
import 'package:flutter_compass/flutter_compass.dart';

import '../bloc/map_bloc.dart';
import '../bloc/map_event_state.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../auth/presentation/bloc/auth_event_state.dart';
import '../../../../core/design_system/app_colors.dart';
import '../../../../core/design_system/app_theme.dart';
import '../../../../core/design_system/app_typography.dart';
import '../../domain/entities/station_entity.dart';
import '../../domain/repositories/i_station_repository.dart';

import '../widgets/station_marker.dart';
import '../widgets/user_location_marker.dart';
import '../widgets/station_detail_sheet.dart';
import '../widgets/search_results_overlay.dart';

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
  double _radius = 5.0;

  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  Timer? _debounce;

  List<StationEntity> _searchResults = [];
  bool _searchLoading = false;
  bool _searchOverlayVisible = false;

  double? _userHeading;
  StreamSubscription? _compassSubscription;
  String? _selectedStationId;
  List<StationEntity> _cachedStations = [];
  LatLng? _lastReloadCenter;

  static const _connectorTypes = ['CCS', 'CHAdeMO', 'Type2', 'GB/T', 'Other'];
  final GlobalKey _searchFieldKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _checkLocationPermission();
    _initCompass();
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
      setState(() {
        _userLocation = LatLng(pos.latitude, pos.longitude);
      });
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
    _debounce?.cancel();
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
      });
      return;
    }

    setState(() {
      _searchLoading = true;
      _searchOverlayVisible = true;
    });
    _searchFocusNode.requestFocus();

    _debounce = Timer(const Duration(milliseconds: 300), () async {
      if (!mounted) return;

      final repo = GetIt.instance<IStationRepository>();
      final result = await repo.searchStations(trimmed, limit: 8);

      if (!mounted || _searchController.text.trim() != trimmed) return;

      result.fold(
        (_) => setState(() {
          _searchResults = [];
          _searchLoading = false;
        }),
        (stations) => setState(() {
          _searchResults = stations;
          _searchLoading = false;
        }),
      );
    });
  }

  void _selectStation(StationEntity station) {
    _searchController.text = station.name;
    _searchFocusNode.unfocus();
    setState(() {
      _searchOverlayVisible = false;
      _searchResults = [];
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
      builder: (context) => StationDetailSheet(
        station: station,
        userLocation: _userLocation,
      ),
    );
  }

  void _applyFilter() {
    final center = _mapController.camera.center;
    context.read<MapBloc>().add(MapFilterChanged(
          connectorType: _selectedConnector,
          radiusKm: _radius,
        ));
    context.read<MapBloc>().add(MapLoadStations(
          lat: center.latitude,
          lng: center.longitude,
          radiusKm: _radius,
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
      body: Stack(
        children: [
          BlocBuilder<MapBloc, MapState>(
            builder: (context, state) {
              if (state is MapLoaded) {
                _cachedStations = state.stations;
              }

              final stationsToShow = (state is MapLoaded)
                  ? state.stations
                  : (state is MapLoading ? _cachedStations : <StationEntity>[]);

              return FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: _userLocation ?? _defaultCenter,
                  initialZoom: 15,
                  interactionOptions: const InteractionOptions(
                    flags: InteractiveFlag.all,
                  ),
                  onMapReady: () {
                    if (_userLocation != null) {
                      _mapController.move(_userLocation!, 15);
                    }
                  },
                  onMapEvent: (event) {
                    if (event is MapEventMoveEnd || event is MapEventScrollWheelZoom) {
                      final center = _mapController.camera.center;
                      // Prevent rapid layout flickers by updating markers only when map center shifts beyond 100 meters.
                      final distance = _lastReloadCenter == null
                          ? double.infinity
                          : Geolocator.distanceBetween(
                              _lastReloadCenter!.latitude,
                              _lastReloadCenter!.longitude,
                              center.latitude,
                              center.longitude);

                      if (distance > 100) {
                        _lastReloadCenter = center;
                        context.read<MapBloc>().add(MapLoadStations(
                              lat: center.latitude,
                              lng: center.longitude,
                              radiusKm: _radius,
                              connectorType: _selectedConnector,
                            ));
                      }
                    }
                  },
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.evcharging.app',
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
                    MarkerClusterLayerWidget(
                      key: ValueKey('cluster_layer_${stationsToShow.length}_${_selectedStationId ?? 'none'}'),
                      options: MarkerClusterLayerOptions(
                        maxClusterRadius: 50,
                        size: const Size(65, 65),
                        rotate: true,
                        markers: stationsToShow.map((station) {
                          final isSelected = _selectedStationId == station.id;
                          return Marker(
                            key: ValueKey('station_${station.id}'),
                            point: LatLng(station.latitude, station.longitude),
                            width: isSelected ? 55 : 45,
                            height: isSelected ? 75 : 60,
                            rotate: true,
                            // Align top-center so the teardrop point targets exact geographic coordinates.
                            alignment: Alignment.topCenter,
                            child: StationMarker(
                              station: station,
                              isSelected: isSelected,
                              onTap: () {},
                            ),
                          );
                        }).toList(),
                        onMarkerTap: (marker) {
                          final key = marker.key as ValueKey<String>?;
                          if (key == null) return;
                          final stationId = key.value.replaceFirst('station_', '');
                          final station = stationsToShow.firstWhere((s) => s.id == stationId);
                          
                          setState(() => _selectedStationId = station.id);
                          context.read<MapBloc>().add(MapStationTapped(stationId: station.id));
                          _showStationBottomSheet(context, station);
                        },
                        builder: (context, markers) => GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            // Calculate geographic bounds surrounding the targeted cluster markers.
                            if (markers.isEmpty) return;
                            final points = markers.map((m) => m.point).toList();
                            final bounds = LatLngBounds.fromPoints(points);
                            
                            // Fit the camera viewport nicely inside the calculated cluster boundary.
                            _mapController.fitCamera(
                              CameraFit.bounds(
                                bounds: bounds,
                                padding: const EdgeInsets.all(120),
                              ),
                            );
                          },
                          child: Container(
                            width: 65,
                            height: 65,
                            decoration: const BoxDecoration(
                              color: Colors.transparent,
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: SvgPicture.string(
                                '''
                                <svg width="65" height="65" viewBox="0 0 65 65" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <defs>
                                    <linearGradient id="grad_green_modern" x1="0" y1="0" x2="65" y2="65" gradientUnits="userSpaceOnUse">
                                      <stop stop-color="#34D399"/>
                                      <stop offset="1" stop-color="#059669"/>
                                    </linearGradient>
                                  </defs>
                                  <circle cx="32.5" cy="32.5" r="30" fill="#10B981" fill-opacity="0.1"/>
                                  <circle cx="32.5" cy="32.5" r="25" stroke="#34D399" stroke-width="1" stroke-opacity="0.4"/>
                                  <circle cx="32.5" cy="32.5" r="22" stroke="white" stroke-width="2" stroke-opacity="0.8"/>
                                  <circle cx="32.5" cy="32.5" r="19" fill="url(#grad_green_modern)"/>
                                  <path d="M19 26C22 19 29 16 36 16" stroke="white" stroke-width="2" stroke-linecap="round" stroke-opacity="0.3"/>
                                  <text x="32.5" y="38" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="16" fill="white">${markers.length}</text>
                                </svg>
                                ''',
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  
                ],
              );
            },
          ),

          BlocBuilder<MapBloc, MapState>(
            builder: (context, state) {
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
                _buildSearchBar(key: const ValueKey('search_bar')),
                if (_searchOverlayVisible)
                  SearchResultsOverlay(
                    key: const ValueKey('search_overlay'),
                    results: _searchResults,
                    isLoading: _searchLoading,
                    searchText: _searchController.text,
                    onStationSelected: _selectStation,
                    onGeocodeFallback: () => _geocodeFallback(_searchController.text),
                  ),
              ],
            ),
          ),

          if (!_searchOverlayVisible)
            Positioned(
              top: 40 + 54 + AppSpacing.md,
              left: AppSpacing.lg,
              right: AppSpacing.lg,
              child: _buildFilterChips(key: const ValueKey('filter_chips')),
            ),

          Positioned(
            bottom: 120,
            right: AppSpacing.lg,
            child: FloatingActionButton.small(
              key: const ValueKey('recenter_btn'),
              onPressed: _recenterMap,
              backgroundColor: Theme.of(context).cardColor,
              child: const Icon(Icons.my_location, color: AppColors.primary),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar({Key? key}) {
    return Row(
      key: key,
      children: [
        Expanded(
          child: Container(
            key: const ValueKey('search_container'),
            height: 54,
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(AppRadius.full),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: _searchFocusNode.hasFocus ? 0.1 : 0.04),
                  blurRadius: _searchFocusNode.hasFocus ? 20 : 10,
                  offset: const Offset(0, 4),
                ),
              ],
              border: Border.all(
                color: _searchFocusNode.hasFocus
                    ? AppColors.primary.withValues(alpha: 0.5)
                    : Colors.transparent,
                width: 1.5,
              ),
            ),
            child: Row(
              children: [
                const SizedBox(width: AppSpacing.lg),
                _searchLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary)),
                      )
                    : Icon(Icons.search_rounded,
                        color: _searchFocusNode.hasFocus ? AppColors.primary : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.9),
                        size: 22),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: TextField(
                    key: _searchFieldKey,
                    controller: _searchController,
                    focusNode: _searchFocusNode,
                    decoration: InputDecoration(
                      hintText: 'Bạn muốn sạc ở đâu?',
                      hintStyle: AppTypography.bodyMd.copyWith(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.8)),
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      errorBorder: InputBorder.none,
                      disabledBorder: InputBorder.none,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 16),
                      filled: false,
                    ),
                    style: AppTypography.bodyMd.copyWith(fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.onSurface),
                    onChanged: _onSearchChanged,
                    onSubmitted: (q) => _geocodeFallback(q),
                  ),
                ),
                if (_searchController.text.isNotEmpty)
                  IconButton(
                    icon: Icon(Icons.close_rounded, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.9), size: 20),
                    onPressed: () {
                      _searchController.clear();
                      _debounce?.cancel();
                      setState(() {
                        _searchResults = [];
                        _searchOverlayVisible = false;
                        _searchLoading = false;
                      });
                    },
                  )
                else
                  const SizedBox(width: AppSpacing.lg),
              ],
            ),
          ),
        ),
        BlocBuilder<AuthBloc, AuthState>(
          builder: (context, authState) {
            if (authState is AuthAuthenticated) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(left: AppSpacing.sm),
              child: _buildLoginButton(),
            );
          },
        ),
      ],
    );
  }

  Widget _buildLoginButton() {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      height: 54,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadius.full),
        gradient: const LinearGradient(
          colors: [AppColors.primary, Color(0xFF00B248)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.3),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.full),
          onTap: () => context.push('/auth/login'),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
            child: Center(
              child: Text(
                'Đăng nhập',
                style: AppTypography.bodyMd.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFilterChips({Key? key}) {
    return SingleChildScrollView(
      key: key,
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _buildChip(
            label: 'Tất cả',
            isSelected: _selectedConnector == null,
            onTap: () {
              setState(() => _selectedConnector = null);
              _applyFilter();
            },
          ),
          ..._connectorTypes.map((type) => _buildChip(
                label: type,
                isSelected: _selectedConnector == type,
                onTap: () {
                  setState(() => _selectedConnector = type);
                  _applyFilter();
                },
              )),
        ],
      ),
    );
  }

  Widget _buildChip({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: AppSpacing.sm),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.primary : Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(
              color: isSelected ? AppColors.primary : Theme.of(context).colorScheme.outline,
            ),
            boxShadow: isSelected
                ? [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.3),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    )
                  ]
                : null,
          ),
          child: Text(
            label,
            style: AppTypography.caption.copyWith(
              color: isSelected ? Colors.white : Theme.of(context).colorScheme.onSurface,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}
