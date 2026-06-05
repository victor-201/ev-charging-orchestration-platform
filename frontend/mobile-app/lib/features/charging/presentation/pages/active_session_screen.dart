
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../domain/entities/charging_session_entity.dart';
import '../bloc/charging_session_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/live_meter_widget.dart';
import '../../../../core/design_system/widgets/alert_banner.dart';
import '../../../../core/design_system/widgets/glass_container.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/ev_header.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/di/injection.dart';
import '../../../map/domain/entities/station_entity.dart';
import '../../../map/domain/repositories/i_station_repository.dart';



/// Active Charging Session Screen
///
/// — ACTIVE / STOPPING: shows real-time WebSocket telemetry (power, voltage,
///   current, temperature, energy, cost), animated SoC gauge, live elapsed
///   timer, and a long-press stop button.
///
/// — COMPLETED / ERROR / other: shows the final frozen telemetry snapshot,
///   a summary info card (start time, end time, charger, transaction ID),
///   and a "Sạc hoàn tất" success card.
class ActiveSessionScreen extends StatefulWidget {
  final String sessionId;
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

  StationEntity? _resolvedStation;
  ChargerEntity? _resolvedCharger;
  bool _loadingStation = false;

  void _resolveStationInfo(String chargerId) {
    if (_resolvedStation != null &&
        (_resolvedCharger?.id == chargerId || _resolvedCharger?.connectorId == chargerId)) {
      return;
    }
    if (_loadingStation) return;
    _loadingStation = true;

    getIt<IStationRepository>()
        .getStationByChargerId(chargerId)
        .then((result) {
      if (mounted) {
        setState(() {
          _loadingStation = false;
          result.fold(
            (_) {},
            (station) {
              _resolvedStation = station;
              _resolvedCharger = station.chargers.firstWhere(
                (c) => c.id == chargerId || c.connectorId == chargerId,
                orElse: () => station.chargers.isNotEmpty ? station.chargers.first : station.chargers.first,
              );
            },
          );
        });
      }
    }).catchError((_) {
      if (mounted) {
        setState(() {
          _loadingStation = false;
        });
      }
    });
  }

  @override
  void initState() {
    super.initState();
    if (widget.sessionId == 'new' && widget.chargerId != null) {
      context.read<ChargingSessionBloc>().add(ChargingStartRequested(
            chargerId: widget.chargerId!,
            bookingId: widget.bookingId,
            qrToken: widget.qrToken,
          ));
    } else if (widget.sessionId != 'new') {
      context.read<ChargingSessionBloc>().add(
            ChargingSessionFetchRequested(sessionId: widget.sessionId),
          );
    }

    final currentState = context.read<ChargingSessionBloc>().state;
    if (currentState is ChargingActive) {
      _resolveStationInfo(currentState.session.chargerId);
    } else if (currentState is ChargingCompleted) {
      _resolveStationInfo(currentState.session.chargerId);
    }
  }

  // ── Navigation helper ───────────────────────────────────────────────────
  void _goBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/charging');
    }
  }



  // ── Stop session ────────────────────────────────────────────────────────
  void _stopSession(String sessionId) {
    setState(() => _stopping = true);
    HapticFeedback.heavyImpact();
    context.read<ChargingSessionBloc>().add(ChargingStopRequested(sessionId: sessionId));
  }

  // ── Root build ──────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      extendBodyBehindAppBar: true,
      appBar: EVHeader(
        title: 'Phiên sạc',
        showBackButton: true,
        onBackTapped: _goBack,
      ),
      child: SafeArea(
        bottom: false,
        child: BlocConsumer<ChargingSessionBloc, ChargingState>(
          listener: (context, state) {
            if (state is ChargingActive) {
              _resolveStationInfo(state.session.chargerId);
            }
            if (state is ChargingCompleted) {
              _resolveStationInfo(state.session.chargerId);
            }
            if (state is ChargingCompleted) {
              HapticFeedback.mediumImpact();
              EVToast.show(context, message: 'Phiên sạc đã hoàn thành!', isError: false);
            }
            if (state is ChargingError) {
              EVToast.show(context, message: state.message, isError: true);
              setState(() => _stopping = false);
            }
          },
          builder: (context, state) {
            if (state is ChargingLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            if (state is ChargingActive) {
              return _buildLiveSession(context, state);
            }
            if (state is ChargingCompleted) {
              return _buildCompletedSession(context, state.session);
            }
            if (state is ChargingError) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: AppColors.error),
                    const SizedBox(height: 16),
                    Text(state.message, style: AppTypography.bodyMd),
                    const SizedBox(height: 24),
                    EVButton(
                      label: 'Quay lại',
                      onPressed: _goBack,
                    ),
                  ],
                ),
              );
            }
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.battery_unknown_outlined, size: 48, color: AppColors.textMuted),
                  const SizedBox(height: 16),
                  Text('Không tìm thấy phiên sạc', style: AppTypography.bodyMd),
                  const SizedBox(height: 24),
                  EVButton(
                    label: 'Quay lại',
                    onPressed: _goBack,
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIVE SESSION — real-time telemetry (CHARGING / STOPPING / AUTHORIZED)
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildLiveSession(BuildContext context, ChargingActive state) {
    final s = state.session;
    final t = state.latestTelemetry;
    final isStopping = s.status == 'STOPPING';

    return SingleChildScrollView(
      padding: AppLayout.paddingWithHeaderAndNavbar(context),
      child: Column(children: [

        // ── STOPPING warning banner ────────────────────────────────────────
        if (isStopping) ...[
          const IdleFeeCountdownBanner(
            remaining: Duration(minutes: 15),
            projectedFeVnd: 0,
          ),
          const SizedBox(height: AppSpacing.md),
        ],

        // ── Live status pill ──────────────────────────────────────────────
        _StatusPill(
          label: isStopping ? 'Đang dừng...' : 'Đang sạc',
          color: isStopping ? AppColors.warning : AppColors.secondary,
          isPulsing: !isStopping,
        ),
        const SizedBox(height: AppSpacing.lg),

        // ── Animated SoC gauge with Neon Radial Glow ──────────────────────
        Center(
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 250,
                height: 250,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      AppColors.primary.withValues(alpha: isStopping ? 0.08 : 0.15),
                      AppColors.secondary.withValues(alpha: isStopping ? 0.02 : 0.05),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
              LiveMeterWidget(
                socPercent: t?.socPercent ?? s.startSocPercent ?? s.socPercent,
                costVnd: VndFormatter.format(t?.amountDue ?? s.amountDue),
                isAnimated: true,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.xl),

        // ── Live elapsed timer ────────────────────────────────────────────
        _TimerBadge(
          label: ev_date.DateUtils.formatCountdown(s.elapsed),
          color: AppColors.secondary,
          icon: Icons.timer_outlined,
        ),
        const SizedBox(height: AppSpacing.lg),

        // ── Real-time telemetry grid in a Glass Container ──────────────────
        const _SectionLabel(label: '📡 THÔNG SỐ THỜI GIAN THỰC'),
        const SizedBox(height: AppSpacing.sm),
        GlassContainer(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: _MetricCard(
                      label: 'Công suất',
                      value: _powerStr(t?.powerW ?? s.powerW),
                      icon: Icons.bolt_rounded,
                      color: AppColors.secondary,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: _MetricCard(
                      label: 'Điện năng',
                      value: _energyStr(t?.energyKwh ?? s.energyKwh),
                      icon: Icons.battery_charging_full_rounded,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: _MetricCard(
                      label: 'Điện áp',
                      value: _voltageStr(t?.voltageV ?? s.voltageV),
                      icon: Icons.electric_meter_rounded,
                      color: AppColors.amber,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: _MetricCard(
                      label: 'Dòng điện',
                      value: _currentStr(t?.currentA ?? s.currentA),
                      icon: Icons.cable_rounded,
                      color: AppColors.purple,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: _MetricCard(
                      label: 'Nhiệt độ',
                      value: _tempStr(t?.temperatureC ?? s.temperatureC),
                      icon: Icons.thermostat_rounded,
                      color: AppColors.error,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: _MetricCard(
                      label: 'Chi phí',
                      value: VndFormatter.format(t?.amountDue ?? s.amountDue),
                      icon: Icons.monetization_on_rounded,
                      color: AppColors.success,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),

        // ── Connection Info section ──────────────────────────────────────
        const _SectionLabel(label: '🔌 THÔNG TIN KẾT NỐI'),
        const SizedBox(height: AppSpacing.sm),
        GlassContainer(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
          child: Column(
            children: [
              _InfoRow(
                label: 'Trạm sạc',
                value: s.stationName != null
                    ? (s.cityName != null ? '${s.stationName} (${s.cityName})' : s.stationName!)
                    : (_resolvedStation?.name ?? 'Đang tải trạm sạc...'),
                icon: Icons.store_mall_directory_rounded,
              ),
              const _Divider(),
              _InfoRow(
                label: 'Trụ sạc',
                value: s.maxPowerKw != null
                    ? 'Trụ sạc (${s.maxPowerKw!.toStringAsFixed(0)} kW)'
                    : (_resolvedCharger != null
                        ? '${_resolvedCharger!.name} (${_resolvedCharger!.powerKw.toStringAsFixed(0)} kW)'
                        : 'Đang tải trụ sạc...'),
                icon: Icons.ev_station_rounded,
              ),
              const _Divider(),
              _InfoRow(
                label: 'Đầu sạc (Connector)',
                value: s.connectorType ?? _resolvedCharger?.connectorType ?? 'Đang tải đầu sạc...',
                icon: Icons.power_rounded,
              ),
              const _Divider(),
              _InfoRow(
                label: 'Mã trụ sạc (ID)',
                value: s.chargerId,
                icon: Icons.fingerprint_rounded,
                mono: true,
                isCopyable: true,
                onCopy: () {
                  Clipboard.setData(ClipboardData(text: s.chargerId));
                  EVToast.show(context, message: 'Đã sao chép mã trụ sạc!', isError: false);
                },
              ),
              const _Divider(),
              _InfoRow(
                label: 'Thời gian bắt đầu',
                value: ev_date.DateUtils.formatDateTime(s.startedAt),
                icon: Icons.play_circle_outline_rounded,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.xxl),

        // ── Stop button ────────────────────────────────────────────────────
        _LongPressStopButton(
          isLoading: _stopping,
          onPressed: () => _stopSession(s.id),
        ),

        const SizedBox(height: AppSpacing.xl),
      ]),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMPLETED SESSION — premium digital receipt layout
  // ══════════════════════════════════════════════════════════════════════════
  Widget _buildCompletedSession(BuildContext context, ChargingSessionEntity s) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return SingleChildScrollView(
      padding: AppLayout.paddingWithHeaderAndNavbar(context),
      child: Column(children: [
        GlassContainer(
          padding: const EdgeInsets.all(AppSpacing.lg),
          borderRadius: BorderRadius.circular(AppRadius.lg),
          child: Column(
            children: [
              // Ticket Header: success icon and status
              Container(
                width: 64, height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.success.withValues(alpha: 0.12),
                  border: Border.all(color: AppColors.success.withValues(alpha: 0.2), width: 1.5),
                ),
                child: const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 36),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                'SẠC HOÀN TẤT',
                style: AppTypography.headingMd.copyWith(
                  fontWeight: FontWeight.w900,
                  color: AppColors.success,
                  letterSpacing: 1.0,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Tổng thời gian cắm sạc: ${ev_date.DateUtils.formatCountdown(s.elapsed)}',
                style: AppTypography.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              
              // Decorative dashed divider
              const _DashedDivider(),
              const SizedBox(height: AppSpacing.lg),

              // Summary stats row
              Row(
                children: [
                  Expanded(
                    child: _SummaryItem(
                      label: 'Điện năng',
                      value: '${s.energyKwh.toStringAsFixed(2)} kWh',
                      icon: Icons.battery_charging_full_rounded,
                      color: AppColors.primary,
                    ),
                  ),
                  Container(width: 1, height: 40, color: isDark ? Colors.white12 : Colors.black12),
                  Expanded(
                    child: _SummaryItem(
                      label: 'Thời gian',
                      value: _formatDuration(s.elapsed),
                      icon: Icons.timer_rounded,
                      color: AppColors.secondary,
                    ),
                  ),
                  Container(width: 1, height: 40, color: isDark ? Colors.white12 : Colors.black12),
                  Expanded(
                    child: _SummaryItem(
                      label: 'Chi phí',
                      value: VndFormatter.format(s.amountDue),
                      icon: Icons.monetization_on_rounded,
                      color: AppColors.success,
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: AppSpacing.lg),
              const _DashedDivider(),
              const SizedBox(height: AppSpacing.lg),

              // Detailed information rows
              _InfoRow(
                label: 'Trạm sạc',
                value: s.stationName != null
                    ? (s.cityName != null ? '${s.stationName} (${s.cityName})' : s.stationName!)
                    : (_resolvedStation?.name ?? 'Đang tải trạm sạc...'),
                icon: Icons.store_mall_directory_rounded,
              ),
              const _Divider(),
              _InfoRow(
                label: 'Trụ sạc',
                value: s.maxPowerKw != null
                    ? 'Trụ sạc (${s.maxPowerKw!.toStringAsFixed(0)} kW)'
                    : (_resolvedCharger != null
                        ? '${_resolvedCharger!.name} (${_resolvedCharger!.powerKw.toStringAsFixed(0)} kW)'
                        : 'Đang tải trụ sạc...'),
                icon: Icons.ev_station_rounded,
              ),
              const _Divider(),
              _InfoRow(
                label: 'Đầu sạc (Connector)',
                value: s.connectorType ?? _resolvedCharger?.connectorType ?? 'Đang tải đầu sạc...',
                icon: Icons.power_rounded,
              ),
              const _Divider(),
              _InfoRow(
                label: 'Mã trụ sạc (ID)',
                value: s.chargerId,
                icon: Icons.fingerprint_rounded,
                mono: true,
                isCopyable: true,
                onCopy: () {
                  Clipboard.setData(ClipboardData(text: s.chargerId));
                  EVToast.show(context, message: 'Đã sao chép mã trụ sạc!', isError: false);
                },
              ),
              if (s.startSocPercent != null || s.socPercent > 0) ...[
                const _Divider(),
                _InfoRow(
                  label: 'Dung lượng pin',
                  value: '${s.startSocPercent?.toStringAsFixed(0) ?? '--'}% → ${s.socPercent.toStringAsFixed(0)}%',
                  icon: Icons.battery_charging_full_rounded,
                ),
              ],
              if (s.startMeterWh != null || s.endMeterWh != null) ...[
                const _Divider(),
                _InfoRow(
                  label: 'Chỉ số điện (Wh)',
                  value: '${s.startMeterWh?.toStringAsFixed(0) ?? '--'} → ${s.endMeterWh?.toStringAsFixed(0) ?? '--'}',
                  icon: Icons.electric_meter_rounded,
                ),
              ],
              const _Divider(),
              _InfoRow(
                label: 'Bắt đầu',
                value: ev_date.DateUtils.formatDateTime(s.startedAt),
                icon: Icons.play_circle_outline_rounded,
              ),
              if (s.endedAt != null) ...[
                const _Divider(),
                _InfoRow(
                  label: 'Kết thúc',
                  value: ev_date.DateUtils.formatDateTime(s.endedAt!),
                  icon: Icons.stop_circle_outlined,
                ),
              ],
              if (s.transactionId != null) ...[
                const _Divider(),
                _InfoRow(
                  label: 'Mã giao dịch',
                  value: s.transactionId!,
                  icon: Icons.receipt_long_rounded,
                  mono: true,
                  isCopyable: true,
                  onCopy: () {
                    Clipboard.setData(ClipboardData(text: s.transactionId!));
                    EVToast.show(context, message: 'Đã sao chép mã giao dịch!', isError: false);
                  },
                ),
              ],
              const _Divider(),
              _InfoRow(
                label: 'Mã phiên',
                value: s.id,
                icon: Icons.fingerprint_rounded,
                mono: true,
                isCopyable: true,
                onCopy: () {
                  Clipboard.setData(ClipboardData(text: s.id));
                  EVToast.show(context, message: 'Đã sao chép mã phiên sạc!', isError: false);
                },
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.xl),

        // ── Navigation Back Button ─────────────────────────────────────────
        EVButton(
          label: 'Quay lại Trang chủ',
          icon: Icons.home_outlined,
          onPressed: _goBack,
        ),
        const SizedBox(height: AppSpacing.xxl),
      ]),
    );
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    if (h > 0) return '${h}h${m}ph';
    return '$m phút';
  }

  // ── Telemetry format helpers ─────────────────────────────────────────────
  String _powerStr(double w) {
    if (w <= 0) return '-- kW';
    final kw = w / 1000;
    return '${kw.toStringAsFixed(kw >= 10 ? 1 : 2)} kW';
  }

  String _energyStr(double kwh) {
    if (kwh <= 0) return '-- kWh';
    return '${kwh.toStringAsFixed(3)} kWh';
  }

  String _voltageStr(double v) {
    if (v <= 0) return '-- V';
    return '${v.toStringAsFixed(1)} V';
  }

  String _currentStr(double a) {
    if (a <= 0) return '-- A';
    return '${a.toStringAsFixed(2)} A';
  }

  String _tempStr(double c) {
    if (c <= 0) return '-- °C';
    return '${c.toStringAsFixed(1)} °C';
  }

}

// ── Shared small widgets ─────────────────────────────────────────────────────

/// Animated pulsing live status indicator pill
class _StatusPill extends StatefulWidget {
  final String label;
  final Color color;
  final bool isPulsing;
  const _StatusPill({required this.label, required this.color, this.isPulsing = true});
  @override
  State<_StatusPill> createState() => _StatusPillState();
}

class _StatusPillState extends State<_StatusPill> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat();
    _pulse = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppRadius.full),
          border: Border.all(color: color.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.isPulsing)
              Stack(
                alignment: Alignment.center,
                children: [
                  AnimatedBuilder(
                    animation: _pulse,
                    builder: (_, __) => Transform.scale(
                      scale: 1.0 + _pulse.value * 1.5,
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: widget.color.withValues(alpha: (1.0 - _pulse.value) * 0.6),
                        ),
                      ),
                    ),
                  ),
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: widget.color,
                    ),
                  ),
                ],
              )
            else
              const Icon(Icons.warning_amber_rounded, size: 12, color: AppColors.warning),
            const SizedBox(width: 8),
            Text(
              widget.label,
              style: AppTypography.labelMd.copyWith(
                color: widget.color,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color get color => widget.color;
}

/// Elapsed time / duration badge
class _TimerBadge extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;
  const _TimerBadge({required this.label, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 20),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.04 : 0.06),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Center(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 16),
            const SizedBox(width: 8),
            Text(
              'THỜI GIAN ĐÃ SẠC:',
              style: AppTypography.caption.copyWith(
                color: AppColors.textMuted,
                fontWeight: FontWeight.w800,
                fontSize: 10,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: AppTypography.bodyLg.copyWith(
                color: isDark ? Colors.white : AppColors.pillTextLight,
                fontWeight: FontWeight.w900,
                fontFamily: 'monospace',
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Section label above grids/cards
class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 4),
      child: Text(
        label,
        style: AppTypography.labelMd.copyWith(
          color: AppColors.textMuted,
          fontWeight: FontWeight.w700,
          fontSize: 11,
          letterSpacing: 1.0,
        ),
      ),
    ),
  );
}

/// Single premium metric card inside live session grid
class _MetricCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.03) : Colors.black.withValues(alpha: 0.02),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.04),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withValues(alpha: 0.1),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  value,
                  style: AppTypography.bodyLg.copyWith(
                    fontWeight: FontWeight.w900,
                    color: isDark ? Colors.white : AppColors.pillTextLight,
                    fontSize: 14,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  label.toUpperCase(),
                  style: AppTypography.caption.copyWith(
                    color: AppColors.textMuted,
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Dynamic dashed divider for receipts
class _DashedDivider extends StatelessWidget {
  const _DashedDivider();

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return LayoutBuilder(
      builder: (context, constraints) {
        final boxWidth = constraints.constrainWidth();
        const dashWidth = 6.0;
        const dashHeight = 1.0;
        final dashCount = (boxWidth / (2 * dashWidth)).floor();
        return Flex(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          direction: Axis.horizontal,
          children: List.generate(dashCount, (_) {
            return SizedBox(
              width: dashWidth,
              height: dashHeight,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: isDark ? Colors.white.withValues(alpha: 0.15) : Colors.black.withValues(alpha: 0.12),
                ),
              ),
            );
          }),
        );
      },
    );
  }
}

/// Single summary item for receipt grid
class _SummaryItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _SummaryItem({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(height: 6),
        Text(
          value,
          style: AppTypography.bodyMd.copyWith(
            fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : AppColors.pillTextLight,
            fontSize: 14,
          ),
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: AppTypography.caption.copyWith(
            color: AppColors.textMuted,
            fontSize: 10,
            fontWeight: FontWeight.w600,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

/// One row inside the session info card
class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final bool mono;
  final bool isCopyable;
  final VoidCallback? onCopy;

  const _InfoRow({
    required this.label,
    required this.value,
    required this.icon,
    this.mono = false,
    this.isCopyable = false,
    this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    Widget content = Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(children: [
        Icon(icon, size: 18, color: AppColors.textMuted),
        const SizedBox(width: 10),
        Text(
          label,
          style: AppTypography.caption.copyWith(color: AppColors.textMuted, fontSize: 13),
        ),
        const Spacer(),
        Flexible(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  value,
                  style: AppTypography.caption.copyWith(
                    fontWeight: FontWeight.w700,
                    color: Theme.of(context).colorScheme.onSurface,
                    fontFamily: mono ? 'monospace' : null,
                    fontSize: mono ? 12 : 13,
                  ),
                  textAlign: TextAlign.right,
                  overflow: TextOverflow.ellipsis,
                  maxLines: 2,
                ),
              ),
              if (isCopyable) ...[
                const SizedBox(width: 6),
                const Icon(Icons.copy_rounded, size: 14, color: AppColors.primary),
              ],
            ],
          ),
        ),
      ]),
    );

    if (isCopyable && onCopy != null) {
      return GestureDetector(
        onTap: onCopy,
        behavior: HitTestBehavior.opaque,
        child: content,
      );
    }
    return content;
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) => const Divider(height: 1, thickness: 0.5);
}

/// Stateful LONG PRESS STOP BUTTON with smooth press scaling & inner progress bar overlay
class _LongPressStopButton extends StatefulWidget {
  final VoidCallback onPressed;
  final bool isLoading;

  const _LongPressStopButton({required this.onPressed, required this.isLoading});

  @override
  State<_LongPressStopButton> createState() => _LongPressStopButtonState();
}

class _LongPressStopButtonState extends State<_LongPressStopButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animCtrl;
  bool _isPressing = false;

  @override
  void initState() {
    super.initState();
    _animCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
  }

  @override
  void dispose() {
    _animCtrl.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails _) {
    if (widget.isLoading) return;
    setState(() => _isPressing = true);
    _animCtrl.forward().then((value) {
      if (_animCtrl.status == AnimationStatus.completed) {
        setState(() => _isPressing = false);
        _animCtrl.reset();
        widget.onPressed();
      }
    });
  }

  void _onTapUp(TapUpDetails _) {
    if (widget.isLoading) return;
    _cancelPress();
  }

  void _onTapCancel() {
    if (widget.isLoading) return;
    _cancelPress();
  }

  void _cancelPress() {
    setState(() => _isPressing = false);
    _animCtrl.reverse();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isLoading) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 20, height: 20,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.error),
          ),
          const SizedBox(width: 12),
          Text(
            'Đang dừng phiên sạc...',
            style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
          ),
        ],
      );
    }

    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      child: AnimatedScale(
        scale: _isPressing ? 0.96 : 1.0,
        duration: const Duration(milliseconds: 150),
        curve: Curves.easeOutCubic,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          width: double.infinity,
          height: 60,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: _isPressing
                  ? [AppColors.error, const Color(0xFFC53030)]
                  : [const Color(0xFFFF5A5F), AppColors.error],
            ),
            borderRadius: BorderRadius.circular(AppRadius.md),
            boxShadow: [
              BoxShadow(
                color: AppColors.error.withValues(alpha: _isPressing ? 0.5 : 0.3),
                blurRadius: _isPressing ? 20 : 12,
                offset: Offset(0, _isPressing ? 8 : 4),
              ),
            ],
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Positioned.fill(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadius.md),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: AnimatedBuilder(
                      animation: _animCtrl,
                      builder: (context, _) => FractionallySizedBox(
                        widthFactor: _animCtrl.value,
                        child: Container(
                          color: Colors.white.withValues(alpha: 0.15),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.stop_circle_outlined, color: Colors.white, size: 24),
                  const SizedBox(width: 8),
                  Text(
                    _isPressing ? 'Đang giữ để dừng...' : 'Nhấn giữ 1.5s để dừng sạc',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
