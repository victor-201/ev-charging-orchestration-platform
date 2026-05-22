import 'package:flutter/material.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/glass_container.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../domain/entities/booking_entity.dart';

class BookingTimeline extends StatelessWidget {
  final DateTime selectedDate;
  final List<AvailabilitySlotEntity> slots;
  final AvailabilitySlotEntity? rangeStart;

  const BookingTimeline({
    super.key,
    required this.selectedDate,
    required this.slots,
    required this.rangeStart,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final now = DateTime.now();

    final daySlots = slots
        .where((s) =>
            s.startTime.day == selectedDate.day &&
            s.startTime.month == selectedDate.month &&
            s.startTime.year == selectedDate.year)
        .toList();

    if (daySlots.isEmpty) return const SizedBox.shrink();

    final firstTime = daySlots.first.startTime;
    final totalMin =
        daySlots.last.endTime.difference(firstTime).inMinutes;
    if (totalMin <= 0) return const SizedBox.shrink();

    DateTime? selStart = rangeStart?.startTime;
    DateTime? selEnd = rangeStart?.endTime;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.schedule_rounded,
                size: 14, color: AppColors.textMuted),
            const SizedBox(width: 5),
            Text(
              'Lịch khung giờ hôm nay',
              style: AppTypography.caption.copyWith(
                color: AppColors.textMuted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        GlassContainer(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            children: [
              LayoutBuilder(builder: (ctx, c) {
                final w = c.maxWidth;
                return Stack(children: [
                  Container(
                    height: 30,
                    decoration: BoxDecoration(
                      color: isDark
                          ? Colors.white.withValues(alpha: 0.04)
                          : Colors.black.withValues(alpha: 0.04),
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                  ...daySlots.map((slot) {
                    final isPast = slot.endTime.isBefore(now);
                    final isBusy = !slot.isAvailable;
                    final left =
                        (slot.startTime.difference(firstTime).inMinutes /
                                totalMin) *
                            w;
                    final segW =
                        (slot.endTime.difference(slot.startTime).inMinutes /
                                totalMin) *
                            w;
                    final Color color = isPast
                        ? Colors.white.withValues(alpha: 0.06)
                        : isBusy
                            ? AppColors.error.withValues(alpha: 0.5)
                            : AppColors.primary.withValues(alpha: 0.22);
                    return Positioned(
                      left: left,
                      top: 0,
                      child: Container(
                        width: (segW - 1).clamp(0.0, w),
                        height: 30,
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    );
                  }),
                  if (selStart != null && selEnd != null)
                    Builder(builder: (ctx) {
                      final left =
                          ((selStart.difference(firstTime).inMinutes /
                                      totalMin) *
                                  w)
                              .clamp(0.0, w);
                      final segW =
                          ((selEnd.difference(selStart).inMinutes /
                                      totalMin) *
                                  w)
                              .clamp(0.0, w - left);
                      return Positioned(
                        left: left,
                        top: 0,
                        child: Container(
                          width: segW,
                          height: 30,
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.65),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(
                                color: AppColors.primary, width: 1.5),
                          ),
                        ),
                      );
                    }),
                ]);
              }),

              const SizedBox(height: 8),

              // Hour labels
              LayoutBuilder(builder: (ctx, c) {
                final w = c.maxWidth;
                final labels = daySlots.where(
                    (s) => s.startTime.minute == 0 && s.startTime.hour % 2 == 0);
                return SizedBox(
                  height: 14,
                  width: w,
                  child: Stack(children: [
                    ...labels.map((s) {
                      final left =
                          ((s.startTime.difference(firstTime).inMinutes /
                                      totalMin) *
                                  w)
                              .clamp(0.0, w - 24);
                      return Positioned(
                        left: left,
                        child: Text(
                          ev_date.DateUtils.formatTimeHm(s.startTime),
                          style: const TextStyle(
                            fontSize: 9,
                            color: AppColors.textMuted,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      );
                    }),
                  ]),
                );
              }),

              const SizedBox(height: AppSpacing.sm),

              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _tLegend(AppColors.primary.withValues(alpha: 0.3), 'Rảnh'),
                  const SizedBox(width: AppSpacing.md),
                  _tLegend(AppColors.error.withValues(alpha: 0.55), 'Đã bận'),
                  const SizedBox(width: AppSpacing.md),
                  _tLegend(AppColors.primary.withValues(alpha: 0.7), 'Đang chọn'),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _tLegend(Color color, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 12, height: 8,
          decoration: BoxDecoration(
            color: color, borderRadius: BorderRadius.circular(2)),
        ),
        const SizedBox(width: 4),
        Text(label,
            style: const TextStyle(
                fontSize: 10,
                color: AppColors.textMuted,
                fontWeight: FontWeight.w600)),
      ],
    );
  }
}
