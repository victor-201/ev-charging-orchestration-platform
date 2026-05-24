import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:flutter_map_marker_cluster/flutter_map_marker_cluster.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../domain/entities/station_entity.dart';
import 'station_marker.dart';

class MapClusterLayer extends StatefulWidget {
  final List<StationEntity> stations;
  final String? selectedStationId;
  final Function(StationEntity) onStationTapped;
  final MapController mapController;

  const MapClusterLayer({
    super.key,
    required this.stations,
    required this.selectedStationId,
    required this.onStationTapped,
    required this.mapController,
  });

  @override
  State<MapClusterLayer> createState() => _MapClusterLayerState();
}

class _MapClusterLayerState extends State<MapClusterLayer> {
  List<Marker> _markers = [];
  List<StationEntity>? _lastStations;
  String? _lastSelectedId;

  @override
  void didUpdateWidget(MapClusterLayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Only rebuild the markers list when data actually changes
    if (widget.stations != _lastStations || widget.selectedStationId != _lastSelectedId) {
      _rebuildMarkers();
    }
  }

  @override
  void initState() {
    super.initState();
    _rebuildMarkers();
  }

  void _rebuildMarkers() {
    _lastStations = widget.stations;
    _lastSelectedId = widget.selectedStationId;
    _markers = widget.stations.map((station) {
      final isSelected = widget.selectedStationId == station.id;
      const double markerWidth = 46.0;
      const double markerHeight = markerWidth * (245.0 / 180.0);
      return Marker(
        key: ValueKey('station_${station.id}'),
        point: LatLng(station.latitude, station.longitude),
        width: markerWidth,
        height: markerHeight,
        rotate: true,
        alignment: const Alignment(0.0, -0.2653),
        child: StationMarker(
          station: station,
          isSelected: isSelected,
        ),
      );
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return MarkerClusterLayerWidget(
      options: MarkerClusterLayerOptions(
        maxClusterRadius: 50,
        size: const Size(46, 46),
        rotate: true,
        markers: _markers,
        onMarkerTap: (marker) {
          final key = marker.key as ValueKey<String>?;
          if (key == null) return;
          final stationId = key.value.replaceFirst('station_', '');
          final station = widget.stations.firstWhere((s) => s.id == stationId);
          widget.onStationTapped(station);
        },
        builder: (context, markers) {
          return RepaintBoundary(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                if (markers.isEmpty) return;
                final points = markers.map((m) => m.point).toList();
                final bounds = LatLngBounds.fromPoints(points);
                widget.mapController.fitCamera(
                  CameraFit.bounds(
                    bounds: bounds,
                    padding: const EdgeInsets.all(120),
                  ),
                );
              },
              child: Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: AppColors.cyanLimeGradient,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.8),
                    width: 2.0,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.white.withValues(alpha: 0.3),
                      blurRadius: 4,
                      spreadRadius: 1,
                    ),
                    BoxShadow(
                      color: AppColors.cyan.withValues(alpha: 0.5),
                      blurRadius: 20,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Positioned.fill(
                      child: Container(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Colors.white.withValues(alpha: 0.4),
                              Colors.transparent,
                            ],
                            stops: const [0.0, 0.5],
                          ),
                        ),
                      ),
                    ),
                    Text(
                      '${markers.length}',
                      style: const TextStyle(
                        fontFamily: 'Inter',
                        fontWeight: FontWeight.w900,
                        fontSize: 14,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

