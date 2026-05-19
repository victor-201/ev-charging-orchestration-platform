import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_theme.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
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
    return BlocBuilder<MapBloc, MapState>(
      builder: (context, state) {
        // Use the fresh state-loaded station data when ID matches.
        StationEntity currentStation = station;
        if (state is MapLoaded && state.selectedStation != null && state.selectedStation!.id == station.id) {
          currentStation = state.selectedStation!;
        }

        return DraggableScrollableSheet(
          initialChildSize: 0.5,
          minChildSize: 0.3,
          maxChildSize: 0.85,
          expand: false,
          builder: (context, scrollController) {
            return Container(
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppRadius.xl),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.15),
                    blurRadius: 20,
                    offset: const Offset(0, -4),
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
                      color: AppColors.outlineLight,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),

                  Expanded(
                    child: ListView(
                      controller: scrollController,
                      padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.lg),
                      children: [
                        // Header
                        Row(
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
                        const SizedBox(height: AppSpacing.lg),

                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Số trụ sạc: ${currentStation.chargers.length}',
                              style: AppTypography.headingMd,
                            ),
                            if (currentStation.chargers.isEmpty && (state is! MapLoaded || state.selectedStation?.id != station.id))
                              const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        
                        if (currentStation.chargers.isEmpty && (state is! MapLoaded || state.selectedStation?.id != station.id))
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
                              final isAvailable = charger.status.toUpperCase() == 'AVAILABLE';
                              
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
                                                  child: Padding(
                                                    padding: const EdgeInsets.only(bottom: 8.0, left: 8.0),
                                                    child: Icon(
                                                      Icons.info_outline_rounded,
                                                      color: AppColors.grey600,
                                                      size: 22,
                                                    ),
                                                  ),
                                                ),
                                                InkWell(
                                                  onTap: () {
                                                    if (!isAvailable) {
                                                      ScaffoldMessenger.of(context).showSnackBar(
                                                        const SnackBar(content: Text('Trụ sạc này hiện không khả dụng để đặt lịch.')),
                                                      );
                                                      return;
                                                    }
                                                    Navigator.pop(context);
                                                    context.push('/bookings/new', extra: {
                                                      'stationId': currentStation.id,
                                                      'chargerId': charger.id,
                                                      'connectorType': charger.connectorType,
                                                    });
                                                  },
                                                  borderRadius: BorderRadius.circular(AppRadius.md),
                                                  child: Container(
                                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                                    decoration: BoxDecoration(
                                                      gradient: isAvailable ? const LinearGradient(
                                                        colors: [AppColors.primary, Color(0xFF00B248)],
                                                      ) : null,
                                                      color: isAvailable ? null : AppColors.grey400,
                                                      borderRadius: BorderRadius.circular(AppRadius.md),
                                                      boxShadow: isAvailable ? [
                                                        BoxShadow(
                                                          color: AppColors.primary.withValues(alpha: 0.3),
                                                          blurRadius: 6,
                                                          offset: const Offset(0, 3),
                                                        )
                                                      ] : null,
                                                    ),
                                                    child: Text(
                                                      'ĐẶT',
                                                      style: AppTypography.labelMd.copyWith(
                                                        color: isAvailable ? Colors.white : AppColors.white,
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

                        EVButton(
                          label: 'Chỉ đường đến trạm',
                          icon: Icons.directions_outlined,
                          onPressed: () {
                            Navigator.pop(context);
                            
                            // Leverage real GPS coordinates parsed from parent layout context.
                            double userLat = userLocation?.latitude ?? 0.0;
                            double userLng = userLocation?.longitude ?? 0.0;

                            if (userLat == 0.0) {
                              if (state is MapLoaded) {
                                userLat = state.userLat;
                                userLng = state.userLng;
                              }
                            }

                            if (userLat == 0.0 || userLng == 0.0) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Không xác định được vị trí của bạn. Vui lòng bật GPS.')),
                              );
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
                        ),
                        const SizedBox(height: AppSpacing.xl),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
