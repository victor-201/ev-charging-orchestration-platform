import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// LiquidGlassCard — main frosted glass card component.
/// Matches test.html .glass-card spec: blur(60px), border-radius 36px,
/// subtle border, multi-layer box-shadow, corner markers.
///
/// Fix: Stack sizes itself from the non-Positioned Padding child (the content).
/// Corner markers are Positioned, overlaid without affecting layout size.
/// This prevents the "Stack requires bounded constraints" assertion when placed
/// inside SingleChildScrollView or Column.
class LiquidGlassCard extends StatelessWidget {
  final Widget child;
  final double? width;
  final double? height;
  final EdgeInsetsGeometry? padding;
  final bool showMarkers;

  const LiquidGlassCard({
    super.key,
    required this.child,
    this.width,
    this.height,
    this.padding,
    this.showMarkers = true,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final markerColor = isDark ? AppColors.markerDark : AppColors.markerLight;

    // Automatically hide markers if padding is too small (< 30) to prevent content overlap
    bool shouldShowMarkers = showMarkers;
    final pad = padding;
    if (pad is EdgeInsets) {
      if (pad.left < 30 || pad.right < 30 || pad.top < 30 || pad.bottom < 30) {
        shouldShowMarkers = false;
      }
    }

    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(36),
        boxShadow: [
          BoxShadow(
            color: isDark
                ? Colors.black.withValues(alpha: 0.5)
                : Colors.black.withValues(alpha: 0.1),
            blurRadius: 60,
            offset: const Offset(0, 30),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(36),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 60, sigmaY: 60),
          child: Container(
            decoration: BoxDecoration(
              color: isDark ? AppColors.cardDark : AppColors.cardLight,
              borderRadius: BorderRadius.circular(36),
              border: Border.all(
                color: isDark
                    ? AppColors.cardBorderDark
                    : AppColors.cardBorderLight,
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.1)
                      : Colors.white.withValues(alpha: 1.0),
                  offset: const Offset(0, 2),
                  blurRadius: 2,
                ),
                BoxShadow(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.05)
                      : Colors.white.withValues(alpha: 0.4),
                  blurRadius: 40,
                  spreadRadius: -10,
                ),
              ],
            ),
            // Stack: non-Positioned child (Padding) drives intrinsic size.
            // Positioned corner markers overlay without affecting size.
            child: Stack(
              children: [
                Padding(
                  padding: padding ?? const EdgeInsets.all(40),
                  child: child,
                ),
                if (shouldShowMarkers) ...[
                  _marker(top: 20, left: 20, color: markerColor),
                  _marker(top: 20, right: 20, color: markerColor),
                  _marker(bottom: 20, left: 20, color: markerColor),
                  _marker(bottom: 20, right: 20, color: markerColor),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _marker({
    double? top,
    double? bottom,
    double? left,
    double? right,
    required Color color,
  }) {
    return Positioned(
      top: top,
      bottom: bottom,
      left: left,
      right: right,
      child: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: color, width: 1.5),
        ),
      ),
    );
  }
}
