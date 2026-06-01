import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../domain/entities/booking_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../../../features/map/domain/entities/station_entity.dart';


class BookingCard extends StatelessWidget {
  final BookingEntity booking;
  final StationEntity? station;

  const BookingCard({
    super.key,
    required this.booking,
    this.station,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    Color statusColor;
    String statusLabel;
    switch (booking.status) {
      case 'CONFIRMED':       statusColor = AppColors.cyan;             statusLabel = 'Đã xác nhận'; break;
      case 'PENDING_PAYMENT': statusColor = AppColors.warning;          statusLabel = 'Chờ thanh toán'; break;
      case 'COMPLETED':       statusColor = AppColors.success;          statusLabel = 'Hoàn thành'; break;
      case 'CANCELLED':       statusColor = AppColors.grey400;          statusLabel = 'Đã hủy'; break;
      case 'EXPIRED':         statusColor = AppColors.grey400;          statusLabel = 'Hết hạn'; break;
      case 'NO_SHOW':         statusColor = AppColors.error;            statusLabel = 'Không đến'; break;
      default:                statusColor = AppColors.grey400;          statusLabel = booking.status;
    }

    final stationName = station?.name ?? 'Trạm sạc EV';

    return GestureDetector(
      onTap: () async {
        await context.push('/bookings/${booking.id}');
      },
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: isDark
              ? Colors.white.withValues(alpha: 0.06)
              : Colors.white.withValues(alpha: 0.65),
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(
            color: Colors.white.withValues(alpha: isDark ? 0.1 : 0.6),
          ),
          boxShadow: [
            BoxShadow(
              color: statusColor.withValues(alpha: 0.08),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            // Status indicator bar
            Container(
              width: 4,
              height: 64,
              decoration: BoxDecoration(
                color: statusColor,
                borderRadius: BorderRadius.circular(2),
                boxShadow: [
                  BoxShadow(
                    color: statusColor.withValues(alpha: 0.4),
                    blurRadius: 8,
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    stationName,
                    style: AppTypography.bodyMd.copyWith(
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white : AppColors.pillTextLight,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.cable_outlined, size: 14, color: AppColors.textMuted),
                      const SizedBox(width: 4),
                      Text(booking.connectorType,
                          style: AppTypography.caption.copyWith(
                            color: AppColors.textMuted,
                            fontWeight: FontWeight.w500,
                          )),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          border: Border.all(color: statusColor.withValues(alpha: 0.3)),
                        ),
                        child: Text(statusLabel,
                            style: AppTypography.caption.copyWith(
                              color: statusColor,
                              fontWeight: FontWeight.w700,
                            )),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${ev_date.DateUtils.formatDateTime(booking.startTime)} → ${ev_date.DateUtils.formatTimeHm(booking.endTime)}',
                    style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
          ],
        ),
      ),
    );
  }
}
