import 'package:flutter/material.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';

class TimePickerCard extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color accentColor;
  final TimeOfDay? time;
  final VoidCallback onTap;
  final bool isStart;
  final bool isNextDay;

  const TimePickerCard({
    super.key,
    required this.label,
    required this.icon,
    required this.accentColor,
    required this.time,
    required this.onTap,
    this.isStart = true,
    this.isNextDay = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final hasTime = time != null;

    const startGradient = LinearGradient(
      colors: [Color(0xFF0ED2FA), Color(0xFF0EC97A)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );

    const endGradient = LinearGradient(
      colors: [Color(0xFF7AD3FF), Color(0xFF4B86FF)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );

    final activeGradient = isStart ? startGradient : endGradient;
    final activeGlowColor = isStart ? const Color(0xFF0EC97A) : const Color(0xFF4B86FF);

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
        decoration: BoxDecoration(
          color: hasTime ? null : (isDark ? AppColors.glassBgDark : AppColors.glassBgLight),
          gradient: hasTime ? activeGradient : null,
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(
            color: hasTime
                ? Colors.white.withValues(alpha: 0.25)
                : (isDark ? AppColors.glassBorderDark : AppColors.glassBorderLight),
            width: hasTime ? 1.5 : 1.0,
          ),
          boxShadow: hasTime
              ? [
                  BoxShadow(
                    color: activeGlowColor.withValues(alpha: 0.4),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  )
                ]
              : null,
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: hasTime
                    ? Colors.white.withValues(alpha: 0.2)
                    : accentColor.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                size: 22,
                color: hasTime ? Colors.white : accentColor,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: AppTypography.caption.copyWith(
                color: hasTime ? Colors.white.withValues(alpha: 0.9) : AppColors.textMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            hasTime
                ? Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Text(
                        time!.format(context),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.5,
                        ),
                      ),
                      if (isNextDay) ...[
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.25),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'Hôm sau',
                            style: TextStyle(
                              fontSize: 8,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ],
                  )
                : Text(
                    'Nhấn để chọn',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.textMuted,
                      fontStyle: FontStyle.italic,
                    ),
                  ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: hasTime
                    ? Colors.white.withValues(alpha: 0.15)
                    : accentColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(AppRadius.full),
                border: Border.all(
                  color: hasTime
                      ? Colors.white.withValues(alpha: 0.25)
                      : accentColor.withValues(alpha: 0.25),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.edit_rounded,
                    size: 10,
                    color: hasTime ? Colors.white : accentColor,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Chỉnh sửa',
                    style: TextStyle(
                      color: hasTime ? Colors.white : accentColor,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
