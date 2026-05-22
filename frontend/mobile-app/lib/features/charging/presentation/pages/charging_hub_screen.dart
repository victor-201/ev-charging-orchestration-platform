import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/charging_session_bloc.dart';
import '../../domain/entities/charging_session_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_pill.dart';
import '../../../../core/design_system/widgets/glass_square.dart';
import '../../../../core/design_system/widgets/liquid_glass_card.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/utils/vnd_formatter.dart';

/// Unified Charging Hub Main Dashboard Screen
class ChargingHubScreen extends StatefulWidget {
  const ChargingHubScreen({super.key});

  @override
  State<ChargingHubScreen> createState() => _ChargingHubScreenState();
}

class _ChargingHubScreenState extends State<ChargingHubScreen> {
  int _tab = 0; // 0 = QR Scan, 1 = History

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ──────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, 0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Sạc điện',
                        style: AppTypography.headingLg.copyWith(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        'EV Charging Hub',
                        style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
                      ),
                    ],
                  ),
                  GestureDetector(
                    onTap: () => context.push('/charging/scan'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        gradient: AppColors.cyanLimeGradient,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.cyan.withValues(alpha: 0.4),
                            blurRadius: 16,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.qr_code_scanner, color: Colors.white, size: 18),
                          const SizedBox(width: 6),
                          Text(
                            'Quét QR',
                            style: AppTypography.labelMd.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // ── Tab Pills ────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: Row(
                children: [
                  Expanded(
                    child: GlassPill(
                      label: 'Quét mã QR',
                      isActive: _tab == 0,
                      onTap: () => setState(() => _tab = 0),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: GlassPill(
                      label: 'Lịch sử',
                      isActive: _tab == 1,
                      onTap: () => setState(() => _tab = 1),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // ── Content ──────────────────────────────────────────
            Expanded(
              child: _tab == 0
                  ? _QuickChargeTab(key: const ValueKey('qr'))
                  : const _ChargingHistoryTab(key: ValueKey('history')),
            ),
          ],
        ),
      ),
    );
  }
}

/// QR Quick Charge activation state panel.
class _QuickChargeTab extends StatelessWidget {
  const _QuickChargeTab({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ChargingSessionBloc, ChargingState>(
      builder: (context, state) {
        if (state is ChargingActive) {
          return _ActiveSessionCard(session: state.session);
        }

        // Idle state — show stat tiles + CTA
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
          child: Column(
            children: [
              // ── 4 GlassSquare stat tiles ───────────────────
              Wrap(
                spacing: AppSpacing.md,
                runSpacing: AppSpacing.md,
                alignment: WrapAlignment.center,
                children: [
                  GlassSquare(
                    gradient: AppColors.cyanLimeGradient,
                    shadowColor: AppColors.cyan.withValues(alpha: 0.4),
                    children: const [
                      Icon(Icons.bolt, color: Colors.white, size: 32),
                      SizedBox(height: 4),
                      Text('Sẵn sàng', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                    ],
                  ),
                  GlassSquare(
                    gradient: AppColors.blueCyanGradient,
                    shadowColor: AppColors.blue.withValues(alpha: 0.4),
                    children: const [
                      Text('AC/DC', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white)),
                      SizedBox(height: 4),
                      Text('Hỗ trợ cả 2', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),

              // ── Main CTA Card ──────────────────────────────
              LiquidGlassCard(
                child: Column(
                  children: [
                    Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        gradient: AppColors.cyanLimeGradient,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.cyan.withValues(alpha: 0.4),
                            blurRadius: 24,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: const Icon(Icons.qr_code_scanner_outlined, color: Colors.white, size: 50),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    Text('Bắt đầu sạc', style: AppTypography.headingLg),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'Quét mã QR tại cọc sạc\nđể bắt đầu phiên sạc tức thì',
                      style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    EVButton(
                      label: 'Quét mã QR',
                      icon: Icons.qr_code_scanner_outlined,
                      onPressed: () => context.push('/charging/scan'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ActiveSessionCard extends StatelessWidget {
  final ChargingSessionEntity session;
  const _ActiveSessionCard({required this.session});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
      child: Column(
        children: [
          // ── 4 GlassSquare tiles ──────────────────────────────
          Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.md,
            alignment: WrapAlignment.center,
            children: [
              GlassSquare(
                gradient: AppColors.cyanLimeGradient,
                shadowColor: AppColors.cyan.withValues(alpha: 0.4),
                children: [
                  Text(
                    '${session.socPercent.toStringAsFixed(0)}%',
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('Pin', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                ],
              ),
              GlassSquare(
                gradient: AppColors.blueCyanGradient,
                shadowColor: AppColors.blue.withValues(alpha: 0.4),
                children: [
                  Text(
                    '${(session.powerW / 1000).toStringAsFixed(1)}',
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('kW', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                ],
              ),
              GlassSquare(
                gradient: AppColors.yellowOrangeGradient,
                shadowColor: AppColors.yellow.withValues(alpha: 0.4),
                children: [
                  Text(
                    session.energyKwh.toStringAsFixed(1),
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('kWh', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                ],
              ),
              GlassSquare(
                gradient: AppColors.orangePinkGradient,
                shadowColor: AppColors.pink.withValues(alpha: 0.4),
                children: [
                  Text(
                    VndFormatter.compact(session.amountDue),
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('VNĐ', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),

          // ── Status card ──────────────────────────────────────
          LiquidGlassCard(
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 8, height: 8,
                      decoration: const BoxDecoration(color: AppColors.lime, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'ĐANG SẠC',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.lime,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                EVButton(
                  label: 'Xem chi tiết phiên sạc',
                  icon: Icons.open_in_new_outlined,
                  onPressed: () => context.push('/charging/session/${session.id}'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChargingHistoryTab extends StatelessWidget {
  const _ChargingHistoryTab({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: LiquidGlassCard(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.history_outlined, size: 56, color: AppColors.textMuted),
            const SizedBox(height: AppSpacing.lg),
            Text('Lịch sử sạc', style: AppTypography.headingMd),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Các phiên sạc trước đây\nsẽ hiển thị ở đây',
              style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
