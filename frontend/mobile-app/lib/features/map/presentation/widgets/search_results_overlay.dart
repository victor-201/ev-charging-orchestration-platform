import 'package:flutter/material.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../domain/entities/station_entity.dart';

/// Floating Geospatial Search Suggestion Overlay Widget
///
/// Renders dynamic auto-suggest results as the user types queries, providing quick-tap
/// coordinates center, live slot statuses, and custom geocoding search fallbacks.
class SearchResultsOverlay extends StatelessWidget {
  final List<StationEntity> results;
  final bool isLoading;
  final String searchText;
  final Function(StationEntity) onStationSelected;
  final VoidCallback onGeocodeFallback;
  final bool hasMore;
  final VoidCallback onLoadMore;

  const SearchResultsOverlay({
    super.key,
    required this.results,
    required this.isLoading,
    required this.searchText,
    required this.onStationSelected,
    required this.onGeocodeFallback,
    required this.hasMore,
    required this.onLoadMore,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(AppRadius.xl),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 25,
            offset: const Offset(0, 10),
          ),
        ],
        border: Border.all(
          color: Theme.of(context).brightness == Brightness.light
              ? AppColors.outlineLight.withValues(alpha: 0.8)
              : AppColors.outlineDark.withValues(alpha: 0.8),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 400),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (results.isEmpty && !isLoading)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
                    child: Column(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: AppColors.grey400.withValues(alpha: 0.05),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.search_off_rounded,
                              size: 40, color: AppColors.grey400.withValues(alpha: 0.4)),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          'Không tìm thấy kết quả phù hợp',
                          style: AppTypography.bodyMd.copyWith(
                            color: AppColors.grey600,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Hãy thử từ khóa khác hoặc tìm trên bản đồ',
                          style: AppTypography.caption.copyWith(color: AppColors.grey400),
                        ),
                      ],
                    ),
                  )
                else ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(AppSpacing.md, 12, AppSpacing.md, 8),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.03),
                    ),
                    child: Text(
                      'ĐỊA ĐIỂM GỢI Ý',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.5,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  ...results.map((station) {
                    final statusColor = _getStationStatusColor(station);
                    return InkWell(
                      onTap: () => onStationSelected(station),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.md,
                            vertical: 12),
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(
                              color: Theme.of(context).dividerColor.withValues(alpha: 0.05),
                            ),
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: AppColors.primary.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                  Icons.ev_station_rounded,
                                  color: AppColors.primary,
                                  size: 24),
                            ),
                            const SizedBox(width: AppSpacing.md),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    station.name,
                                    style: AppTypography.bodyMd.copyWith(
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.2),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      const Icon(Icons.location_on_rounded, size: 12, color: AppColors.grey400),
                                      const SizedBox(width: 4),
                                      Expanded(
                                        child: Text(
                                          station.address,
                                          style: AppTypography.caption.copyWith(
                                              color: AppColors.grey600,
                                              fontSize: 12),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: statusColor.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      width: 7,
                                      height: 7,
                                      decoration: BoxDecoration(
                                        color: statusColor,
                                        shape: BoxShape.circle,
                                        boxShadow: [
                                          BoxShadow(
                                            color: statusColor.withValues(alpha: 0.4),
                                            blurRadius: 4,
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      _getStationStatusText(station),
                                      style: AppTypography.caption.copyWith(
                                        color: statusColor,
                                        fontWeight: FontWeight.w800,
                                        fontSize: 10,
                                      ),
                                    ),
                                  ],
                                ),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),
                  if (hasMore)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8.0),
                      child: Center(
                        child: TextButton.icon(
                          onPressed: onLoadMore,
                          icon: const Icon(Icons.add_circle_outline, color: AppColors.primary, size: 16),
                          label: Text(
                            'Xem thêm gợi ý',
                            style: AppTypography.bodyMd.copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ),
                  InkWell(
                    onTap: onGeocodeFallback,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.md,
                          vertical: 14),
                      color: AppColors.secondary.withValues(alpha: 0.02),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AppColors.secondary.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                                Icons.near_me_rounded,
                                color: AppColors.secondary,
                                size: 24),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Tiếp tục tìm kiếm trên bản đồ',
                                  style: AppTypography.bodyMd.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.secondary,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Duyệt khu vực: "$searchText"',
                                  style: AppTypography.caption.copyWith(color: AppColors.grey600),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.arrow_forward_ios_rounded,
                              size: 16,
                              color: AppColors.secondary.withValues(alpha: 0.5)),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Color _getStationStatusColor(StationEntity station) {
    final chargers = station.chargers;
    if (chargers.isEmpty) return AppColors.chargerOffline;
    if (chargers.any((c) => c.status.toUpperCase() == 'AVAILABLE')) {
      return AppColors.chargerAvailable;
    }
    if (chargers.any((c) => c.status.toUpperCase() == 'IN_USE')) {
      return AppColors.chargerInUse;
    }
    if (chargers.any((c) => c.status.toUpperCase() == 'RESERVED')) {
      return AppColors.chargerReserved;
    }
    if (chargers.any((c) => c.status.toUpperCase() == 'FAULTED')) {
      return AppColors.chargerFaulted;
    }
    return AppColors.chargerOffline;
  }

  String _getStationStatusText(StationEntity station) {
    final chargers = station.chargers;
    if (chargers.isEmpty) return 'Ngoại tuyến';
    if (chargers.any((c) => c.status.toUpperCase() == 'AVAILABLE')) {
      return 'Sẵn sàng';
    }
    if (chargers.any((c) => c.status.toUpperCase() == 'IN_USE')) {
      return 'Đang sạc';
    }
    if (chargers.any((c) => c.status.toUpperCase() == 'RESERVED')) {
      return 'Đã đặt';
    }
    if (chargers.any((c) => c.status.toUpperCase() == 'FAULTED')) {
      return 'Đang lỗi';
    }
    return 'Ngoại tuyến';
  }
}
