import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/charging_session_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/live_meter_widget.dart';
import '../../../../core/design_system/widgets/alert_banner.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;

/// Active Charging Session Real-Time Telemetry Screen
///
/// Monitors live energy flow, battery state-of-charge (SOC) percentages, voltage levels,
/// and handles session termination triggers with a secure 1.5-second long press gesture.
class ActiveSessionScreen extends StatefulWidget {
  final String sessionId;
  // chargerId required by POST /charging/start — must be passed from navigation
  final String? chargerId;
  final String? bookingId;
  final String? qrToken;
  const ActiveSessionScreen({
    super.key,
    required this.sessionId,
    this.chargerId,
    this.bookingId,
    this.qrToken,
  });

  @override
  State<ActiveSessionScreen> createState() => _ActiveSessionScreenState();
}

class _ActiveSessionScreenState extends State<ActiveSessionScreen> {
  bool _stopping = false;

  @override
  void initState() {
    super.initState();
    // When sessionId == 'new', trigger a new charging session start
    // chargerId is required by POST /charging/start
    if (widget.sessionId == 'new' && widget.chargerId != null) {
      context.read<ChargingSessionBloc>().add(ChargingStartRequested(
            chargerId: widget.chargerId!,
            bookingId: widget.bookingId,
            qrToken: widget.qrToken,
          ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Phiên sạc'),
        automaticallyImplyLeading: false,
      ),
      body: BlocConsumer<ChargingSessionBloc, ChargingState>(
        listener: (context, state) {
          if (state is ChargingCompleted) {
            HapticFeedback.mediumImpact();
            context.go(
              '/charging/session/${state.session.id}/summary',
              extra: state.session,
            );
          }
          if (state is ChargingError) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text(state.message),
                backgroundColor: AppColors.error));
            setState(() => _stopping = false);
          }
        },
        builder: (context, state) {
          if (state is ChargingLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is ChargingActive) return _buildActive(context, state);
          return const Center(child: Text('Không có phiên sạc đang hoạt động'));
        },
      ),
    );
  }

  Widget _buildActive(BuildContext context, ChargingActive state) {
    final s = state.session;
    final isStopping = s.status == 'STOPPING';

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(children: [
        if (isStopping)
          IdleFeeCountdownBanner(
              remaining: const Duration(minutes: 15), projectedFeVnd: 0),

        const SizedBox(height: AppSpacing.lg),

        Center(
          child: LiveMeterWidget(
            socPercent: s.socPercent,
            costVnd: VndFormatter.format(s.amountDue),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),

        Container(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.secondary.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          child: Center(
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.timer_outlined, color: AppColors.secondary),
              const SizedBox(width: AppSpacing.sm),
              Text(
                ev_date.DateUtils.formatCountdown(s.elapsed),
                style: AppTypography.headingLg.copyWith(
                    color: AppColors.secondary,
                    fontWeight: FontWeight.w700),
              ),
            ]),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),

        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 3,
          childAspectRatio: 1.4,
          crossAxisSpacing: AppSpacing.sm,
          mainAxisSpacing: AppSpacing.sm,
          children: [
            _MetricTile(label: 'Công suất', value: '${(s.powerW / 1000).toStringAsFixed(1)} kW', icon: Icons.bolt_outlined, color: AppColors.secondary),
            _MetricTile(label: 'Điện năng', value: '${s.energyKwh.toStringAsFixed(2)} kWh', icon: Icons.battery_charging_full_outlined, color: AppColors.primary),
            _MetricTile(label: 'Điện áp', value: '-- V', icon: Icons.electric_meter_outlined, color: AppColors.amber),
            _MetricTile(label: 'Dòng điện', value: '-- A', icon: Icons.cable_outlined, color: AppColors.chargerReserved),
            _MetricTile(label: 'Nhiệt độ', value: '-- °C', icon: Icons.thermostat_outlined, color: AppColors.error),
            _MetricTile(label: 'Chi phí', value: VndFormatter.format(s.amountDue), icon: Icons.monetization_on_outlined, color: AppColors.chargerAvailable),
          ],
        ),
        const SizedBox(height: AppSpacing.xxxl),

        if (!_stopping)
          GestureDetector(
            onLongPress: () {
              setState(() => _stopping = true);
              HapticFeedback.heavyImpact();
              context.read<ChargingSessionBloc>()
                  .add(ChargingStopRequested(sessionId: s.id));
            },
            child: Container(
              width: double.infinity,
              height: 56,
              decoration: BoxDecoration(
                color: AppColors.error,
                borderRadius: BorderRadius.circular(AppRadius.md),
                boxShadow: [
                  BoxShadow(
                      color: AppColors.error.withValues(alpha: 0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4)),
                ],
              ),
              child: const Center(
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.stop_circle_outlined, color: Colors.white, size: 22),
                  SizedBox(width: 8),
                  Text('Giữ 1.5 giây để dừng sạc',
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 15)),
                ]),
              ),
            ),
          )
        else
          const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Spacer(),
            SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 12),
            Text('Đang dừng phiên sạc...'),
            Spacer(),
          ]),

        const SizedBox(height: AppSpacing.xl),
      ]),
    );
  }
}

class _MetricTile extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _MetricTile(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(AppSpacing.sm),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 2),
          Text(value,
              style: AppTypography.caption
                  .copyWith(fontWeight: FontWeight.w700, fontSize: 12)),
          Text(label,
              style: AppTypography.caption
                  .copyWith(color: AppColors.grey600, fontSize: 10)),
        ]),
      );
}
