import 'package:flutter/material.dart';
import '../../domain/entities/station_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';

/// Map pin marker for a charging station.
///
/// Visual state is derived purely from [StationEntity.status] and live
/// charger counts. Shape is a teardrop — the anchor point (geographic
/// coordinate) aligns with the vertical center of the circular bulb, not
/// the tip. All gradient tokens are sourced from [AppColors] so any
/// brand-level palette change propagates automatically.
///
/// States
///   available    — [AppColors.markerAvailable]   (≥1 charger free)
///   full         — [AppColors.markerFull]         (0 chargers free, shows X/X)
///   maintenance  — [AppColors.markerMaintenance]  (station temporarily offline)
///   closed       — [AppColors.markerClosed]       (station temporarily closed)
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

  // ── Status resolution ─────────────────────────────────────────────────────

  _PinData _resolve(StationEntity s) {
    final st = s.status.toLowerCase();

    if (st == 'closed') {
      return const _PinData(
        gradient: AppColors.markerClosed,
        shadow:   AppColors.markerShadowClosed,
        icon:     Icons.lock_outline_rounded,
        label:    'CLOSE',
      );
    }

    if (st == 'maintenance') {
      return const _PinData(
        gradient: AppColors.markerMaintenance,
        shadow:   AppColors.markerShadowMaintenance,
        icon:     Icons.build_rounded,
        label:    'MAIN',
      );
    }

    if (st == 'inactive') {
      return const _PinData(
        gradient: AppColors.markerInactive,
        shadow:   AppColors.markerShadowInactive,
        icon:     Icons.power_off_rounded,
        label:    'INACT',
      );
    }

    // Active — derive from live charger counts
    final total     = s.totalChargers;
    final available = s.availableChargers;
    final inUse     = total - available;

    if (total == 0 || available == 0) {
      // All chargers occupied — show occupied/total so user knows capacity
      return _PinData(
        gradient: AppColors.markerFull,
        shadow:   AppColors.markerShadowFull,
        icon:     Icons.ev_station_rounded,
        label:    '$total/$total',
      );
    }

    // At least one charger free — primary brand gradient
    return _PinData(
      gradient: AppColors.markerAvailable,
      shadow:   AppColors.markerShadowAvailable,
      icon:     Icons.ev_station_rounded,
      label:    '$inUse/$total',
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final pin = _resolve(station);

    // Fixed dimensions — changes here must also update the Marker alignment
    // in MapClusterLayer (alignment: Alignment(0, -0.2653) maps the bulb
    // center = width/2 to the coordinate anchor).
    const double w = 46.0;
    const double h = w * (245.0 / 180.0); // ≈ 62.6 px

    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: w,
        height: h,
        child: RepaintBoundary(
          child: Stack(
            alignment: Alignment.topCenter,
            children: [
              CustomPaint(
                size: const Size(w, h),
                painter: _TeardropPainter(
                  gradient:    pin.gradient,
                  shadowColor: pin.shadow,
                  isSelected:  isSelected,
                ),
              ),

              // Content anchored to the circular bulb (top w×w region)
              Positioned(
                top: 3,
                left: 0,
                right: 0,
                child: SizedBox(
                  width: w,
                  height: w,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(pin.icon, color: Colors.white, size: 17),
                        const SizedBox(height: 1),
                        Text(
                          pin.label,
                          style: const TextStyle(
                            fontFamily:    'Inter',
                            color:         Colors.white,
                            fontWeight:    FontWeight.w900,
                            fontSize:      10,
                            letterSpacing: -0.5,
                            height:        1.0,
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
    );
  }
}

// ── Internal data holder ──────────────────────────────────────────────────────

class _PinData {
  final LinearGradient gradient;
  final Color shadow;
  final IconData icon;
  final String label;

  const _PinData({
    required this.gradient,
    required this.shadow,
    required this.icon,
    required this.label,
  });
}

// ── Painter ───────────────────────────────────────────────────────────────────

/// Renders a teardrop-shaped pin with a status gradient fill, glass sheen
/// overlay, and a drop shadow sized to the selection state.
///
/// Paint objects and the path are cached per [Size] instance to avoid
/// per-frame shader reallocations across the ~300 markers on the map.
class _TeardropPainter extends CustomPainter {
  final LinearGradient gradient;
  final Color shadowColor;
  final bool isSelected;

  _TeardropPainter({
    required this.gradient,
    required this.shadowColor,
    required this.isSelected,
  });

  Paint? _fillPaint;
  Paint? _sheenPaint;
  Paint? _strokePaint;
  Path?  _path;
  Size?  _size;

  @override
  void paint(Canvas canvas, Size size) {
    // Rebuild path and paints only when size changes (marker dimensions are
    // fixed at 46×62.6 px, so this executes once per painter instance).
    if (_path == null || _size != size) {
      _path        = _buildPath(size);
      _size        = size;
      _fillPaint   = null;
      _sheenPaint  = null;
      _strokePaint = null;
    }

    final path = _path!;
    final rect = Rect.fromLTWH(0, 0, size.width, size.height);

    // Elevation shadow — larger when selected to lift the pin above cluster
    canvas.drawShadow(
      path,
      shadowColor.withValues(alpha: isSelected ? 0.80 : 0.50),
      isSelected ? 20.0 : 10.0,
      false,
    );

    // Status gradient fill
    _fillPaint ??= Paint()..style = PaintingStyle.fill;
    _fillPaint!.shader = gradient.createShader(rect);
    canvas.drawPath(path, _fillPaint!);

    // Diagonal glass sheen — constant across all states for visual consistency
    _sheenPaint ??= Paint()
      ..shader = const LinearGradient(
        begin:  Alignment.topLeft,
        end:    Alignment.center,
        colors: [Color(0x55FFFFFF), Colors.transparent],
      ).createShader(const Rect.fromLTWH(0, 0, 46, 46))
      ..style = PaintingStyle.fill;
    canvas.drawPath(path, _sheenPaint!);

    // Border — full-opacity white when selected for clear visual feedback
    _strokePaint ??= Paint()..style = PaintingStyle.stroke;
    _strokePaint!
      ..color       = Colors.white.withValues(alpha: isSelected ? 1.0 : 0.60)
      ..strokeWidth = isSelected ? 2.5 : 1.5;
    canvas.drawPath(path, _strokePaint!);
  }

  /// Teardrop path derived from SVG:
  ///   M 0,-90 … Z  (origin at bulb center, tip at +155 below center)
  /// Scaled to [size] so the shape adapts if marker dimensions ever change.
  Path _buildPath(Size s) {
    final sx = s.width  / 180.0;
    final sy = s.height / 245.0;
    return Path()
      ..moveTo(90 * sx, 0)
      ..cubicTo(35 * sx, 0,         0,           35 * sy,  0,           90 * sy)
      ..cubicTo( 0,       128 * sy,  22 * sx,    160 * sy,  50 * sx,    185 * sy)
      ..lineTo( 90 * sx, 245 * sy)
      ..lineTo(130 * sx, 185 * sy)
      ..cubicTo(158 * sx, 160 * sy, 180 * sx,   128 * sy, 180 * sx,    90 * sy)
      ..cubicTo(180 * sx,  35 * sy, 145 * sx,    0,        90 * sx,     0)
      ..close();
  }

  @override
  bool shouldRepaint(covariant _TeardropPainter old) =>
      old.gradient    != gradient    ||
      old.shadowColor != shadowColor ||
      old.isSelected  != isSelected;
}
