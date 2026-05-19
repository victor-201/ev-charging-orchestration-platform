import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_compass/flutter_compass.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_theme.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../widgets/user_location_marker.dart';

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

  double? _userHeading;
  StreamSubscription? _compassSubscription;

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

    _initCompass();
    _fetchRoute();
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
    _compassSubscription?.cancel();
    super.dispose();
  }

  Future<void> _fetchRoute() async {
    if (_currentStartLat == 0.0 && _currentStartLng == 0.0) {
      setState(() {
        _error = 'Vui lòng cấp quyền vị trí hoặc bật định vị để sử dụng tính năng chỉ đường.';
        _isLoading = false;
      });
      return;
    }

    // Query the global public OSRM driving profile server.
    const osrmBaseUrl = 'https://router.project-osrm.org/route/v1/driving';

    try {
      final dio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
      ));

      final response = await dio.get(
        '$osrmBaseUrl/${_currentStartLng},${_currentStartLat};${_currentDestLng},${_currentDestLat}',
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
      String errMsg = 'Không thể tải tuyến đường. Kiểm tra kết nối mạng.';
      if (e is DioException) {
        errMsg = 'Lỗi API (${e.response?.statusCode}): ${e.response?.data ?? e.message}';
      }
      setState(() {
        _error = errMsg;
        _isLoading = false;
      });
    }
  }

  Future<void> _openGoogleMaps() async {
    final url = Uri.parse(
      'https://www.google.com/maps/dir/?api=1'
      '&origin=${_currentStartLat},${_currentStartLng}'
      '&destination=${_currentDestLat},${_currentDestLng}'
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Chỉ đường'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios),
          onPressed: () => context.pop(),
        ),
      ),
      body: Stack(
        children: [
          FlutterMap(
            options: MapOptions(
              initialCenter: userLatLng,
              initialZoom: 13,
            ),
            children: [
              TileLayer(
                urlTemplate:
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.evcharging.app',
              ),
              if (_polylinePoints.isNotEmpty)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: _polylinePoints,
                      color: AppColors.secondary,
                      strokeWidth: 4,
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
                    child: UserLocationMarker(heading: _userHeading),
                  ),
                  Marker(
                    point: stationLatLng,
                    width: 45,
                    height: 60,
                    rotate: true,
                    alignment: Alignment.topCenter,
                    child: SvgPicture.string(
                      '''
                                <svg width="100" height="115" viewBox="0 0 100 115" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <defs>
                                    <linearGradient id="dest_grad" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
                                      <stop stop-color="#10B981"/>
                                      <stop offset="1" stop-color="#059669"/>
                                    </linearGradient>
                                  </defs>
                                  <!-- Pin Shadow -->
                                  <ellipse cx="50" cy="110" rx="15" ry="5" fill="black" fill-opacity="0.1"/>
                                  <!-- Pin Body (Teardrop-ish Modern) -->
                                  <path d="M50 115C50 115 90 75 90 45C90 22.9086 72.0914 5 50 5C27.9086 5 10 22.9086 10 45C10 75 50 115 50 115Z" fill="url(#dest_grad)"/>
                                  <!-- Inner White Circle -->
                                  <circle cx="50" cy="45" r="28" fill="white" fill-opacity="0.2"/>
                                  <!-- Charger Icon -->
                                  <rect x="42" y="30" width="12" height="20" rx="2" fill="white"/>
                                  <path d="M54 38H57C58.1046 38 59 38.8954 59 40V46C59 47.1046 58.1046 48 57 48H54" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                                  <!-- Destination Label/Highlight -->
                                  <circle cx="50" cy="45" r="32" stroke="white" stroke-width="1.5" stroke-opacity="0.5"/>
                                </svg>
                      ''',
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
