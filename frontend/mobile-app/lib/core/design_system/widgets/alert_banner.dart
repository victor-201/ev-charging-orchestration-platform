import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../theme/app_colors.dart';
import '../theme/app_layout.dart';
import '../theme/app_typography.dart';

/// Reusable shimmer loader for all async content loading
class ShimmerLoader extends StatelessWidget {
  final double width;
  final double height;
  final double borderRadius;

  const ShimmerLoader({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = AppRadius.sm,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Shimmer.fromColors(
      baseColor: isDark ? const Color(0xFF2C2C2C) : const Color(0xFFE0E0E0),
      highlightColor:
          isDark ? const Color(0xFF3C3C3C) : const Color(0xFFF5F5F5),
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: AppColors.outlineLight,
          borderRadius: BorderRadius.circular(borderRadius),
        ),
      ),
    );
  }
}

/// Shimmer layout placeholder for reservation cards
class BookingCardShimmer extends StatelessWidget {
  const BookingCardShimmer({super.key});

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ShimmerLoader(width: double.infinity, height: 24),
          SizedBox(height: AppSpacing.sm),
          ShimmerLoader(width: 200, height: 16),
          SizedBox(height: AppSpacing.sm),
          ShimmerLoader(width: 120, height: 28, borderRadius: AppRadius.full),
        ],
      ),
    );
  }
}

/// Shimmer layout placeholder for geocoded lists
class StationListShimmer extends StatelessWidget {
  final int count;
  const StationListShimmer({super.key, this.count = 3});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(AppSpacing.lg),
      itemCount: count,
      itemBuilder: (_, __) => const Padding(
        padding: EdgeInsets.only(bottom: AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ShimmerLoader(width: double.infinity, height: 20),
            SizedBox(height: AppSpacing.xs),
            ShimmerLoader(width: 180, height: 14),
          ],
        ),
      ),
    );
  }
}

/// Self-dismissing interactive status banner (4s duration)
class NotificationBanner extends StatelessWidget {
  final String title;
  final String body;
  final VoidCallback? onTap;

  const NotificationBanner({
    super.key,
    required this.title,
    required this.body,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return GestureDetector(
      onTap: onTap,
      child: Material(
        color: Colors.transparent,
        child: Container(
          margin: const EdgeInsets.symmetric(
            horizontal: AppLayout.sidePadding,
            vertical: AppSpacing.sm,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.md),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: isDark ? 0.16 : 0.08),
                  borderRadius: BorderRadius.circular(AppRadius.md),
                  border: Border.all(
                    color: AppColors.primary.withValues(alpha: isDark ? 0.35 : 0.25),
                    width: 1.0,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: isDark ? 0.15 : 0.05),
                      blurRadius: 16,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.notifications_outlined,
                      color: AppColors.primary,
                      size: 24,
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            title,
                            style: AppTypography.bodyMd.copyWith(
                              color: isDark ? AppColors.white : AppColors.textDark,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            body,
                            style: AppTypography.caption.copyWith(
                              color: isDark ? AppColors.textMuted : AppColors.textFaded,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Persistent high-visibility arrears warning banner
class ArrearsAlertBanner extends StatelessWidget {
  final String amount;
  final VoidCallback? onTap;

  const ArrearsAlertBanner({
    super.key,
    required this.amount,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Smart text formatting to avoid repeating 'Nợ tồn đọng' if passed from parent
    final displayText = amount.startsWith('Nợ tồn đọng')
        ? '$amount. Nhấn để thanh toán.'
        : 'Nợ tồn đọng: $amount. Nhấn để thanh toán.';

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(
          horizontal: AppLayout.sidePadding,
          vertical: AppSpacing.sm,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.md),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.md,
              ),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: isDark ? 0.16 : 0.08),
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(
                  color: AppColors.error.withValues(alpha: isDark ? 0.35 : 0.25),
                  width: 1.0,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.error.withValues(alpha: isDark ? 0.15 : 0.05),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.warning_amber_rounded,
                    color: AppColors.error,
                    size: 20,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      displayText,
                      style: AppTypography.bodyMd.copyWith(
                        color: isDark ? AppColors.white : AppColors.textDark,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Icon(
                    Icons.chevron_right,
                    color: AppColors.error,
                    size: 20,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Dynamic idle tariff charge warning countdown banner
class IdleFeeCountdownBanner extends StatelessWidget {
  final Duration remaining;
  final int projectedFeVnd;

  const IdleFeeCountdownBanner({
    super.key,
    required this.remaining,
    required this.projectedFeVnd,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final minutes = remaining.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = remaining.inSeconds.remainder(60).toString().padLeft(2, '0');

    return Container(
      margin: const EdgeInsets.symmetric(
        horizontal: AppLayout.sidePadding,
        vertical: AppSpacing.sm,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.md,
            ),
            decoration: BoxDecoration(
              color: AppColors.warning.withValues(alpha: isDark ? 0.16 : 0.08),
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: Border.all(
                color: AppColors.warning.withValues(alpha: isDark ? 0.35 : 0.25),
                width: 1.0,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.warning.withValues(alpha: isDark ? 0.15 : 0.05),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.timer_outlined,
                  color: AppColors.warning,
                  size: 20,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '$minutes:$seconds ân hạn còn lại',
                        style: AppTypography.bodyMd.copyWith(
                          color: isDark ? AppColors.white : AppColors.textDark,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        projectedFeVnd > 0
                            ? 'Rút súng sạc. Phí dự kiến: ${_formatVnd(projectedFeVnd)}'
                            : 'Rút súng sạc để tránh phí 2.000₫/phút',
                        style: AppTypography.caption.copyWith(
                          color: isDark ? AppColors.textMuted : AppColors.textFaded,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatVnd(int amount) {
    final formatted = amount.toString().replaceAllMapped(
          RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]}.',
        );
    return '$formatted₫';
  }
}
