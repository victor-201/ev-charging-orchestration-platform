import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../domain/entities/station_entity.dart';
import 'station_marker_svgs.dart';

/// Dynamic SVG Charging Station Map Marker Widget
///
/// Renders dynamic stateful marker shapes and colors based on a station's current
/// operational status, connector capacity, and live charger availabilities.
class StationMarker extends StatelessWidget {
  final StationEntity station;
  final bool isSelected;
  final VoidCallback onTap;

  const StationMarker({
    super.key,
    required this.station,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final statusData = _getStationStatusData(station);

    return SizedBox(
      width: isSelected ? 45 : 35,
      height: isSelected ? 60 : 48,
      child: SvgPicture.string(
          StationMarkerSvgs.getSvg(
            status: statusData.statusKey,
            text: statusData.text,
            isSelected: isSelected,
          ),
          fit: BoxFit.contain,
        ),
    );
  }

  _MarkerStatusData _getStationStatusData(StationEntity station) {
    // 1. Resolve global lifecycle and maintenance states.
    if (station.status.toLowerCase() == 'closed') {
      return _MarkerStatusData('closed', 'CLOSE');
    }
    if (station.status.toLowerCase() == 'maintenance') {
      return _MarkerStatusData('maintenance', 'MAINT');
    }
    if (station.status.toLowerCase() == 'inactive') {
      return _MarkerStatusData('inactive', 'OFF');
    }

    // 2. Process aggregate metrics to calculate slots availability.
    final int total = station.totalChargers;
    final int availableCount = station.availableChargers;

    if (total == 0) {
      return _MarkerStatusData('inactive', '0/0');
    }

    // Active - Occupied status (zero vacant slots available) -> Red theme.
    if (availableCount == 0) {
      return _MarkerStatusData('active_full', '0/$total');
    }

    // Active - Available status (has vacant slots available) -> Green theme.
    return _MarkerStatusData('active_empty', '$availableCount/$total');
  }
}

class _MarkerStatusData {
  final String statusKey;
  final String text;

  _MarkerStatusData(this.statusKey, this.text);
}
