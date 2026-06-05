import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Circular dynamic battery state-of-charge widget with neon glow and glowing tip indicator
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
      duration: const Duration(milliseconds: 1200),
    );
    _socAnimation = Tween<double>(
      begin: 0,
      end: widget.socPercent,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutBack,
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
        curve: Curves.easeOutCubic,
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

  Color _socColor(double soc) {
    if (soc < 20) return AppColors.error;
    if (soc < 50) return AppColors.warning;
    return AppColors.primary;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return AnimatedBuilder(
      animation: _socAnimation,
      builder: (context, _) {
        final soc = _socAnimation.value;
        final color = _socColor(soc);
        
        return SizedBox(
          width: 220,
          height: 220,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Outer glass reflection ring
              Container(
                width: 218,
                height: 218,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: isDark 
                        ? Colors.white.withValues(alpha: 0.04) 
                        : Colors.black.withValues(alpha: 0.02),
                    width: 2,
                  ),
                ),
              ),
              // Main Gauge painting
              Positioned.fill(
                child: CustomPaint(
                  painter: _SocGaugePainter(
                    socPercent: soc,
                    isDark: isDark,
                    activeColor: color,
                  ),
                ),
              ),
              // Center textual telemetry
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // SoC Pill
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(AppRadius.full),
                        border: Border.all(color: color.withValues(alpha: 0.2), width: 1),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.battery_charging_full_rounded, size: 10, color: color),
                          const SizedBox(width: 3),
                          Text(
                            'SOC',
                            style: AppTypography.caption.copyWith(
                              color: color,
                              fontWeight: FontWeight.w800,
                              fontSize: 9,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    // Percentage display with heavy typography
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          soc.toStringAsFixed(0),
                          style: AppTypography.displayLg.copyWith(
                            color: isDark ? Colors.white : AppColors.pillTextLight,
                            fontWeight: FontWeight.w900,
                            height: 1.0,
                            fontSize: 54,
                          ),
                        ),
                        Text(
                          '%',
                          style: AppTypography.bodyLg.copyWith(
                            color: color,
                            fontWeight: FontWeight.w800,
                            height: 1.3,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    // Cost / Amount Charged
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: isDark 
                            ? Colors.white.withValues(alpha: 0.04) 
                            : Colors.black.withValues(alpha: 0.03),
                        borderRadius: BorderRadius.circular(AppRadius.sm),
                        border: Border.all(
                          color: isDark 
                              ? Colors.white.withValues(alpha: 0.06) 
                              : Colors.black.withValues(alpha: 0.04),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.monetization_on_rounded, 
                            color: AppColors.chargerAvailable, 
                            size: 14,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            widget.costVnd,
                            style: AppTypography.caption.copyWith(
                              color: isDark ? Colors.white70 : AppColors.pillTextLight,
                              fontWeight: FontWeight.w800,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SocGaugePainter extends CustomPainter {
  final double socPercent;
  final bool isDark;
  final Color activeColor;

  _SocGaugePainter({
    required this.socPercent,
    required this.isDark,
    required this.activeColor,
  });

  Color _getTipColor(double progress) {
    if (progress < 0.3) {
      return AppColors.error;
    } else if (progress < 0.65) {
      return AppColors.warning;
    } else {
      return AppColors.secondary;
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 12;

    // Draw static track ring (adapted for theme background)
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi * 0.8,
      math.pi * 1.6,
      false,
      Paint()
        ..color = isDark 
            ? Colors.white.withValues(alpha: 0.06) 
            : Colors.black.withValues(alpha: 0.04)
        ..strokeWidth = 10
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round,
    );

    final progress = (socPercent / 100).clamp(0.0, 1.0);
    if (progress <= 0) return;

    final sweepAngle = math.pi * 1.6 * progress;
    const startAngle = -math.pi * 0.8;

    // 1. Draw glowing neon aura underneath the progress arc
    final glowPaint = Paint()
      ..shader = SweepGradient(
        startAngle: startAngle,
        endAngle: startAngle + math.pi * 1.6,
        colors: [
          AppColors.error.withValues(alpha: 0.3),
          AppColors.warning.withValues(alpha: 0.3),
          AppColors.primary.withValues(alpha: 0.3),
          AppColors.secondary.withValues(alpha: 0.3),
        ],
        stops: const [0.0, 0.3, 0.65, 1.0],
      ).createShader(Rect.fromCircle(center: center, radius: radius))
      ..strokeWidth = 18
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      glowPaint,
    );

    // 2. Draw active battery level progress ring
    final progressPaint = Paint()
      ..shader = SweepGradient(
        startAngle: startAngle,
        endAngle: startAngle + math.pi * 1.6,
        colors: const [
          AppColors.error,
          AppColors.warning,
          AppColors.primary,
          AppColors.secondary,
        ],
        stops: const [0.0, 0.3, 0.65, 1.0],
      ).createShader(Rect.fromCircle(center: center, radius: radius))
      ..strokeWidth = 10
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      sweepAngle,
      false,
      progressPaint,
    );

    // 3. Draw a glowing dot at the tip of the progress bar
    final endAngle = startAngle + sweepAngle;
    final tipX = center.dx + radius * math.cos(endAngle);
    final tipY = center.dy + radius * math.sin(endAngle);
    final tipCenter = Offset(tipX, tipY);
    final tipColor = _getTipColor(progress);

    // Halo glow around tip
    canvas.drawCircle(
      tipCenter,
      12.0,
      Paint()
        ..color = tipColor.withValues(alpha: 0.4)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );

    // Inner bright tip circle
    canvas.drawCircle(
      tipCenter,
      5.0,
      Paint()..color = Colors.white,
    );

    canvas.drawCircle(
      tipCenter,
      3.0,
      Paint()..color = tipColor,
    );
  }

  @override
  bool shouldRepaint(_SocGaugePainter oldDelegate) =>
      oldDelegate.socPercent != socPercent || oldDelegate.isDark != isDark;
}
