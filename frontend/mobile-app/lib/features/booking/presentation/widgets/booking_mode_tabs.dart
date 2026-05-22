import 'dart:ui';
import 'package:flutter/material.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';

class BookingModeTabs extends StatelessWidget {
  final bool isCustomMode;
  final ValueChanged<bool> onModeChanged;

  const BookingModeTabs({
    super.key,
    required this.isCustomMode,
    required this.onModeChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.sm, AppSpacing.lg, AppSpacing.sm),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.full),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            height: 46,
            decoration: BoxDecoration(
              color: isDark
                  ? AppColors.glassBgDark
                  : AppColors.glassBgLight,
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(
                color: isDark ? AppColors.glassBorderDark : AppColors.glassBorderLight,
              ),
            ),
            child: Row(
              children: [
                _modeTab(
                  context: context,
                  label: 'Chọn nhanh',
                  icon: Icons.grid_view_rounded,
                  active: !isCustomMode,
                  onTap: () => onModeChanged(false),
                ),
                _modeTab(
                  context: context,
                  label: 'Tự thiết lập giờ',
                  icon: Icons.tune_rounded,
                  active: isCustomMode,
                  onTap: () => onModeChanged(true),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _modeTab({
    required BuildContext context,
    required String label,
    required IconData icon,
    required bool active,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeInOut,
          margin: const EdgeInsets.all(5),
          decoration: BoxDecoration(
            gradient: active ? AppColors.primaryGradient : null,
            borderRadius: BorderRadius.circular(AppRadius.full),
            boxShadow: active
                ? [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.4),
                      blurRadius: 14,
                      offset: const Offset(0, 3),
                    )
                  ]
                : null,
          ),
          child: Center(
            child: RichText(
              text: TextSpan(
                children: [
                  WidgetSpan(
                    alignment: PlaceholderAlignment.middle,
                    child: Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Icon(
                        icon,
                        size: 14,
                        color: active ? Colors.white : AppColors.textMuted,
                      ),
                    ),
                  ),
                  TextSpan(
                    text: label,
                    style: AppTypography.caption.copyWith(
                      color: active ? Colors.white : AppColors.textMuted,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
