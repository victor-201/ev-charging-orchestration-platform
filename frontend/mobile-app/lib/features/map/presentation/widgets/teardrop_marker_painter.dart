import 'dart:ui' as ui;
import 'package:flutter/material.dart';

/// Renders a premium, high-visibility inverted teardrop map marker with custom canvas paths.
class TeardropMarkerPainter extends CustomPainter {
  final Color color;
  final bool isSelected;

  TeardropMarkerPainter({
    required this.color,
    this.isSelected = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // 1. Shadow Paint
    final shadowPaint = Paint()
      ..color = Colors.black.withValues(alpha: 0.3)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);

    // 2. Main Fill Paint (Gradient)
    final fillPaint = Paint()
      ..shader = ui.Gradient.linear(
        Offset(w / 2, 0),
        Offset(w / 2, h),
        [
          color,
          _getDarkerColor(color),
        ],
      )
      ..style = PaintingStyle.fill;

    // 3. Border Paint (Prominent White)
    final borderPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = isSelected ? 3.5 : 2.5
      ..strokeCap = StrokeCap.round;

    // 4. Subtle Outer Border (For contrast against white map areas)
    final outerStrokePaint = Paint()
      ..color = Colors.black.withValues(alpha: 0.1)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.5;

    final path = ui.Path();
    
    // Generate a smooth geometric teardrop path.
    // Start at the bottom sharp apex point.
    path.moveTo(w / 2, h);
    
    // Draw the left upward bezier curve.
    path.cubicTo(
      w * 0.1, h * 0.8, // Control point 1
      0, h * 0.5,       // Control point 2
      0, h * 0.35,      // End point
    );
    
    // Draw the top circular arc.
    path.arcToPoint(
      Offset(w, h * 0.35),
      radius: Radius.circular(w / 2),
      clockwise: true,
    );
    
    // Draw the right downward bezier curve.
    path.cubicTo(
      w, h * 0.5,       // Control point 1
      w * 0.9, h * 0.8, // Control point 2
      w / 2, h,         // End point
    );
    
    path.close();

    // Draw elements sequentially to respect standard layering hierarchy.
    canvas.drawPath(path.shift(const Offset(0, 3)), shadowPaint); // Shadow
    canvas.drawPath(path, fillPaint);                            // Fill
    canvas.drawPath(path, borderPaint);                          // White Border
    canvas.drawPath(path, outerStrokePaint);                     // Subtle Contrast Stroke

    // Draw the inner white circle container designed to nest SVG icons.
    final innerCircleRadius = w * 0.32;
    final innerCirclePaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    
    canvas.drawCircle(Offset(w / 2, h * 0.38), innerCircleRadius, innerCirclePaint);
  }

  Color _getDarkerColor(Color color) {
    final hsv = HSVColor.fromColor(color);
    return hsv.withValue((hsv.value - 0.2).clamp(0.0, 1.0)).toColor();
  }

  @override
  bool shouldRepaint(covariant TeardropMarkerPainter oldDelegate) {
    return oldDelegate.color != color || oldDelegate.isSelected != isSelected;
  }
}
