import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// A reusable container that implements the "Liquid Glass" neumorphism effect.
class GlassContainer extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double? width;
  final double? height;
  final BorderRadius? borderRadius;
  final bool enableBlur;

  const GlassContainer({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.width,
    this.height,
    this.borderRadius,
    this.enableBlur = true,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final radius = borderRadius ?? BorderRadius.circular(AppRadius.xl);

    final bgColor = isDark ? AppColors.glassBgDark : AppColors.glassBgLight;
    final borderColor = isDark ? AppColors.glassBorderDark : AppColors.glassBorderLight;
    final highlightColor = isDark ? AppColors.glassHighlightDark : AppColors.glassHighlightLight;
    
    // Ambient shadow
    final shadowColor = isDark 
        ? Colors.black.withValues(alpha: 0.45) 
        : const Color(0xFF0F172A).withValues(alpha: 0.08);

    Widget container = Container(
      width: width,
      height: height,
      padding: padding ?? const EdgeInsets.all(AppSpacing.lg),
      margin: margin,
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: radius,
        border: Border.all(color: borderColor),
        boxShadow: [
          BoxShadow(
            color: shadowColor,
            blurRadius: isDark ? 32 : 24,
            offset: const Offset(0, 8),
          ),
          // Inner highlight simulation
          BoxShadow(
            color: highlightColor,
            blurRadius: 0,
            spreadRadius: -1,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: child,
    );

    if (enableBlur) {
      return Padding(
        padding: margin ?? EdgeInsets.zero,
        child: ClipRRect(
          borderRadius: radius,
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
              // Remove margin inside BackdropFilter because it's handled outside
              margin: EdgeInsets.zero,
              width: width,
              height: height,
              padding: padding ?? const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: bgColor,
                borderRadius: radius,
                border: Border.all(color: borderColor),
              ),
              child: child,
            ),
          ),
        ),
      );
    }

    return container;
  }
}
