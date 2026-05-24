import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Circular dynamic battery state-of-charge widget
/// Update animation interval: 800ms easeInOut
class LiveMeterWidget extends StatefulWidget {
  final double socPercent;
  final String costVnd;
  final bool isAnimated;

  const LiveMeterWidget({
    super.key,
    required this.socPercent,
    required this.costVnd,
    this.isAnimated = true,
  });

  @override
  State<LiveMeterWidget> createState() => _LiveMeterWidgetState();
}

class _LiveMeterWidgetState extends State<LiveMeterWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _socAnimation;
  double _previousSoc = 0;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _socAnimation = Tween<double>(
      begin: 0,
      end: widget.socPercent,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOut,
    ));
    if (widget.isAnimated) _controller.forward();
  }

  @override
  void didUpdateWidget(LiveMeterWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.socPercent != widget.socPercent) {
      _previousSoc = oldWidget.socPercent;
      _socAnimation = Tween<double>(
        begin: _previousSoc,
        end: widget.socPercent,
      ).animate(CurvedAnimation(
        parent: _controller,
        curve: Curves.easeInOut,
      ));
      _controller
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _socAnimation,
      builder: (context, _) {
        final soc = _socAnimation.value;
        return SizedBox(
          width: 200,
          height: 200,
          child: CustomPaint(
            painter: _SocGaugePainter(socPercent: soc),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${soc.toStringAsFixed(0)}%',
                    style: AppTypography.displayMd.copyWith(
                      color: _socColor(soc),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    'SoC',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.grey600,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    widget.costVnd,
                    style: AppTypography.bodyMd.copyWith(
                      color: AppColors.secondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Color _socColor(double soc) {
    if (soc < 20) return AppColors.error;
    if (soc < 50) return AppColors.warning;
    return AppColors.primary;
  }
}

class _SocGaugePainter extends CustomPainter {
  final double socPercent;

  _SocGaugePainter({required this.socPercent});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 12;

    // Draw static track ring
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi * 0.8,
      math.pi * 1.6,
      false,
      Paint()
        ..color = AppColors.outlineLight
        ..strokeWidth = 12
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round,
    );

    // Draw active battery level progress ring
    final progress = (socPercent / 100).clamp(0.0, 1.0);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi * 0.8,
      math.pi * 1.6 * progress,
      false,
      Paint()
        ..shader = const SweepGradient(
          startAngle: -math.pi * 0.8,
          endAngle: -math.pi * 0.8 + math.pi * 1.6,
          colors: [
            AppColors.warning,
            AppColors.primary,
            AppColors.secondary,
          ],
          stops: [0.0, 0.5, 1.0],
        ).createShader(Rect.fromCircle(center: center, radius: radius))
        ..strokeWidth = 12
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_SocGaugePainter oldDelegate) =>
      oldDelegate.socPercent != socPercent;
}
