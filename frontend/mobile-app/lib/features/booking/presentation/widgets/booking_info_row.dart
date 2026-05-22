import 'package:flutter/material.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';

class BookingInfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;

  const BookingInfoRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Icon(icon, size: 18, color: AppColors.grey600),
          const SizedBox(width: AppSpacing.sm),
          Text(label, style: AppTypography.bodyMd.copyWith(color: AppColors.grey600)),
          const Spacer(),
          Text(value, style: AppTypography.bodyMd.copyWith(fontWeight: FontWeight.w600, color: valueColor)),
        ],
      );
}
