import 'dart:ui';
import 'package:flutter/material.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_container.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../../../core/utils/vnd_formatter.dart';
import '../../domain/entities/booking_entity.dart';
import '../../../map/domain/entities/station_entity.dart';

class BookingSummaryPanel extends StatelessWidget {
  final AvailabilitySlotEntity? rangeStart;
  final AvailabilitySlotEntity? rangeEnd;
  final PricingEntity? pricing;
  final bool isPricingLoading;
  final String? pricingError;
  final bool isLoading;
  final bool canConfirm;
  final VoidCallback onConfirm;

  const BookingSummaryPanel({
    super.key,
    required this.rangeStart,
    required this.rangeEnd,
    required this.pricing,
    required this.isPricingLoading,
    required this.pricingError,
    required this.isLoading,
    required this.canConfirm,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final start = rangeStart?.startTime;
    final end = rangeEnd?.endTime ?? rangeStart?.endTime;
    final duration =
        (start != null && end != null) ? end.difference(start) : null;
    final durationHrs = duration != null ? duration.inMinutes / 60.0 : null;
    final isNextDay = (start != null && end != null) &&
        (end.day != start.day || end.month != start.month || end.year != start.year);

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.card)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          decoration: BoxDecoration(
            color: isDark
                ? AppColors.cardDark
                : AppColors.cardLight,
            borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppRadius.card)),
            border: Border(
              top: BorderSide(
                color: isDark
                    ? AppColors.cardBorderDark
                    : AppColors.cardBorderLight,
                width: 1.5,
              ),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.4 : 0.12),
                blurRadius: 24,
                offset: const Offset(0, -6),
              ),
            ],
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.lg + MediaQuery.of(context).padding.bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Handle
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: AppSpacing.md),
                    decoration: BoxDecoration(
                      color: AppColors.outlineLight.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),

                // Header row
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Tóm tắt đặt lịch',
                              style: AppTypography.headingMd
                                  .copyWith(fontWeight: FontWeight.w800)),
                          if (durationHrs != null)
                            Text(
                              '${durationHrs.toStringAsFixed(1)} giờ sạc',
                              style: AppTypography.caption.copyWith(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (durationHrs != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          gradient: AppColors.cyanLimeGradient,
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primary.withValues(alpha: 0.3),
                              blurRadius: 10,
                            )
                          ],
                        ),
                        child: Text(
                          '${durationHrs.toStringAsFixed(1)}h',
                          style: AppTypography.caption.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                  ],
                ),

                const SizedBox(height: AppSpacing.md),

                // Time row
                if (start != null && end != null)
                  GlassContainer(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md, vertical: AppSpacing.sm),
                    child: Row(
                      children: [
                        Expanded(
                          child: _timeChip(
                            Icons.play_circle_outline_rounded,
                            'Bắt đầu',
                            ev_date.DateUtils.formatDateTime(start),
                            AppColors.primary,
                          ),
                        ),
                        Container(
                          width: 1,
                          height: 32,
                          margin: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.sm),
                          color: AppColors.outlineLight.withValues(alpha: 0.4),
                        ),
                        Expanded(
                          child: _timeChip(
                            Icons.stop_circle_outlined,
                            'Kết thúc',
                            ev_date.DateUtils.formatDateTime(end),
                            AppColors.secondary,
                            suffix: isNextDay
                                ? Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 4, vertical: 1),
                                    decoration: BoxDecoration(
                                      color: AppColors.secondary.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(3),
                                      border: Border.all(
                                          color: AppColors.secondary.withValues(alpha: 0.3),
                                          width: 0.5),
                                    ),
                                    child: const Text(
                                      'Hôm sau',
                                      style: TextStyle(
                                        fontSize: 8,
                                        fontWeight: FontWeight.w800,
                                        color: AppColors.secondary,
                                      ),
                                    ),
                                  )
                                : null,
                          ),
                        ),
                      ],
                    ),
                  ),

                const SizedBox(height: AppSpacing.md),

                // Pricing area
                if (isPricingLoading)
                  const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          SizedBox(
                            width: 16, height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: AppColors.primary),
                          ),
                          SizedBox(width: AppSpacing.sm),
                          Text('Đang tính giá...',
                              style: TextStyle(
                                  color: AppColors.textMuted,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  )
                else if (pricingError != null && rangeStart == null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppSpacing.sm),
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                      border:
                          Border.all(color: AppColors.error.withValues(alpha: 0.2)),
                    ),
                    child: Text(pricingError!,
                        style: AppTypography.caption.copyWith(
                            color: AppColors.error,
                            fontWeight: FontWeight.w600)),
                  )
                else if (pricing != null) ...[
                  _priceRow('Đơn giá sạc:',
                      '${VndFormatter.format(pricing!.pricePerKwh)}/kWh'),
                  if (pricing!.idleFeePerMinute != null &&
                      pricing!.idleFeePerMinute! > 0) ...[
                    const SizedBox(height: 5),
                    _priceRow(
                      'Phí đỗ xe khi đầy:',
                      '${VndFormatter.format(pricing!.idleFeePerMinute!)}/phút',
                      valueColor: AppColors.secondary,
                    ),
                  ],
                  const SizedBox(height: 5),
                  _priceRow(
                    'Tạm tính tối đa:',
                    pricing!.totalEstimateVnd != null
                        ? VndFormatter.format(pricing!.totalEstimateVnd!)
                        : '---',
                  ),
                  const Divider(height: AppSpacing.md, thickness: 0.6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Flexible(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Đặt cọc đề xuất:',
                              style: AppTypography.bodyMd.copyWith(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              'Hoàn lại sau khi sạc xong',
                              style: AppTypography.caption
                                  .copyWith(color: AppColors.textMuted),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Text(
                        pricing!.totalEstimateVnd != null
                            ? VndFormatter.format(
                                pricing!.totalEstimateVnd! * 1.2)
                            : VndFormatter.format(50000),
                        style: AppTypography.headingMd.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ] else if (!isPricingLoading)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                    child: Text(
                      'Chọn đủ khung giờ để xem ước tính chi phí.',
                      style: AppTypography.caption
                          .copyWith(color: AppColors.textMuted,
                              fontStyle: FontStyle.italic),
                    ),
                  ),

                const SizedBox(height: AppSpacing.lg),

                EVButton(
                  label: isLoading
                      ? 'Đang đặt lịch...'
                      : 'Xác nhận & Đặt lịch',
                  icon: Icons.check_circle_outline_rounded,
                  onPressed: (isLoading || !canConfirm) ? null : onConfirm,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _timeChip(
      IconData icon, String label, String value, Color accent, {Widget? suffix}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 12, color: accent),
            const SizedBox(width: 4),
            Text(label,
                style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w600)),
            if (suffix != null) ...[
              const SizedBox(width: 6),
              suffix,
            ],
          ],
        ),
        const SizedBox(height: 2),
        Text(value,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: accent)),
      ],
    );
  }

  Widget _priceRow(String label, String value, {Color? valueColor}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label,
            style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
        Text(value,
            style: AppTypography.bodyMd.copyWith(
                fontWeight: FontWeight.w700, color: valueColor)),
      ],
    );
  }
}
