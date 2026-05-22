import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;

class BookingDateSelector extends StatelessWidget {
  final DateTime selected;
  final ValueChanged<DateTime> onChanged;

  const BookingDateSelector({
    super.key,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 80,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
        itemCount: 14,
        itemBuilder: (_, i) {
          final date = DateTime.now().add(Duration(days: i));
          final isSel = ev_date.DateUtils.isSameDay(date, selected);
          return GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              onChanged(date);
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: 52,
              margin: const EdgeInsets.only(right: AppSpacing.sm),
              decoration: BoxDecoration(
                gradient: isSel ? AppColors.cyanLimeGradient : null,
                color: isSel ? null : Colors.transparent,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(
                  color: isSel
                      ? AppColors.primary
                      : AppColors.outlineLight.withValues(alpha: 0.6),
                  width: isSel ? 1.5 : 1.0,
                ),
                boxShadow: isSel
                    ? [
                        BoxShadow(
                          color: AppColors.primary.withValues(alpha: 0.3),
                          blurRadius: 10,
                          offset: const Offset(0, 3),
                        )
                      ]
                    : null,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    _wd(date),
                    style: AppTypography.caption.copyWith(
                      color: isSel
                          ? Colors.white.withValues(alpha: 0.85)
                          : AppColors.textMuted,
                      fontWeight: FontWeight.w700,
                      fontSize: 10,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${date.day}',
                    style: AppTypography.headingMd.copyWith(
                      color: isSel ? Colors.white : null,
                      fontWeight: FontWeight.w900,
                      fontSize: 18,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  String _wd(DateTime d) {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[d.weekday % 7];
  }
}
