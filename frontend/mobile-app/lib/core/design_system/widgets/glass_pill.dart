import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// GlassPill — Frosted glass navigation/action pill
/// Used for side panels, action menus, and nav items.
/// Matches test.html .side-pill and .dark-pill patterns.
class GlassPill extends StatelessWidget {
  final String label;
  final bool isActive;
  final bool isDarkVariant;
  final Widget? trailing;
  final VoidCallback? onTap;

  const GlassPill({
    super.key,
    required this.label,
    this.isActive = false,
    this.isDarkVariant = false,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final Color bg = isDarkVariant
        ? (isDark ? AppColors.darkPillBgDark : AppColors.darkPillBgLight)
        : (isDark ? AppColors.pillBgDark : AppColors.pillBgLight);

    final Color border = isDarkVariant
        ? (isDark ? AppColors.darkPillBorderDark : AppColors.darkPillBorderLight)
        : (isDark ? AppColors.pillBorderDark : AppColors.pillBorderLight);

    final Color textColor = isDarkVariant
        ? (isDark ? AppColors.darkPillTextDark : AppColors.darkPillTextLight)
        : (isDark ? AppColors.pillTextDark : AppColors.pillTextLight);

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isActive ? AppColors.cyan : border,
            width: isActive ? 1.5 : 1.0,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.02),
              blurRadius: 15,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: AppTypography.bodyMd.copyWith(
                color: isActive ? AppColors.cyan : textColor,
                fontWeight: FontWeight.w600,
              ),
              overflow: TextOverflow.ellipsis,
            ),
            if (trailing != null) ...[
              const SizedBox(width: 8),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}
