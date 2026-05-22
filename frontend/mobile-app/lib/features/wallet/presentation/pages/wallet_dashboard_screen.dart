import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import '../bloc/wallet_bloc.dart';
import '../../domain/entities/wallet_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/alert_banner.dart';
import '../../../../core/design_system/widgets/glass_pill.dart';
import '../../../../core/design_system/widgets/glass_square.dart';
import '../../../../core/design_system/widgets/liquid_glass_card.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;

/// Wallet Dashboard Screen — Liquid Glass Design
class WalletDashboardScreen extends StatefulWidget {
  const WalletDashboardScreen({super.key});

  @override
  State<WalletDashboardScreen> createState() => _WalletDashboardScreenState();
}

class _WalletDashboardScreenState extends State<WalletDashboardScreen> {
  String _txFilter = 'ALL';

  @override
  void initState() {
    super.initState();
    context.read<WalletBloc>().add(const WalletLoad());
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      child: BlocConsumer<WalletBloc, WalletState>(
        listener: (context, state) {
          if (state is WalletTopUpInitiated) {
            _openVNPayUrl(state.vnpayUrl, state.transactionId, context);
          } else if (state is WalletError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: AppColors.error),
            );
          }
        },
        builder: (context, state) {
          if (state is WalletLoading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is! WalletLoaded) {
            return const Center(child: Text('Đang tải...'));
          }
          return _buildContent(context, state);
        },
      ),
    );
  }

  Widget _buildContent(BuildContext context, WalletLoaded state) {
    final txList = state.transactions.where((tx) {
      if (_txFilter == 'ALL') return true;
      return tx.type == _txFilter;
    }).toList();

    return RefreshIndicator(
      onRefresh: () async => context.read<WalletBloc>().add(const WalletLoad()),
      child: CustomScrollView(
        slivers: [
          // ── Header ──────────────────────────────────────────────
          SliverToBoxAdapter(
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, 0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Ví điện tử',
                            style: AppTypography.headingLg.copyWith(fontWeight: FontWeight.w700)),
                        Text('Digital Wallet',
                            style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
                      ],
                    ),
                    GestureDetector(
                      onTap: () => context.read<WalletBloc>().add(const WalletLoad()),
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                        ),
                        child: const Icon(Icons.refresh_outlined, size: 20),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Balance + Stats Tiles ────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                children: [
                  // Balance hero — full-width GlassSquare style card
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppSpacing.xl),
                    decoration: BoxDecoration(
                      gradient: AppColors.cyanLimeGradient,
                      borderRadius: BorderRadius.circular(28),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cyan.withValues(alpha: 0.4),
                          blurRadius: 40,
                          offset: const Offset(0, 20),
                        ),
                      ],
                    ),
                    child: Stack(
                      children: [
                        // Shine overlay
                        Positioned.fill(
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(28),
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  Colors.white.withValues(alpha: 0.3),
                                  Colors.transparent,
                                ],
                                stops: const [0.0, 0.5],
                              ),
                            ),
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Số dư khả dụng',
                              style: AppTypography.bodyMd.copyWith(
                                color: Colors.white.withValues(alpha: 0.85),
                              ),
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            Text(
                              VndFormatter.format(state.wallet.balance),
                              style: AppTypography.displayLg.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.lg),
                            ElevatedButton.icon(
                              onPressed: () => _showTopUpDialog(context),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.white,
                                foregroundColor: AppColors.cyan,
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 20, vertical: 10),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(AppRadius.full),
                                ),
                                elevation: 0,
                              ),
                              icon: const Icon(Icons.add, size: 18),
                              label: Text('Nạp tiền',
                                  style: AppTypography.labelMd.copyWith(
                                    color: AppColors.cyan,
                                    fontWeight: FontWeight.w700,
                                  )),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  // Arrears warning
                  if (state.wallet.hasArrears) ...[
                    ArrearsAlertBanner(
                      amount: 'Nợ tồn đọng: ${VndFormatter.format(state.wallet.arrearsAmount ?? 0)}',
                      onTap: null,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    EVButton(
                      label: 'Thanh toán nợ (${VndFormatter.format(state.wallet.arrearsAmount ?? 0)})',
                      variant: EVButtonVariant.danger,
                      onPressed: () =>
                          context.read<WalletBloc>().add(const WalletPayArrears()),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],

                  // Quick stat tiles
                  Wrap(
                    spacing: AppSpacing.md,
                    runSpacing: AppSpacing.md,
                    alignment: WrapAlignment.center,
                    children: [
                      GlassSquare(
                        size: 120,
                        gradient: AppColors.blueCyanGradient,
                        shadowColor: AppColors.blue.withValues(alpha: 0.4),
                        children: [
                          Text(
                            state.transactions.length.toString(),
                            style: const TextStyle(
                                fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white),
                          ),
                          const Text('Giao dịch',
                              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                        ],
                      ),
                      GlassSquare(
                        size: 120,
                        gradient: AppColors.yellowOrangeGradient,
                        shadowColor: AppColors.yellow.withValues(alpha: 0.4),
                        children: [
                          Text(
                            VndFormatter.compact(
                              state.transactions
                                  .where((t) => t.isCredit)
                                  .fold(0.0, (s, t) => s + t.amount),
                            ),
                            style: const TextStyle(
                                fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
                          ),
                          const Text('Đã nạp',
                              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // ── Transaction Filter Pills ─────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Lịch sử giao dịch', style: AppTypography.headingMd),
                  const SizedBox(height: AppSpacing.md),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _FilterPill(label: 'Tất cả',    value: 'ALL',     current: _txFilter, onTap: (v) => setState(() => _txFilter = v)),
                        const SizedBox(width: 8),
                        _FilterPill(label: 'Nạp tiền',  value: 'TOPUP',   current: _txFilter, onTap: (v) => setState(() => _txFilter = v)),
                        const SizedBox(width: 8),
                        _FilterPill(label: 'Thanh toán',value: 'PAYMENT', current: _txFilter, onTap: (v) => setState(() => _txFilter = v)),
                        const SizedBox(width: 8),
                        _FilterPill(label: 'Hoàn tiền', value: 'REFUND',  current: _txFilter, onTap: (v) => setState(() => _txFilter = v)),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
              ),
            ),
          ),

          // ── Transaction List ─────────────────────────────────────
          if (txList.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xxxl),
                child: LiquidGlassCard(
                  child: Column(
                    children: [
                      const Icon(Icons.receipt_long_outlined, size: 56, color: AppColors.textMuted),
                      const SizedBox(height: AppSpacing.lg),
                      Text('Chưa có giao dịch nào',
                          style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
                    ],
                  ),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (_, i) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: _TransactionTile(tx: txList[i]),
                  ),
                  childCount: txList.length,
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _showTopUpDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Nạp tiền vào ví'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Chọn số tiền nạp (thanh toán qua VNPay):'),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [50000, 100000, 200000, 500000, 1000000]
                  .map((amt) => ActionChip(
                        label: Text(VndFormatter.format(amt.toDouble())),
                        onPressed: () {
                          Navigator.pop(dialogContext);
                          context
                              .read<WalletBloc>()
                              .add(WalletTopUpInitiate(amount: amt.toDouble()));
                        },
                      ))
                  .toList(),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Huỷ'),
          ),
        ],
      ),
    );
  }

  Future<void> _openVNPayUrl(String url, String txnRef, BuildContext context) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

class _FilterPill extends StatelessWidget {
  final String label;
  final String value;
  final String current;
  final ValueChanged<String> onTap;

  const _FilterPill({
    required this.label,
    required this.value,
    required this.current,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isActive = value == current;
    return GlassPill(
      label: label,
      isActive: isActive,
      onTap: () => onTap(value),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  final TransactionEntity tx;
  const _TransactionTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isCredit = tx.isCredit;
    final color = isCredit ? AppColors.chargerAvailable : AppColors.error;
    final sign = isCredit ? '+' : '-';

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: 0.05)
            : Colors.white.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(
          color: Colors.white.withValues(alpha: isDark ? 0.1 : 0.5),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              isCredit ? Icons.arrow_downward_outlined : Icons.arrow_upward_outlined,
              color: color,
              size: 20,
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tx.description ?? _translateType(tx.type),
                  style: AppTypography.bodyMd.copyWith(fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  ev_date.DateUtils.formatDateTime(tx.createdAt),
                  style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                ),
              ],
            ),
          ),
          Text(
            '$sign${VndFormatter.format(tx.amount)}',
            style: AppTypography.bodyMd.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  String _translateType(String type) {
    switch (type) {
      case 'TOPUP':   return 'Nạp tiền';
      case 'PAYMENT': return 'Thanh toán';
      case 'REFUND':  return 'Hoàn tiền';
      case 'PENALTY': return 'Phạt';
      default:        return type;
    }
  }
}
