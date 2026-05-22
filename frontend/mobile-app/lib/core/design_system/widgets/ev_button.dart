import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Visual configuration variants: primary, secondary, danger, outlined
enum EVButtonVariant { primary, secondary, danger, outlined }

/// Reusable high-fidelity button component with Neon Glow & Glassmorphism
class EVButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool isOutlined;
  final EVButtonVariant variant;
  final IconData? icon;
  final Color? backgroundColor;
  final Color? foregroundColor;

  const EVButton({
    super.key,
    required this.label,
    this.onPressed,
    this.isLoading = false,
    this.isOutlined = false,
    this.variant = EVButtonVariant.primary,
    this.icon,
    this.backgroundColor,
    this.foregroundColor,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isVariantOutlined = isOutlined || variant == EVButtonVariant.outlined;

    // Foreground resolution
    Color resolveFg() {
      if (foregroundColor != null) return foregroundColor!;
      if (isVariantOutlined) return AppColors.primaryCyan;
      if (variant == EVButtonVariant.danger) return AppColors.white;
      if (variant == EVButtonVariant.secondary) return isDark ? AppColors.white : AppColors.black;
      return AppColors.white;
    }

    Widget childContent;
    if (isLoading) {
      childContent = SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          valueColor: AlwaysStoppedAnimation<Color>(resolveFg()),
        ),
      );
    } else if (icon != null) {
      childContent = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 20, color: resolveFg()),
          const SizedBox(width: AppSpacing.sm),
          Text(label, style: TextStyle(color: resolveFg())),
        ],
      );
    } else {
      childContent = Text(label, style: TextStyle(color: resolveFg()));
    }

    if (isVariantOutlined) {
      return SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          onPressed: isLoading ? null : onPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: resolveFg(),
            side: BorderSide(color: resolveFg(), width: 1.5),
          ),
          child: childContent,
        ),
      );
    }

    // Primary Button with Gradient and Neon Glow
    if (variant == EVButtonVariant.primary) {
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.md),
          gradient: backgroundColor == null ? AppColors.primaryGradient : null,
          color: backgroundColor,
          boxShadow: [
            BoxShadow(
              color: AppColors.primaryCyan.withValues(alpha: 0.35),
              blurRadius: 24,
              offset: const Offset(0, 4),
            )
          ],
        ),
        child: ElevatedButton(
          onPressed: isLoading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
          ),
          child: childContent,
        ),
      );
    }

    // Danger Button with soft red tint & glow
    if (variant == EVButtonVariant.danger) {
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.md),
          color: AppColors.danger.withValues(alpha: 0.9),
          boxShadow: [
            BoxShadow(
              color: AppColors.danger.withValues(alpha: 0.35),
              blurRadius: 24,
              offset: const Offset(0, 4),
            )
          ],
        ),
        child: ElevatedButton(
          onPressed: isLoading ? null : onPressed,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
          ),
          child: childContent,
        ),
      );
    }

    // Secondary Button (Translucent Glass)
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadius.md),
        color: isDark ? AppColors.glassBgDark : AppColors.glassBgLight,
        border: Border.all(
          color: isDark ? AppColors.glassBorderDark : AppColors.glassBorderLight,
        ),
      ),
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
        ),
        child: childContent,
      ),
    );
  }
}
