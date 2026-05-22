import 'package:flutter/material.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';

class BookingLegend extends StatelessWidget {
  const BookingLegend({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _legendItem(
              context,
              fill: AppColors.primary.withValues(alpha: 0.08),
              border: AppColors.primary.withValues(alpha: 0.35),
              label: 'Còn trống',
              textColor: AppColors.primary,
            ),
            const SizedBox(width: AppSpacing.sm),
            _legendItem(
              context,
              gradient: AppColors.cyanLimeGradient,
              border: AppColors.primary,
              label: 'Đang chọn',
              textColor: Colors.white,
              isGradient: true,
            ),
            const SizedBox(width: AppSpacing.sm),
            _legendItem(
              context,
              fill: AppColors.error.withValues(alpha: 0.06),
              border: AppColors.error.withValues(alpha: 0.3),
              label: 'Đã bận',
              textColor: AppColors.error,
              icon: Icons.lock_outline_rounded,
            ),
            const SizedBox(width: AppSpacing.sm),
            _legendItem(
              context,
              fill: isDark
                  ? Colors.white.withValues(alpha: 0.03)
                  : Colors.black.withValues(alpha: 0.03),
              border: isDark
                  ? AppColors.outlineDark.withValues(alpha: 0.2)
                  : AppColors.outlineLight.withValues(alpha: 0.2),
              label: 'Quá giờ',
              textColor: AppColors.textMuted,
              icon: Icons.history_rounded,
            ),
          ],
        ),
      ),
    );
  }

  Widget _legendItem(
    BuildContext context, {
    Color? fill,
    Color? border,
    Gradient? gradient,
    required String label,
    required Color textColor,
    IconData? icon,
    bool isGradient = false,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: isGradient ? null : fill,
        gradient: isGradient ? gradient : null,
        borderRadius: BorderRadius.circular(AppRadius.xs),
        border: Border.all(
          color: border ?? Colors.transparent,
          width: isGradient ? 1.2 : 1.0,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(
              icon,
              size: 10,
              color: textColor.withValues(alpha: 0.8),
            ),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: AppTypography.caption.copyWith(
              color: isGradient ? Colors.white : textColor,
              fontWeight: FontWeight.w800,
              fontSize: 10,
            ),
          ),
        ],
      ),
    );
  }
}

