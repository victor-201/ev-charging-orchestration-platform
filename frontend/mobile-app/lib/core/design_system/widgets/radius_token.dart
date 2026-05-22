import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// RadiusToken — 64×64 poker-chip style token
/// Matches test.html .token pattern:
/// - Circular with inner dashed ring (::after)
/// - Optional hexagon shape (clip-path)
/// - Custom bgColor for icon variants
class RadiusToken extends StatelessWidget {
  final Widget child;
  final Color? bgColor;
  final Color? shadowColor;
  final bool isHexagon;
  final double size;

  const RadiusToken({
    super.key,
    required this.child,
    this.bgColor,
    this.shadowColor,
    this.isHexagon = false,
    this.size = 64,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final Color bg = bgColor ??
        (isDark
            ? Colors.white.withValues(alpha: 0.1)
            : Colors.white.withValues(alpha: 0.85));

    final Color glow = shadowColor ??
        Colors.black.withValues(alpha: 0.05);

    final Color tokenBorder = isDark
        ? AppColors.cardBorderDark
        : Colors.white.withValues(alpha: 0.2);

    final Color dashedRing = isDark
        ? Colors.white.withValues(alpha: 0.2)
        : Colors.white.withValues(alpha: 0.5);

    Widget token = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
        border: Border.all(color: tokenBorder),
        boxShadow: [
          // Colored glow
          BoxShadow(
            color: glow,
            blurRadius: 25,
            offset: const Offset(0, 15),
          ),
          // Inset top shine
          BoxShadow(
            color: Colors.white.withValues(
                alpha: isDark ? 0.2 : 0.6),
            blurRadius: 6,
            offset: const Offset(0, 4),
          ),
          // Inset bottom shadow
          BoxShadow(
            color: Colors.black.withValues(
                alpha: isDark ? 0.5 : 0.2),
            blurRadius: 6,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Inner dashed ring (::after pseudo-element)
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.all(5),
              child: CustomPaint(
                painter: _DashedCirclePainter(color: dashedRing),
              ),
            ),
          ),
          // Content
          child,
        ],
      ),
    );

    if (isHexagon) {
      token = ClipPath(
        clipper: _HexagonClipper(),
        child: token,
      );
    }

    return token;
  }
}

// ── Dashed circle painter ─────────────────────────────────────
class _DashedCirclePainter extends CustomPainter {
  final Color color;
  const _DashedCirclePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width / 2) - 1;
    const dashLength = 6.0;
    const gapLength = 4.0;
    const totalLength = dashLength + gapLength;

    final circumference = 2 * 3.14159 * radius;
    final dashCount = (circumference / totalLength).floor();
    final angleStep = 2 * 3.14159 / dashCount;
    final dashAngle = angleStep * (dashLength / totalLength);

    for (int i = 0; i < dashCount; i++) {
      final startAngle = i * angleStep;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle,
        dashAngle,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_DashedCirclePainter old) => old.color != color;
}

// ── Hexagon clipper ───────────────────────────────────────────
class _HexagonClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final w = size.width;
    final h = size.height;
    return Path()
      ..moveTo(w * 0.25, 0)
      ..lineTo(w * 0.75, 0)
      ..lineTo(w, h * 0.5)
      ..lineTo(w * 0.75, h)
      ..lineTo(w * 0.25, h)
      ..lineTo(0, h * 0.5)
      ..close();
  }

  @override
  bool shouldReclip(_HexagonClipper old) => false;
}
