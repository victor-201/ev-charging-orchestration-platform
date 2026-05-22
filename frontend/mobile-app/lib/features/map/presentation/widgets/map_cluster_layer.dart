import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:flutter_map_marker_cluster/flutter_map_marker_cluster.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../domain/entities/station_entity.dart';
import 'station_marker.dart';

class MapClusterLayer extends StatelessWidget {
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
  Widget build(BuildContext context) {
    return MarkerClusterLayerWidget(
      key: ValueKey('cluster_layer_${stations.length}_${selectedStationId ?? 'none'}'),
      options: MarkerClusterLayerOptions(
        maxClusterRadius: 50,
        size: const Size(46, 46),
        rotate: true,
        markers: (stations.toList()..sort((a, b) {
          // Bring selected station to the very front (drawn last)
          if (a.id == selectedStationId) return 1;
          if (b.id == selectedStationId) return -1;
          // Otherwise, sort by latitude descending (North to South)
          // so markers further South are drawn on top of markers further North.
          return b.latitude.compareTo(a.latitude);
        })).map((station) {
          final isSelected = selectedStationId == station.id;
          final double markerWidth = 46.0;
          final double markerHeight = markerWidth * (245.0 / 180.0);
          return Marker(
            key: ValueKey('station_${station.id}'),
            point: LatLng(station.latitude, station.longitude),
            width: markerWidth,
            height: markerHeight,
            rotate: true,
            // Align the center of the station's circular bulb (y = markerWidth / 2) with the coordinates.
            // y_alignment = (markerWidth / markerHeight) - 1.0 = (180.0 / 245.0) - 1.0 = -0.2653
            alignment: const Alignment(0.0, -0.2653),
            child: StationMarker(
              station: station,
              isSelected: isSelected,
            ),
          );
        }).toList(),
        onMarkerTap: (marker) {
          final key = marker.key as ValueKey<String>?;
          if (key == null) return;
          final stationId = key.value.replaceFirst('station_', '');
          final station = stations.firstWhere((s) => s.id == stationId);
          onStationTapped(station);
        },
        builder: (context, markers) {
          return RepaintBoundary(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                if (markers.isEmpty) return;
                final points = markers.map((m) => m.point).toList();
                final bounds = LatLngBounds.fromPoints(points);
                mapController.fitCamera(
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
                    // Inner highlight
                    BoxShadow(
                      color: Colors.white.withValues(alpha: 0.3),
                      blurRadius: 4,
                      spreadRadius: 1,
                    ),
                    // Outer Glow
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
                    // Diagonal glass shine
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
                    // Count Text
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

  // Helper because latlong2 LatLng cannot be imported if not in same file usually,
  // but we can just use the properties. Wait, we need to import latlong2.
}
