import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../bloc/wallet_bloc.dart';
import '../../domain/entities/wallet_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_pill.dart';
import '../../../../core/design_system/widgets/glass_square.dart';
import '../../../../core/design_system/widgets/liquid_glass_card.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;

/// Wallet Dashboard Screen — High-Fidelity Futuristic Design
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
      child: SafeArea(
        bottom: false,
        child: BlocConsumer<WalletBloc, WalletState>(
          listener: (context, state) {
            if (state is WalletTopUpInitiated) {
              _openVNPayUrl(state.vnpayUrl);
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
              return const Center(child: Text('Đang tải dữ liệu ví...'));
            }
            return _buildContent(context, state);
          },
        ),
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
          // ── Premium Header ──────────────────────────────────────
          SliverToBoxAdapter(
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
                    ],
                  ),
                  Row(
                    children: [
                      GestureDetector(
                        onTap: () => context.push('/profile/arrears'),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: state.wallet.hasArrears
                                ? AppColors.error.withValues(alpha: 0.15)
                                : Colors.white.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: state.wallet.hasArrears
                                  ? AppColors.error.withValues(alpha: 0.3)
                                  : Colors.white.withValues(alpha: 0.2),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Stack(
                                clipBehavior: Clip.none,
                                children: [
                                  Icon(
                                    Icons.receipt_long_outlined,
                                    size: 16,
                                    color: state.wallet.hasArrears ? AppColors.error : Colors.white,
                                  ),
                                  if (state.wallet.hasArrears)
                                    Positioned(
                                      right: -2,
                                      top: -2,
                                      child: Container(
                                        width: 6,
                                        height: 6,
                                        decoration: const BoxDecoration(
                                          color: AppColors.error,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'Công nợ',
                                style: AppTypography.labelMd.copyWith(
                                  color: state.wallet.hasArrears ? AppColors.error : Colors.white,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
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
                ],
              ),
            ),
          ),

          // ── Cyberpunk EVolt Credit Card & Arrears ───────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.lg),
              child: Column(
                children: [
                  // Futuristic EVolt Credit Card layout
                  Container(
                    width: double.infinity,
                    height: 200,
                    decoration: BoxDecoration(
                      gradient: AppColors.cyanLimeGradient,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cyan.withValues(alpha: 0.35),
                          blurRadius: 32,
                          offset: const Offset(0, 16),
                        ),
                      ],
                    ),
                    child: Stack(
                      children: [
                        // Card lines overlay
                        Positioned.fill(
                          child: Opacity(
                            opacity: 0.15,
                            child: CustomPaint(
                              painter: _CardLinesPainter(),
                            ),
                          ),
                        ),
                        // Shiny gradient overlay
                        Positioned.fill(
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(24),
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  Colors.white.withValues(alpha: 0.25),
                                  Colors.transparent,
                                ],
                                stops: const [0.0, 0.4],
                              ),
                            ),
                          ),
                        ),
                        // Card details
                        Padding(
                          padding: const EdgeInsets.all(24.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  // Golden simulated credit card chip
                                  Container(
                                    width: 42,
                                    height: 32,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFE2E8F0),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: const Color(0xFFCBD5E1), width: 1.5),
                                    ),
                                    child: GridView.count(
                                      crossAxisCount: 3,
                                      padding: const EdgeInsets.all(2),
                                      children: List.generate(
                                        9,
                                        (index) => Container(
                                          margin: const EdgeInsets.all(1),
                                          decoration: BoxDecoration(
                                            border: Border.all(color: const Color(0xFF94A3B8), width: 0.5),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  // Glowing bolt branding
                                  Row(
                                    children: [
                                      const Icon(Icons.electric_bolt, color: Colors.white, size: 18),
                                      const SizedBox(width: 4),
                                      Text(
                                        'EVOLTSYNC',
                                        style: AppTypography.labelMd.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 1.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'SỐ DƯ KHẢ DỤNG',
                                        style: AppTypography.caption.copyWith(
                                          color: Colors.white.withValues(alpha: 0.75),
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: 1.0,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        VndFormatter.format(state.wallet.balance),
                                        style: AppTypography.displayLg.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 28,
                                        ),
                                      ),
                                    ],
                                  ),
                                  ElevatedButton.icon(
                                    onPressed: () => _showTopUpDialog(context),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white,
                                      foregroundColor: AppColors.cyan,
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(16),
                                      ),
                                      elevation: 0,
                                    ),
                                    icon: const Icon(Icons.add_circle_outline, size: 16),
                                    label: Text(
                                      'Nạp tiền',
                                      style: AppTypography.labelMd.copyWith(
                                        color: AppColors.cyan,
                                        fontWeight: FontWeight.w800,
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

                  const SizedBox(height: AppSpacing.lg),

                  // Arrears warning card & management options
                  if (state.wallet.hasArrears) ...[
                    LiquidGlassCard(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 22),
                              const SizedBox(width: 8),
                              Text(
                                'Cảnh báo nợ quá hạn',
                                style: AppTypography.bodyMd.copyWith(
                                  color: AppColors.error,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            'Tài khoản đang phát sinh nợ tồn đọng trị giá ${VndFormatter.format(state.wallet.arrearsAmount ?? 0)}. Đặt lịch và sạc pin bị tạm khoá.',
                            style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Row(
                            children: [
                              Expanded(
                                child: EVButton(
                                  label: 'Thanh toán ngay',
                                  variant: EVButtonVariant.danger,
                                  onPressed: () =>
                                      context.read<WalletBloc>().add(const WalletPayArrears()),
                                ),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: EVButton(
                                  label: 'Chi tiết công nợ',
                                  variant: EVButtonVariant.secondary,
                                  onPressed: () => context.push('/profile/arrears'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
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
                        size: 130,
                        gradient: AppColors.blueCyanGradient,
                        shadowColor: AppColors.blue.withValues(alpha: 0.3),
                        children: [
                          Text(
                            state.transactions.length.toString(),
                            style: const TextStyle(
                                fontSize: 26, fontWeight: FontWeight.w800, color: Colors.white),
                          ),
                          const SizedBox(height: 4),
                          const Text('Giao dịch',
                              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)),
                        ],
                      ),
                      GlassSquare(
                        size: 130,
                        gradient: AppColors.yellowOrangeGradient,
                        shadowColor: AppColors.yellow.withValues(alpha: 0.3),
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
                          const SizedBox(height: 4),
                          const Text('Đã nạp ví',
                              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)),
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
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                child: Column(
                  children: [
                    LiquidGlassCard(
                      padding: const EdgeInsets.all(AppSpacing.xxl),
                      child: Column(
                        children: [
                          const Icon(Icons.receipt_long_outlined, size: 56, color: AppColors.textMuted),
                          const SizedBox(height: AppSpacing.lg),
                          Text('Chưa có giao dịch nào',
                              style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
                        ],
                      ),
                    ),
                    SizedBox(height: AppLayout.bottomPadding(context)), // Bottom padding to prevent navbar overlap
                  ],
                ),
              ),
            )
          else ...[
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, 0),
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
            // Substantial bottom padding to prevent items from being covered by translucent bottom navigation bar
            SliverToBoxAdapter(
              child: SizedBox(height: AppLayout.bottomPadding(context)),
            ),
          ],
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

  Future<void> _openVNPayUrl(String url) async {
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

/// Simulated circuit lines to give a cyberpunk cyber-credit-card feel
class _CardLinesPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..strokeWidth = 1.0
      ..style = PaintingStyle.stroke;

    final path = Path()
      ..moveTo(size.width * 0.1, 0)
      ..lineTo(size.width * 0.3, size.height * 0.5)
      ..lineTo(size.width * 0.7, size.height * 0.5)
      ..lineTo(size.width * 0.9, size.height)
      ..moveTo(size.width * 0.2, 0)
      ..lineTo(size.width * 0.35, size.height * 0.3)
      ..lineTo(size.width * 0.65, size.height * 0.3)
      ..lineTo(size.width * 0.8, size.height);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
