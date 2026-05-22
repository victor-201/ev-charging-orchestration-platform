import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../domain/entities/station_entity.dart';
import '../../domain/usecases/get_charger_pricing_usecase.dart';

/// Dynamic Estimation Pricing Dialog Component
///
/// Queries and displays real-time pricing metrics for a targeted charger connector type,
/// including energy cost per kWh, idle occupancy fees, and projected total costs.
class PricingDialog extends StatefulWidget {
  final String stationId;
  final ChargerEntity charger;

  const PricingDialog({super.key, required this.stationId, required this.charger});

  @override
  State<PricingDialog> createState() => _PricingDialogState();
}

class _PricingDialogState extends State<PricingDialog> {
  bool _isLoading = true;
  PricingEntity? _pricing;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchPricing();
  }

  Future<void> _fetchPricing() async {
    final usecase = GetIt.I<GetChargerPricingUseCase>();
    
    // Assume a standard 1-hour charging duration session context.
    final now = DateTime.now();
    final endTime = now.add(const Duration(hours: 1));

    final result = await usecase(
      stationId: widget.stationId,
      chargerId: widget.charger.id,
      connectorType: widget.charger.connectorType,
      startTime: now,
      endTime: endTime,
    );

    if (mounted) {
      setState(() {
        _isLoading = false;
        result.fold(
          (failure) => _error = failure.message,
          (pricing) => _pricing = pricing,
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.lg)),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Icon(Icons.request_quote_outlined, color: AppColors.primary),
                const SizedBox(width: AppSpacing.sm),
                Text('Báo giá dự kiến (1 giờ)', style: AppTypography.headingMd),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            if (_isLoading)
              const Padding(
                padding: EdgeInsets.all(AppSpacing.xl),
                child: CircularProgressIndicator(),
              )
            else if (_error != null)
              Text(
                'Lỗi: $_error',
                style: AppTypography.bodyMd.copyWith(color: AppColors.error),
                textAlign: TextAlign.center,
              )
            else if (_pricing != null) ...[
              _buildRow('Giá mỗi kWh:', '${VndFormatter.format(_pricing!.pricePerKwh)}/kWh'),
              if (_pricing!.idleFeePerMinute != null && _pricing!.idleFeePerMinute! > 0)
                _buildRow('Phí đỗ xe (nếu đầy):', '${VndFormatter.format(_pricing!.idleFeePerMinute!)}/phút'),
              const Divider(height: AppSpacing.xl),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Ước tính (1h):', style: AppTypography.bodyLg.copyWith(fontWeight: FontWeight.w600)),
                  Text(
                    _pricing!.totalEstimateVnd != null ? VndFormatter.format(_pricing!.totalEstimateVnd!) : '---',
                    style: AppTypography.headingMd.copyWith(color: AppColors.primary),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Lưu ý: Đây chỉ là mức giá ước tính. Phí sạc thực tế phụ thuộc vào công suất sạc của xe.',
                style: AppTypography.caption.copyWith(color: AppColors.grey600, fontStyle: FontStyle.italic),
                textAlign: TextAlign.center,
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            SizedBox(
              width: double.infinity,
              child: EVButton(
                label: 'Đóng',
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AppTypography.bodyMd.copyWith(color: AppColors.grey600)),
          Text(value, style: AppTypography.bodyMd.copyWith(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
