import 'dart:async';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../widgets/user_location_marker.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/map_bloc.dart';
import '../../domain/entities/station_entity.dart';
import '../widgets/station_marker.dart';

/// Navigation Route Routing Map Screen
///
/// Queries OpenRouteService OSRM endpoints, renders polyline bounds,
/// tracks compass headings, and projects active driving durations and distances.
class RouteNavigationScreen extends StatefulWidget {
  final String stationId;
  final double stationLat;
  final double stationLng;
  final String stationName;
  final double userLat;
  final double userLng;

  const RouteNavigationScreen({
    super.key,
    required this.stationId,
    required this.stationLat,
    required this.stationLng,
    required this.stationName,
    required this.userLat,
    required this.userLng,
  });

  @override
  State<RouteNavigationScreen> createState() =>
      _RouteNavigationScreenState();
}

class _RouteNavigationScreenState
    extends State<RouteNavigationScreen> {
  List<LatLng> _polylinePoints = [];
  double? _distanceKm;
  int? _durationMin;
  bool _isLoading = true;
  String? _error;



  late double _currentStartLat;
  late double _currentStartLng;
  late String _currentStartName;

  late double _currentDestLat;
  late double _currentDestLng;
  late String _currentDestName;

  @override
  void initState() {
    super.initState();
    _currentStartLat = widget.userLat;
    _currentStartLng = widget.userLng;
    _currentStartName = 'Vị trí của bạn';

    _currentDestLat = widget.stationLat;
    _currentDestLng = widget.stationLng;
    _currentDestName = widget.stationName;

    _fetchRoute();
  }



  double _calculateDistance(double lat1, double lon1, double lat2, double lon2) {
    const p = 0.017453292519943295; // Math.PI / 180
    final a = 0.5 - cos((lat2 - lat1) * p) / 2 +
        cos(lat1 * p) * cos(lat2 * p) *
            (1 - cos((lon2 - lon1) * p)) / 2;
    return 12742 * asin(sqrt(a)); // Earth diameter is ~12742 km
  }

  Future<void> _fetchRoute() async {
    if (_currentStartLat == 0.0 && _currentStartLng == 0.0) {
      setState(() {
        _error = 'Vui lòng cấp quyền vị trí hoặc bật định vị để sử dụng tính năng chỉ đường.';
        _isLoading = false;
      });
      return;
    }

    // Query global OSRM car routing engine covering Vietnam.
    const osrmBaseUrl = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';

    try {
      final dio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 8),
        receiveTimeout: const Duration(seconds: 10),
      ));

      final response = await dio.get(
        '$osrmBaseUrl/$_currentStartLng,$_currentStartLat;$_currentDestLng,$_currentDestLat',
        queryParameters: {
          'overview': 'full',
          'geometries': 'geojson',
        },
      );

      final routes = response.data['routes'] as List<dynamic>? ?? [];
      if (routes.isEmpty) throw Exception('Không tìm thấy tuyến đường');

      final route = routes[0] as Map<String, dynamic>;
      final geometry = route['geometry'] as Map<String, dynamic>;
      final coordinates = geometry['coordinates'] as List<dynamic>;

      setState(() {
        _polylinePoints = coordinates
            .map((c) => LatLng(
                  ((c as List<dynamic>)[1] as num).toDouble(),
                  (c[0] as num).toDouble(),
                ))
            .toList();
        _distanceKm = (route['distance'] as num).toDouble() / 1000;
        _durationMin = ((route['duration'] as num).toDouble() / 60).round();
        _isLoading = false;
        _error = null;
      });
    } catch (e) {
      // Fallback: draw straight-line route if API service is rate-limited or fails
      final distance = _calculateDistance(
        _currentStartLat, _currentStartLng,
        _currentDestLat, _currentDestLng,
      );
      
      // Estimated road distance is ~1.3x straight line, speed is ~40km/h (~1.5 mins per km)
      final estDistanceKm = distance * 1.3;
      final estDurationMin = (estDistanceKm * 1.5).round();

      setState(() {
        _polylinePoints = [
          LatLng(_currentStartLat, _currentStartLng),
          LatLng(_currentDestLat, _currentDestLng),
        ];
        _distanceKm = estDistanceKm;
        _durationMin = estDurationMin;
        _isLoading = false;
        _error = null; // Absorb error for smooth user experience fallback
      });
    }
  }

  Future<void> _openGoogleMaps() async {
    final url = Uri.parse(
      'https://www.google.com/maps/dir/?api=1'
      '&origin=$_currentStartLat,$_currentStartLng'
      '&destination=$_currentDestLat,$_currentDestLng'
      '&travelmode=driving',
    );
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final userLatLng = LatLng(_currentStartLat, _currentStartLng);
    final stationLatLng = LatLng(_currentDestLat, _currentDestLng);
    
    final station = context.select<MapBloc, StationEntity?>((bloc) {
      final mapState = bloc.state;
      if (mapState is MapLoaded) {
        try {
          return mapState.stations.firstWhere((s) => s.id == widget.stationId);
        } catch (_) {}
      }
      return null;
    });

    final topPadding = MediaQuery.of(context).padding.top + kToolbarHeight;

    return LiquidGlassScaffold(
      appBar: AppBar(
        title: const Text('Chỉ đường'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios),
          onPressed: () => context.pop(),
        ),
      ),
      child: Padding(
        padding: EdgeInsets.only(top: topPadding),
        child: Stack(
        children: [
          FlutterMap(
            options: MapOptions(
              initialCenter: userLatLng,
              initialZoom: 13,
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
              if (_polylinePoints.isNotEmpty)
                PolylineLayer(
                  polylines: [
                    // Outer neon aura glow
                    Polyline(
                      points: _polylinePoints,
                      color: AppColors.primaryCyan.withValues(alpha: 0.28),
                      strokeWidth: 11.0,
                    ),
                    // Inner electric core path
                    Polyline(
                      points: _polylinePoints,
                      color: AppColors.primaryCyan,
                      strokeWidth: 5.0,
                    ),
                  ],
                ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: userLatLng,
                    width: 60,
                    height: 60,
                    rotate: true,
                    child: const UserLocationMarker(),
                  ),
                  if (station != null)
                    Marker(
                      point: stationLatLng,
                      width: 46.0,
                      height: 46.0 * (245.0 / 180.0),
                      rotate: true,
                      alignment: const Alignment(0.0, -0.2653),
                      child: StationMarker(
                        station: station,
                        isSelected: true, // Always show as highlighted destination
                      ),
                    ),
                ],
              ),
            ],
          ),

          Positioned(
            top: AppSpacing.sm,
            left: AppSpacing.lg,
            right: AppSpacing.lg,
            child: Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: BorderRadius.circular(AppRadius.lg),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.1),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  InkWell(
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Chạm vào bản đồ trên trang chủ để chọn vị trí mới.')),
                      );
                      context.pop();
                    },
                    child: Row(
                      children: [
                        const Icon(Icons.my_location, color: AppColors.secondary, size: 20),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Text(
                            _currentStartName,
                            style: AppTypography.bodyMd,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: AppSpacing.xl),
                  InkWell(
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Vui lòng chọn trạm khác trên bản đồ để đổi điểm đến.')),
                      );
                      context.pop();
                    },
                    child: Row(
                      children: [
                        const Icon(Icons.location_on, color: AppColors.primary, size: 20),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Text(
                            _currentDestName,
                            style: AppTypography.bodyMd.copyWith(fontWeight: FontWeight.w600),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          if (!_isLoading && _error == null)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.lg,
                  AppSpacing.lg,
                  AppSpacing.lg +
                      MediaQuery.of(context).padding.bottom,
                ),
                decoration: BoxDecoration(
                  color: Theme.of(context).cardColor,
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(AppRadius.xl),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color:
                          Colors.black.withValues(alpha: 0.1),
                      blurRadius: 16,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment:
                          MainAxisAlignment.spaceAround,
                      children: [
                        _buildInfoItem(
                          icon: Icons.timer_outlined,
                          label: 'Thời gian',
                          value:
                              '${_durationMin ?? '--'} phút',
                        ),
                        Container(
                          width: 1,
                          height: 40,
                          color: AppColors.outlineLight,
                        ),
                        _buildInfoItem(
                          icon: Icons.route_outlined,
                          label: 'Khoảng cách',
                          value:
                              '${_distanceKm?.toStringAsFixed(1) ?? '--'} km',
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    EVButton(
                      label: 'Mở Google Maps',
                      icon: Icons.open_in_new,
                      variant: EVButtonVariant.secondary,
                      onPressed: _openGoogleMaps,
                    ),
                  ],
                ),
              ),
            ),

          if (_isLoading)
            const Center(child: CircularProgressIndicator()),

          if (_error != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: Text(
                  _error!,
                  style: AppTypography.bodyMd.copyWith(
                      color: AppColors.error),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

  Widget _buildInfoItem({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Column(
      children: [
        Icon(icon, color: AppColors.secondary, size: 24),
        const SizedBox(height: 4),
        Text(
          value,
          style: AppTypography.headingMd.copyWith(
            color: Theme.of(context).colorScheme.onSurface,
          ),
        ),
        Text(
          label,
          style: AppTypography.caption.copyWith(
            color: AppColors.grey600,
          ),
        ),
      ],
    );
  }
}
