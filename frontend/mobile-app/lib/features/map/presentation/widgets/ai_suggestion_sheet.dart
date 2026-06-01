import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import '../../domain/entities/station_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../bloc/map_bloc.dart';
import 'pricing_dialog.dart';

class AiSuggestionSheet extends StatelessWidget {
  final StationEntity station;
  final LatLng? userLocation;

  const AiSuggestionSheet({
    super.key,
    required this.station,
    this.userLocation,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final distanceStr = station.distanceKm != null
        ? '${station.distanceKm!.toStringAsFixed(1)} km'
        : '-- km';

    // Extract AI Suggestion Metadata
    final connector = station.suggestedConnectorType ?? 'CCS2';
    final powerKw = station.suggestedMaxPowerKw ?? 150.0;
    final estPrice = station.suggestedEstimatedPriceVnd ?? 150000.0;
    final scorePercent = (station.suggestedScore ?? 100.0).toStringAsFixed(0);

    // Resolve optimal suggested charger in the station using safe loop (bypasses runtime closure subtyping issues in Dart Web)
    dynamic suggestedCharger;
    if (station.chargers.isNotEmpty) {
      for (final c in station.chargers) {
        if (c.id == station.suggestedChargerId) {
          suggestedCharger = c;
          break;
        }
      }
      suggestedCharger ??= station.chargers.first;
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      minChildSize: 0.35,
      maxChildSize: 0.85,
      expand: false,
      builder: (context, scrollController) {
        final isDark = theme.brightness == Brightness.dark;
        return ClipRRect(
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(AppRadius.card),
          ),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              decoration: BoxDecoration(
                color: isDark ? AppColors.cardDark : AppColors.cardLight,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppRadius.card),
                ),
                border: Border(
                  top: BorderSide(
                    color: isDark ? AppColors.cardBorderDark : AppColors.cardBorderLight,
                    width: 1.5,
                  ),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.4 : 0.08),
                    blurRadius: 24,
                    offset: const Offset(0, -6),
                  ),
                ],
              ),
              child: Column(
                children: [
                  // Handle
                  Container(
                    margin: const EdgeInsets.only(top: 12, bottom: 8),
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white30 : Colors.black12,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
              Expanded(
                child: ListView(
                  controller: scrollController,
                  padding: AppLayout.paddingForBottomSheet(context),
                  children: [
                    const SizedBox(height: 16),
                    // AI Pulse Badge & Compatibility Score
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [AppColors.primaryCyan, AppColors.primaryLime],
                            ),
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.primaryCyan.withValues(alpha: 0.3),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.auto_awesome, color: Colors.white, size: 14),
                              const SizedBox(width: 4),
                              Text(
                                'GỢI Ý TỐI ƯU BẰNG AI',
                                style: AppTypography.caption.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 1.2,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.primaryLime.withValues(alpha: 0.15),
                            border: Border.all(color: AppColors.primaryLime.withValues(alpha: 0.5)),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'Phù hợp: $scorePercent%',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.primaryLime,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Station Title and Directions in Header (Exactly matching StationDetailSheet)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                station.name,
                                style: AppTypography.headingMd,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                station.address,
                                style: AppTypography.bodyMd.copyWith(
                                  color: AppColors.grey600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Material(
                              color: Colors.transparent,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(100),
                                onTap: () {
                                  double userLat = userLocation?.latitude ?? 0.0;
                                  double userLng = userLocation?.longitude ?? 0.0;
                                  if (userLat == 0.0) {
                                    final mapState = context.read<MapBloc>().state;
                                    if (mapState is MapLoaded) {
                                      userLat = mapState.userLat;
                                      userLng = mapState.userLng;
                                    }
                                  }
                                  if (userLat == 0.0 || userLng == 0.0) {
                                    EVToast.show(context, message: 'Không xác định được vị trí của bạn. Vui lòng bật GPS.', isError: true);
                                    return;
                                  }
                                  context.push(
                                    '/map/station/${station.id}/route',
                                    extra: {
                                      'stationLat': station.latitude,
                                      'stationLng': station.longitude,
                                      'stationName': station.name,
                                      'userLat': userLat,
                                      'userLng': userLng,
                                    },
                                  );
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  decoration: BoxDecoration(
                                    gradient: AppColors.primaryGradient,
                                    borderRadius: BorderRadius.circular(20),
                                    boxShadow: [
                                      BoxShadow(
                                        color: AppColors.primaryCyan.withValues(alpha: 0.3),
                                        blurRadius: 8,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.directions,
                                        color: Colors.white,
                                        size: 16,
                                      ),
                                      SizedBox(width: 4),
                                      Text(
                                        'Đường đi',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 12,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 6),
                            if (station.distanceKm != null)
                              Text(
                                distanceStr,
                                style: AppTypography.bodyMd.copyWith(
                                  color: AppColors.secondary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // AI Optimization Reason Card
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppColors.primaryCyan.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: AppColors.primaryCyan.withValues(alpha: 0.15),
                          width: 1,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.auto_awesome,
                                  color: AppColors.primaryCyan, size: 20),
                              const SizedBox(width: 8),
                              Text(
                                'Lý do đề xuất cá nhân hóa:',
                                style: AppTypography.caption.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.primaryCyan,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          _buildReasonRow(
                            context,
                            icon: Icons.electrical_services_outlined,
                            title: 'Độ tương thích vật lý',
                            text: 'Khớp hoàn toàn với cổng sạc $connector trên xe của bạn. Hỗ trợ công suất cực đại lên tới ${powerKw.toStringAsFixed(0)} kW.',
                          ),
                          const SizedBox(height: 12),
                          _buildReasonRow(
                            context,
                            icon: Icons.savings_outlined,
                            title: 'Tối ưu hóa chi phí (TOU)',
                            text: 'Tổng chi phí sạc ước tính khoảng ${VndFormatter.format(estPrice)} nhờ biểu phí sạc thông minh thấp nhất tại khung giờ này.',
                          ),
                          const SizedBox(height: 12),
                          _buildReasonRow(
                            context,
                            icon: Icons.schedule_outlined,
                            title: 'Lịch sạc trống khả dụng',
                            text: 'Phân tích lịch sạc xác nhận trụ khả dụng ngay lập tức trong khung giờ mong muốn, giúp tránh tắc nghẽn trạm.',
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Recommended Charger Title
                    Text(
                      'Trụ sạc AI đề xuất:',
                      style: AppTypography.headingMd,
                    ),
                    const SizedBox(height: 12),

                    // Standardized Charger Card matching StationDetailSheet exactly!
                    if (suggestedCharger != null) ...[
                      _buildSuggestedChargerCard(context, suggestedCharger)
                    ] else ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                        child: Center(
                          child: Text(
                            'Không tìm thấy thông tin trụ sạc phù hợp.',
                            style: AppTypography.bodyMd.copyWith(color: AppColors.grey600),
                          ),
                        ),
                      )
                    ],
                    const SizedBox(height: AppSpacing.xl),
                  ],
                ),
              ),
            ],
            ),
          ),
        ),
      );
    },
  );
}

  Widget _buildSuggestedChargerCard(BuildContext context, dynamic charger) {
    final color = AppColors.forChargerStatus(charger.status);
    final isBookable = charger.status.toUpperCase() == 'AVAILABLE';

    String statusText;
    switch (charger.status.toUpperCase()) {
      case 'AVAILABLE': statusText = 'Sẵn sàng'; break;
      case 'IN_USE':    statusText = 'Đang sạc'; break;
      case 'RESERVED':  statusText = 'Đã đặt'; break;
      case 'OFFLINE':   statusText = 'Ngoại tuyến'; break;
      case 'FAULTED':   statusText = 'Đang lỗi'; break;
      default:          statusText = charger.status;
    }

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.08),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(
          color: color.withValues(alpha: 0.2),
          width: 1.2,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: Stack(
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      color.withValues(alpha: 0.05),
                      color.withValues(alpha: 0.0),
                    ],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Row(
                children: [
                  // Left: Power & Connector Type Icon Area
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(AppRadius.md),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.bolt_rounded, color: color, size: 24),
                        Text(
                          '${charger.powerKw.toStringAsFixed(0)} kW',
                          style: AppTypography.labelMd.copyWith(
                            fontWeight: FontWeight.w800,
                            color: color,
                            height: 1.1,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),

                  // Middle: Name, Type, and Status
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          charger.name,
                          style: AppTypography.bodyLg.copyWith(
                            fontWeight: FontWeight.w800,
                            color: Theme.of(context).colorScheme.onSurface,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          charger.connectorType,
                          style: AppTypography.caption.copyWith(
                            color: AppColors.grey600,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: color,
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: color.withValues(alpha: 0.4),
                                    blurRadius: 4,
                                  )
                                ],
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              statusText,
                              style: AppTypography.caption.copyWith(
                                color: color,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  // Right: Action Buttons
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      InkWell(
                        onTap: () {
                          showDialog(
                            context: context,
                            builder: (_) => PricingDialog(
                              stationId: station.id,
                              charger: charger,
                            ),
                          );
                        },
                        child: const Padding(
                          padding: EdgeInsets.only(bottom: 8.0, left: 8.0),
                          child: Icon(
                            Icons.info_outline_rounded,
                            color: AppColors.grey600,
                            size: 22,
                          ),
                        ),
                      ),
                      InkWell(
                        onTap: () {
                          if (!isBookable) {
                            String msg = 'Trụ sạc này hiện không thể đặt lịch.';
                            final status = charger.status.toUpperCase();
                            if (status == 'FAULTED' || status == 'OFFLINE') {
                              msg = 'Trụ sạc này hiện đang ngoại tuyến hoặc đang lỗi, không thể đặt lịch.';
                            } else if (status == 'IN_USE') {
                              msg = 'Trụ sạc này hiện đang được sử dụng, vui lòng chọn trụ khác hoặc tham gia hàng chờ.';
                            } else if (status == 'RESERVED') {
                              msg = 'Trụ sạc này hiện đã được đặt trước cho lịch sạc sắp tới.';
                            }
                            EVToast.show(context, message: msg, isError: true);
                            return;
                          }
                          Navigator.pop(context);
                          context.push(
                            '/bookings/new?stationId=${station.id}&chargerId=${charger.id}&connectorType=${charger.connectorType}&physicalChargerId=${charger.id}',
                            extra: {
                              'stationId': station.id,
                              'chargerId': charger.id,
                              'connectorType': charger.connectorType,
                              'physicalChargerId': charger.id,
                            },
                          );
                        },
                        borderRadius: BorderRadius.circular(AppRadius.md),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          decoration: BoxDecoration(
                            gradient: isBookable ? AppColors.primaryGradient : null,
                            color: isBookable ? null : AppColors.outlineLight,
                            borderRadius: BorderRadius.circular(AppRadius.md),
                            boxShadow: isBookable ? [
                              BoxShadow(
                                color: AppColors.primaryCyan.withValues(alpha: 0.3),
                                blurRadius: 6,
                                offset: const Offset(0, 3),
                              )
                            ] : null,
                          ),
                          child: Text(
                            'ĐẶT',
                            style: AppTypography.labelMd.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReasonRow(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String text,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: AppColors.primaryCyan.withValues(alpha: 0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: AppColors.primaryCyan, size: 16),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.caption.copyWith(
                  fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                text,
                style: AppTypography.caption.copyWith(
                  color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7),
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
