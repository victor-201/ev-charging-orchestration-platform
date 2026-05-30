import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../../domain/entities/charging_session_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';

/// Charging Session Transaction Summary Screen
///
/// Displays final energy telemetry counts, duration metrics, and settlement costs
/// at the end of a successful vehicle charging session.
class SessionSummaryScreen extends StatefulWidget {
  final ChargingSessionEntity session;
  const SessionSummaryScreen({super.key, required this.session});

  @override
  State<SessionSummaryScreen> createState() => _SessionSummaryScreenState();
}

class _SessionSummaryScreenState extends State<SessionSummaryScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeIn;

  @override
  void initState() {
    super.initState();
    HapticFeedback.lightImpact();
    _controller = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 600));
    _fadeIn = CurvedAnimation(parent: _controller, curve: Curves.easeOut);
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.session;

    return LiquidGlassScaffold(
      child: FadeTransition(
        opacity: _fadeIn,
        child: SafeArea(
          bottom: false,
          child: SingleChildScrollView(
            padding: AppLayout.paddingWithNavbar(context),
            child: Column(children: [
              const SizedBox(height: AppSpacing.xxxl),

              Container(
                width: 88, height: 88,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: AppColors.primaryGradient,
                ),
                child: const Icon(Icons.check_rounded, color: Colors.white, size: 48),
              ),
              const SizedBox(height: AppSpacing.xl),

              Text('Sạc hoàn tất!', style: AppTypography.displayMd.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: AppSpacing.sm),
              Text('Cảm ơn bạn đã sử dụng dịch vụ',
                  style: AppTypography.bodyMd.copyWith(color: AppColors.grey600)),
              const SizedBox(height: AppSpacing.xxxl),

              Container(
                padding: const EdgeInsets.all(AppSpacing.xl),
                decoration: BoxDecoration(
                  color: Theme.of(context).cardColor,
                  borderRadius: BorderRadius.circular(AppRadius.lg),
                  border: Border.all(color: AppColors.outlineLight),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 16)],
                ),
                child: Column(children: [
                  _SummaryRow(label: 'Điện năng tiêu thụ',
                      value: '${s.energyKwh.toStringAsFixed(2)} kWh',
                      icon: Icons.bolt_outlined, color: AppColors.secondary),
                  const Divider(height: AppSpacing.xl),
                  _SummaryRow(label: 'Thời gian sạc',
                      value: ev_date.DateUtils.formatCountdown(s.elapsed),
                      icon: Icons.timer_outlined, color: AppColors.primary),
                  const Divider(height: AppSpacing.xl),
                  _SummaryRow(label: 'Bắt đầu',
                      value: ev_date.DateUtils.formatDateTime(s.startedAt),
                      icon: Icons.play_circle_outline, color: AppColors.grey600),
                  if (s.endedAt != null) ...[
                    const Divider(height: AppSpacing.xl),
                    _SummaryRow(label: 'Kết thúc',
                        value: ev_date.DateUtils.formatDateTime(s.endedAt!),
                        icon: Icons.stop_circle_outlined, color: AppColors.grey600),
                  ],
                  const Divider(height: AppSpacing.xl),
                  _SummaryRow(label: 'Tổng chi phí',
                      value: VndFormatter.format(s.amountDue),
                      icon: Icons.monetization_on_outlined, color: AppColors.chargerAvailable,
                      isLarge: true),
                ]),
              ),
              const SizedBox(height: AppSpacing.xxxl),

              EVButton(
                label: 'Về trang chủ',
                icon: Icons.map_outlined,
                onPressed: () => context.go('/map'),
              ),
              const SizedBox(height: AppSpacing.md),
              EVButton(
                label: 'Xem lịch sử sạc',
                variant: EVButtonVariant.secondary,
                icon: Icons.history_outlined,
                onPressed: () => context.go('/charging'),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final bool isLarge;
  const _SummaryRow({required this.label, required this.value, required this.icon, required this.color, this.isLarge = false});

  @override
  Widget build(BuildContext context) => Row(children: [
    Icon(icon, color: color, size: 20),
    const SizedBox(width: AppSpacing.sm),
    Text(label, style: AppTypography.bodyMd.copyWith(color: AppColors.grey600)),
    const Spacer(),
    Text(value, style: (isLarge ? AppTypography.headingMd : AppTypography.bodyMd)
        .copyWith(fontWeight: FontWeight.w700, color: isLarge ? AppColors.primary : null)),
  ]);
}
