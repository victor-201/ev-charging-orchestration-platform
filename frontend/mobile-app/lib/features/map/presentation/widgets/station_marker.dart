import 'package:flutter/material.dart';
import '../../domain/entities/station_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';

/// Dynamic Liquid Glass Charging Station Map Marker Widget
///
/// Renders dynamic stateful marker shapes and colors based on a station's current
/// operational status, connector capacity, and live charger availabilities.
/// Rebuilt with Liquid Glass UI patterns as a Teardrop pin.
class StationMarker extends StatelessWidget {
  final StationEntity station;
  final bool isSelected;
  final VoidCallback? onTap;

  const StationMarker({
    super.key,
    required this.station,
    required this.isSelected,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final statusData = _getStationStatusData(station);
    final gradient = _getGradientForStatus(statusData.statusKey);
    final shadowColor = _getShadowForStatus(statusData.statusKey);

    // Fixed size regardless of selection to prevent enlargement on click
    final double width = 46.0;
    final double height = width * (245.0 / 180.0);

    return GestureDetector(
      onTap: onTap,
      child: AnimatedScale(
        scale: 1.0, // Disable scale up on click
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOutBack,
        child: SizedBox(
          width: width,
          height: height,
          child: RepaintBoundary(
            child: Stack(
              alignment: Alignment.topCenter,
              children: [
                // Teardrop Shape Painter (Gradient, Border, Shadow)
                CustomPaint(
                  size: Size(width, height),
                  painter: _TeardropGlassPainter(
                    gradient: gradient,
                    shadowColor: shadowColor,
                    isSelected: isSelected,
                  ),
                ),
                // Content (Centered exactly in the circular bulb of the teardrop, shifted slightly down for optical balance)
                Positioned(
                  top: 3, // Lowered slightly to fit the teardrop's center of mass better
                  left: 0,
                  right: 0,
                  child: SizedBox(
                    width: width,
                    height: width, // The circular head of the teardrop has diameter = width
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            _getIconForStatus(statusData.statusKey),
                            color: Colors.white,
                            size: 20, // Reduced slightly to fit perfectly with the text
                          ),
                          Transform.translate(
                            offset: const Offset(0, -1), // Slight optical adjustment
                            child: Text(
                              statusData.text,
                              style: const TextStyle(
                                fontFamily: 'Inter',
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 11,
                                letterSpacing: -0.8,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  LinearGradient _getGradientForStatus(String status) {
    switch (status) {
      case 'active_full':
        return const LinearGradient(colors: [Color(0xFFFD6585), AppColors.danger]);
      case 'active_empty':
        return AppColors.cyanLimeGradient;
      case 'active_partial':
        return AppColors.blueCyanGradient;
      case 'maintenance':
        return AppColors.yellowOrangeGradient;
      case 'closed':
      case 'inactive':
      default:
        return const LinearGradient(colors: [Color(0xFF9CA3AF), Color(0xFF4B5563)]);
    }
  }

  Color _getShadowForStatus(String status) {
    switch (status) {
      case 'active_full':
        return AppColors.danger;
      case 'active_empty':
        return AppColors.lime;
      case 'active_partial':
        return AppColors.cyan;
      case 'maintenance':
        return AppColors.yellow;
      case 'closed':
      case 'inactive':
      default:
        return const Color(0xFF4B5563);
    }
  }

  IconData _getIconForStatus(String status) {
    switch (status) {
      case 'active_full':
      case 'active_empty':
      case 'active_partial':
        return Icons.ev_station_rounded;
      case 'maintenance':
        return Icons.build_circle_rounded;
      case 'closed':
      case 'inactive':
      default:
        return Icons.do_not_disturb_alt_rounded;
    }
  }

  _MarkerStatusData _getStationStatusData(StationEntity station) {
    if (station.status.toLowerCase() == 'closed') {
      return _MarkerStatusData('closed', 'CLOSE');
    }
    if (station.status.toLowerCase() == 'maintenance') {
      return _MarkerStatusData('maintenance', 'MAINT');
    }
    if (station.status.toLowerCase() == 'inactive') {
      return _MarkerStatusData('inactive', 'OFF');
    }

    final int total = station.totalChargers;
    final int availableCount = station.availableChargers;

    if (total == 0) {
      return _MarkerStatusData('inactive', '0/0');
    }

    if (availableCount == 0) {
      return _MarkerStatusData('active_full', '$total/$total');
    }

    final int unavailableCount = total - availableCount;
    return _MarkerStatusData('active_empty', '$unavailableCount/$total');
  }
}

class _MarkerStatusData {
  final String statusKey;
  final String text;

  _MarkerStatusData(this.statusKey, this.text);
}

class _TeardropGlassPainter extends CustomPainter {
  final LinearGradient gradient;
  final Color shadowColor;
  final bool isSelected;

  _TeardropGlassPainter({
    required this.gradient,
    required this.shadowColor,
    required this.isSelected,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final path = _getTeardropPath(size);

    // 1. Draw glowing outer shadow
    canvas.drawShadow(
      path,
      shadowColor.withValues(alpha: isSelected ? 0.7 : 0.4),
      isSelected ? 16.0 : 8.0,
      false, // transparentOccluder
    );

    // 2. Fill with main gradient
    final fillPaint = Paint()
      ..shader = gradient.createShader(Rect.fromLTWH(0, 0, size.width, size.height))
      ..style = PaintingStyle.fill;
    canvas.drawPath(path, fillPaint);

    // 3. Add diagonal glass highlight (Top-left to bottom-right)
    final highlightGradient = LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Colors.white.withValues(alpha: 0.4),
        Colors.transparent,
      ],
      stops: const [0.0, 0.6],
    );
    final highlightPaint = Paint()
      ..shader = highlightGradient.createShader(Rect.fromLTWH(0, 0, size.width, size.height))
      ..style = PaintingStyle.fill;
    canvas.drawPath(path, highlightPaint);

    // 4. Draw border stroke (Glass edge)
    final strokePaint = Paint()
      ..color = isSelected ? Colors.white : Colors.white.withValues(alpha: 0.6)
      ..style = PaintingStyle.stroke
      ..strokeWidth = isSelected ? 2.5 : 1.5;
    canvas.drawPath(path, strokePaint);
  }

  Path _getTeardropPath(Size size) {
    final path = Path();
    // Path translated and scaled from SVG:
    // M 0,-90 C -55,-90 -90,-55 -90,0 C -90,38 -68,70 -40,95 L 0,155 L 40,95 C 68,70 90,38 90,0 C 90,-55 55,-90 0,-90 Z
    // Shifted (+90, +90) => Width 180, Height 245
    // Top-Center is (90, 0). Tip is (90, 245).
    final sx = size.width / 180.0;
    final sy = size.height / 245.0;

    path.moveTo(90 * sx, 0 * sy);
    path.cubicTo(35 * sx, 0 * sy, 0 * sx, 35 * sy, 0 * sx, 90 * sy);
    path.cubicTo(0 * sx, 128 * sy, 22 * sx, 160 * sy, 50 * sx, 185 * sy);
    path.lineTo(90 * sx, 245 * sy);
    path.lineTo(130 * sx, 185 * sy);
    path.cubicTo(158 * sx, 160 * sy, 180 * sx, 128 * sy, 180 * sx, 90 * sy);
    path.cubicTo(180 * sx, 35 * sy, 145 * sx, 0 * sy, 90 * sx, 0 * sy);
    path.close();

    return path;
  }

  @override
  bool shouldRepaint(covariant _TeardropGlassPainter oldDelegate) {
    return oldDelegate.gradient != gradient ||
        oldDelegate.shadowColor != shadowColor ||
        oldDelegate.isSelected != isSelected;
  }
}
