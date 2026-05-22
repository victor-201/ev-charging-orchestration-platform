import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import '../../../../core/design_system/theme/app_colors.dart';

/// GPS User Location Map Marker Widget
///
/// Renders a radial glow pulse effect representing coordinates accuracy alongside
/// an orientation arrow calculated from active compass headings.
/// Uses AnimationController to smoothly animate heading changes (no more jerky jumps).
/// Handles 360°→0° wrap-around via shortest-path interpolation.
class UserLocationMarker extends StatefulWidget {
  final double? heading;
  final double size;

  const UserLocationMarker({
    super.key,
    this.heading,
    this.size = 60.0,
  });

  @override
  State<UserLocationMarker> createState() => _UserLocationMarkerState();
}

class _UserLocationMarkerState extends State<UserLocationMarker>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  /// Current animated angle in radians (accumulated, not wrapped to [-π, π]).
  double _currentAngle = 0.0;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _animation = _controller;
    // Seed with initial heading so first render matches sensor.
    _currentAngle = _toRad(widget.heading ?? 0.0);
  }

  @override
  void didUpdateWidget(UserLocationMarker oldWidget) {
    super.didUpdateWidget(oldWidget);

    // Map rotation is read inside build, but we only need it to compute
    // the final display angle. The raw heading drives the animation target.
    final newHeadingRad = _toRad(widget.heading ?? 0.0);

    // Compute the angular delta on shortest path [-π, π].
    double delta = _normalise(newHeadingRad - _currentAngle);

    final targetAngle = _currentAngle + delta;

    // Re-animate from current animated value to new target.
    _animation = Tween<double>(
      begin: _animation.value,
      end: targetAngle,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ));

    _currentAngle = targetAngle;
    _controller
      ..reset()
      ..forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Converts degrees to radians.
  double _toRad(double deg) => deg * (math.pi / 180.0);

  /// Wraps [delta] to the range (-π, π] — shortest rotation direction.
  double _normalise(double delta) {
    while (delta > math.pi) { delta -= 2 * math.pi; }
    while (delta <= -math.pi) { delta += 2 * math.pi; }
    return delta;
  }

  @override
  Widget build(BuildContext context) {
    final mapRotationRad = MapCamera.of(context).rotation * (math.pi / 180.0);
    final size = widget.size;

    return SizedBox(
      width: size,
      height: size,
      child: RepaintBoundary(
        child: AnimatedBuilder(
          animation: _animation,
          builder: (context, _) {
            // Subtract map rotation so the arrow always points true north-relative.
            final displayAngle = _animation.value - mapRotationRad;

            return Stack(
              alignment: Alignment.center,
              children: [
                // Outer Glow Pulse (static — doesn't rotate)
                Container(
                  width: size * 0.9,
                  height: size * 0.9,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primaryCyan.withValues(alpha: 0.45),
                        blurRadius: 20,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                ),

                // Rotating inner assembly: circle + dot + arrow
                Transform.rotate(
                  angle: displayAngle,
                  child: SizedBox(
                    width: size,
                    height: size,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // White-bordered glass circle
                        Container(
                          width: size * 0.5,
                          height: size * 0.5,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white.withValues(alpha: 0.15),
                            border: Border.all(
                              color: Colors.white,
                              width: 2.5,
                            ),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x33000000),
                                blurRadius: 8,
                                offset: Offset(0, 2),
                              ),
                            ],
                          ),
                        ),
                        // Core Cyan/Lime gradient dot
                        Container(
                          width: size * 0.35,
                          height: size * 0.35,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: AppColors.cyanLimeGradient,
                          ),
                        ),
                        // Directional arrow tip at top
                        Positioned(
                          top: size * 0.05,
                          child: CustomPaint(
                            size: Size(size * 0.2, size * 0.25),
                            painter: const _ArrowPainter(color: AppColors.primaryCyan),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ArrowPainter extends CustomPainter {
  final Color color;

  const _ArrowPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final path = Path()
      ..moveTo(size.width / 2, 0)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _ArrowPainter old) => old.color != color;
}
