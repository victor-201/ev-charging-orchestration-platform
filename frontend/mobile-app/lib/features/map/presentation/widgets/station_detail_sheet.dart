import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../../domain/entities/station_entity.dart';
import '../bloc/map_bloc.dart';
import 'pricing_dialog.dart';

/// Charging Station Detailed Overlay Bottom Sheet
///
/// Renders comprehensive live specifications for a selected station, detailing individual
/// charger power outputs, real-time statuses (Available, In Use, Reserved, Offline, Faulted),
/// interactive booking gateways, and dynamic routing navigation actions.
class StationDetailSheet extends StatelessWidget {
  final StationEntity station;
  final LatLng? userLocation;

  const StationDetailSheet({
    super.key,
    required this.station,
    this.userLocation,
  });

  @override
  Widget build(BuildContext context) {
    return BlocSelector<MapBloc, MapState, StationEntity>(
      selector: (state) {
        if (state is MapLoaded &&
            state.selectedStation != null &&
            state.selectedStation!.id == station.id) {
          return state.selectedStation!;
        }
        return station;
      },
      builder: (context, currentStation) {

        return DraggableScrollableSheet(
          initialChildSize: 0.5,
          minChildSize: 0.3,
          maxChildSize: 0.85,
          expand: false,
          builder: (context, scrollController) {
            final isDark = Theme.of(context).brightness == Brightness.dark;
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
                        // Header
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    currentStation.name,
                                    style: AppTypography.headingMd,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    currentStation.address,
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
                                        '/map/station/${currentStation.id}/route',
                                        extra: {
                                          'stationLat': currentStation.latitude,
                                          'stationLng': currentStation.longitude,
                                          'stationName': currentStation.name,
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
                                if (currentStation.distanceKm != null)
                                  Text(
                                    '${currentStation.distanceKm!.toStringAsFixed(1)} km',
                                    style: AppTypography.bodyMd.copyWith(
                                      color: AppColors.secondary,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.lg),

                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Số trụ sạc: ${currentStation.chargers.length}',
                              style: AppTypography.headingMd,
                            ),
                            // Show spinner while loading charger details (station hasn't been enriched yet)
                            if (currentStation.chargers.isEmpty && identical(currentStation, station))
                              const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        
                        // `identical` checks reference: if `currentStation` is still the
                        // original `station` prop (no enriched data yet), we are still loading.
                        if (currentStation.chargers.isEmpty && identical(currentStation, station))
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                            child: Center(
                              child: Text(
                                'Đang tải thông tin trụ sạc...',
                                style: AppTypography.bodyMd.copyWith(color: AppColors.grey600),
                              ),
                            ),
                          )
                        else if (currentStation.chargers.isEmpty)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
                            child: Center(
                              child: Text(
                                'Trạm chưa có trụ sạc nào',
                                style: AppTypography.bodyMd.copyWith(color: AppColors.grey600),
                              ),
                            ),
                          )
                        else
                          ListView.separated(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: currentStation.chargers.length,
                            separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
                            itemBuilder: (context, index) {
                              final charger = currentStation.chargers[index];
                              final color =
                                  AppColors.forChargerStatus(charger.status);
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
                                                        stationId: currentStation.id,
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
                                                      '/bookings/new?stationId=${currentStation.id}&chargerId=${charger.id}&connectorType=${charger.connectorType}&physicalChargerId=${charger.id}',
                                                      extra: {
                                                        'stationId': currentStation.id,
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
                            },
                          ),
                        const SizedBox(height: AppSpacing.xl),

                        // Nút chỉ đường đã được loại bỏ vì đã có ở header
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
  },
);
  }
}
