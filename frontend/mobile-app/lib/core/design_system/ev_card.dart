import 'package:flutter/material.dart';
import '../design_system/app_colors.dart';
import '../design_system/app_theme.dart';
import '../design_system/app_typography.dart';

/// Animated surface container with ripple touch feedback
class EVCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final Color? backgroundColor;
  final double? elevation;
  final BorderRadius? borderRadius;

  const EVCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding,
    this.margin,
    this.backgroundColor,
    this.elevation,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final radius = borderRadius ?? BorderRadius.circular(AppRadius.md);

    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: Material(
        color: backgroundColor ?? theme.cardTheme.color,
        elevation: elevation ?? 2,
        shadowColor: Colors.black.withOpacity(0.08),
        borderRadius: radius,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Padding(
            padding: padding ??
                const EdgeInsets.all(AppSpacing.lg),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Status indicator badge mapping operational charger state colors
class ChargerStatusChip extends StatelessWidget {
  final String status;

  const ChargerStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final color = AppColors.forChargerStatus(status);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          Text(
            _label,
            style: AppTypography.overline.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  String get _label {
    switch (status.toUpperCase()) {
      case 'AVAILABLE':
        return 'TRỐNG';
      case 'IN_USE':
        return 'ĐANG SẠC';
      case 'RESERVED':
        return 'ĐÃ ĐẶT';
      case 'OFFLINE':
        return 'NGOẠI TUYẾN';
      case 'FAULTED':
        return 'LỖI';
      default:
        return status.toUpperCase();
    }
  }
}

/// Status indicator badge mapping reservation state colors
class BookingStatusBadge extends StatelessWidget {
  final String status;

  const BookingStatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final color = AppColors.forBookingStatus(status);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(
        _label,
        style: AppTypography.overline.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  String get _label {
    switch (status.toUpperCase()) {
      case 'PENDING_PAYMENT':
        return 'CHỜ THANH TOÁN';
      case 'CONFIRMED':
        return 'ĐÃ XÁC NHẬN';
      case 'COMPLETED':
        return 'HOÀN THÀNH';
      case 'CANCELLED':
        return 'ĐÃ HỦY';
      case 'EXPIRED':
        return 'HẾT HẠN';
      case 'NO_SHOW':
        return 'KHÔNG ĐẾN';
      default:
        return status.toUpperCase();
    }
  }
}
