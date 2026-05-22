import 'package:flutter/material.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_container.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../domain/entities/booking_entity.dart';
import '../../../../features/map/domain/entities/station_entity.dart';

class BookingStationCard extends StatelessWidget {
  final bool isLoading;
  final String? error;
  final StationEntity? station;
  final ChargerEntity? charger;
  final PricingEntity? pricing;
  final BookingEntity booking;
  final VoidCallback onRetry;
  final VoidCallback onOpenMaps;

  const BookingStationCard({
    super.key,
    required this.isLoading,
    required this.error,
    required this.station,
    required this.charger,
    required this.pricing,
    required this.booking,
    required this.onRetry,
    required this.onOpenMaps,
  });

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return GlassContainer(
        margin: const EdgeInsets.only(bottom: AppSpacing.lg),
        child: const SizedBox(
          height: 100,
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
                SizedBox(height: AppSpacing.sm),
                Text(
                  'Đang tải thông tin trạm sạc...',
                  style: TextStyle(fontSize: 13, color: AppColors.textMuted),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (error != null) {
      return GlassContainer(
        margin: const EdgeInsets.only(bottom: AppSpacing.lg),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Column(
            children: [
              const Icon(Icons.error_outline, color: AppColors.error, size: 28),
              const SizedBox(height: AppSpacing.xs),
              Text(
                error!,
                style: AppTypography.bodyMd.copyWith(color: AppColors.error),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.sm),
              TextButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Thử lại', style: TextStyle(fontSize: 13)),
              ),
            ],
          ),
        ),
      );
    }

    final hasStation = station != null;
    final stationName = hasStation ? station!.name : 'Trạm sạc EV';
    final stationAddress = hasStation ? station!.address : 'Đang tải địa chỉ...';
    final chargerName = charger?.name ?? 'Trụ sạc #${booking.chargerId.substring(0, booking.chargerId.length > 8 ? 8 : booking.chargerId.length)}';
    final powerKw = charger != null ? '${charger!.powerKw.toStringAsFixed(0)} kW' : 'Đang tải...';
    final priceStr = pricing?.pricePerKwh != null 
        ? '${VndFormatter.format(pricing!.pricePerKwh)}/kWh' 
        : (charger?.pricePerKwh != null 
            ? '${VndFormatter.format(charger!.pricePerKwh!)}/kWh' 
            : 'Liên hệ tại trạm');
    final resolvedConnectorType = charger?.connectorType ?? (booking.connectorType.isNotEmpty ? booking.connectorType : 'GB/T');

    String chargerStatusText = 'Đang tải...';
    Color chargerStatusColor = AppColors.grey400;
    if (charger != null) {
      chargerStatusColor = AppColors.forChargerStatus(charger!.status);
      switch (charger!.status.toUpperCase()) {
        case 'AVAILABLE': chargerStatusText = 'Sẵn sàng'; break;
        case 'IN_USE':    chargerStatusText = 'Đang sạc'; break;
        case 'RESERVED':  chargerStatusText = 'Đã đặt'; break;
        case 'OFFLINE':   chargerStatusText = 'Ngoại tuyến'; break;
        case 'FAULTED':   chargerStatusText = 'Đang lỗi'; break;
        default:          chargerStatusText = charger!.status;
      }
    }

    return GlassContainer(
      margin: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.cyan.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.ev_station,
                  color: AppColors.cyan,
                  size: 20,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  'THÔNG TIN TRẠM & TRỤ SẠC',
                  style: AppTypography.overline.copyWith(
                    color: AppColors.cyan,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.0,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              if (hasStation) ...[
                (() {
                  String stationStatusLabel;
                  Color stationStatusColor;
                  switch (station!.status.toLowerCase()) {
                    case 'active':
                      stationStatusLabel = 'Hoạt động';
                      stationStatusColor = AppColors.success;
                      break;
                    case 'maintenance':
                      stationStatusLabel = 'Bảo trì';
                      stationStatusColor = AppColors.amber;
                      break;
                    case 'inactive':
                      stationStatusLabel = 'Tạm dừng';
                      stationStatusColor = AppColors.error;
                      break;
                    default:
                      stationStatusLabel = station!.status.toUpperCase();
                      stationStatusColor = AppColors.grey400;
                  }
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: stationStatusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(color: stationStatusColor.withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      stationStatusLabel,
                      style: TextStyle(
                        color: stationStatusColor,
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  );
                })(),
              ],
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            stationName,
            style: AppTypography.headingMd.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.location_on_outlined,
                size: 16,
                color: AppColors.textMuted,
              ),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  stationAddress,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.textMuted,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const Divider(height: AppSpacing.xl, color: AppColors.outlineDark),
          Row(
            children: [
              Expanded(
                child: _buildMiniDetail(
                  icon: Icons.electrical_services_outlined,
                  label: 'Trụ sạc',
                  value: chargerName,
                ),
              ),
              Expanded(
                child: _buildMiniDetail(
                  icon: Icons.info_outline,
                  label: 'Trạng thái trụ',
                  value: chargerStatusText,
                  valueColor: chargerStatusColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: _buildMiniDetail(
                  icon: Icons.bolt_outlined,
                  label: 'Công suất',
                  value: powerKw,
                ),
              ),
              Expanded(
                child: _buildMiniDetail(
                  icon: Icons.cable_outlined,
                  label: 'Cổng sạc',
                  value: resolvedConnectorType,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: _buildMiniDetail(
                  icon: Icons.monetization_on_outlined,
                  label: 'Đơn giá sạc',
                  value: priceStr,
                ),
              ),
              if (pricing?.idleFeePerMinute != null && pricing!.idleFeePerMinute! > 0)
                Expanded(
                  child: _buildMiniDetail(
                    icon: Icons.timer_outlined,
                    label: 'Phí đỗ xe',
                    value: '${VndFormatter.format(pricing!.idleFeePerMinute!)}/phút',
                  ),
                )
              else
                const Spacer(),
            ],
          ),
          if (hasStation) ...[
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: EVButton(
                label: 'Chỉ đường tới trạm',
                icon: Icons.navigation_outlined,
                variant: EVButtonVariant.secondary,
                onPressed: onOpenMaps,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildMiniDetail({
    required IconData icon,
    required String label,
    required String value,
    Color? valueColor,
  }) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.textMuted),
        const SizedBox(width: 6),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: const TextStyle(fontSize: 10, color: AppColors.textMuted),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                value,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: valueColor,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
