import 'package:flutter/material.dart';
import '../design_system/app_colors.dart';
import '../design_system/app_theme.dart';
import '../design_system/app_typography.dart';

/// Visual configuration variants: primary, secondary, danger, outlined
enum EVButtonVariant { primary, secondary, danger, outlined }

/// Reusable high-fidelity button component for all UI screens
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

  Color _resolvedBg() {
    if (backgroundColor != null) return backgroundColor!;
    switch (variant) {
      case EVButtonVariant.secondary:
        return AppColors.secondary;
      case EVButtonVariant.danger:
        return AppColors.error;
      case EVButtonVariant.outlined:
        return Colors.transparent;
      case EVButtonVariant.primary:
        return AppColors.primary;
    }
  }

  Color _resolvedFg() {
    if (foregroundColor != null) return foregroundColor!;
    switch (variant) {
      case EVButtonVariant.outlined:
        return AppColors.primary;
      case EVButtonVariant.danger:
        return AppColors.onError;
      default:
        return AppColors.onPrimary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isVariantOutlined =
        isOutlined || variant == EVButtonVariant.outlined;

    Widget child;
    if (isLoading) {
      child = SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          valueColor: AlwaysStoppedAnimation<Color>(
            isVariantOutlined ? AppColors.primary : AppColors.onPrimary,
          ),
        ),
      );
    } else if (icon != null) {
      child = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: AppSpacing.sm),
          Text(label),
        ],
      );
    } else {
      child = Text(label);
    }

    if (isVariantOutlined) {
      return SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          onPressed: isLoading ? null : onPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: _resolvedFg(),
            side: BorderSide(color: _resolvedFg(), width: 1.5),
          ),
          child: child,
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: _resolvedBg(),
          foregroundColor: _resolvedFg(),
        ),
        child: child,
      ),
    );
  }
}
