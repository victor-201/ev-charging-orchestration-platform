import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../bloc/wallet_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_container.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/utils/vnd_formatter.dart';

/// Premium High-Fidelity Arrears Management & Payment Screen
/// Renders debt breakdowns, booking locking warnings, and integrated one-click payment.
class ArrearsScreen extends StatefulWidget {
  const ArrearsScreen({super.key});

  @override
  State<ArrearsScreen> createState() => _ArrearsScreenState();
}

class _ArrearsScreenState extends State<ArrearsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<WalletBloc>().add(const WalletLoad());
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return LiquidGlassScaffold(
      appBar: AppBar(
        title: Text(
          'Quản lý công nợ',
          style: AppTypography.headingMd.copyWith(fontWeight: FontWeight.w800),
        ),
        centerTitle: true,
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios, size: 20),
          onPressed: () => context.pop(),
        ),
      ),
      child: SafeArea(
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
              return const Center(child: Text('Đang tải dữ liệu...'));
            }
  
            final wallet = state.wallet;
            final balance = wallet.balance;
            final arrearsAmount = wallet.arrearsAmount ?? 0.0;
            final hasArrears = wallet.hasArrears;
            final canPayDirect = balance >= arrearsAmount;
  
            return RefreshIndicator(
              onRefresh: () async => context.read<WalletBloc>().add(const WalletLoad()),
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: AppLayout.paddingWithHeaderAndNavbar(context),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: AppSpacing.xs),
  
                    // ── Hero Arrears Status Card ───────────────────────────
                    Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        gradient: hasArrears
                            ? AppColors.orangePinkGradient
                            : AppColors.cyanLimeGradient,
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(
                          color: isDark
                              ? AppColors.cardBorderDark
                              : Colors.white.withValues(alpha: 0.6),
                          width: 1.5,
                        ),
                        boxShadow: [
                          // Inset top highlight
                          BoxShadow(
                            color: Colors.white.withValues(alpha: isDark ? 0.15 : 0.8),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                          // Premium glow shadow corresponding to the state color
                          BoxShadow(
                            color: (hasArrears ? AppColors.pink : AppColors.lime)
                                .withValues(alpha: 0.35),
                            blurRadius: 36,
                            offset: const Offset(0, 16),
                          ),
                        ],
                      ),
                      child: Stack(
                        children: [
                          // Diagonal shine overlay for ultra-premium look
                          Positioned.fill(
                            child: Container(
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(28),
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    Colors.white.withValues(alpha: isDark ? 0.12 : 0.55),
                                    Colors.transparent,
                                  ],
                                  stops: const [0.0, 0.45],
                                ),
                              ),
                            ),
                          ),
                          // Content padding
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.lg,
                              vertical: AppSpacing.xl,
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                // Glowing Icon Container
                                Container(
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.22),
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: Colors.white.withValues(alpha: 0.4),
                                      width: 1.5,
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.08),
                                        blurRadius: 16,
                                      ),
                                    ],
                                  ),
                                  child: Icon(
                                    hasArrears
                                        ? Icons.warning_amber_rounded
                                        : Icons.verified_user_rounded,
                                    color: Colors.white,
                                    size: 40,
                                  ),
                                ),
                                const SizedBox(height: AppSpacing.md),
                                
                                // Text/Amount block based on state
                                if (hasArrears) ...[
                                  Text(
                                    'Tổng nợ tồn đọng',
                                    style: AppTypography.bodyMd.copyWith(
                                      color: Colors.white.withValues(alpha: 0.85),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: AppSpacing.xs),
                                  Text(
                                    VndFormatter.format(arrearsAmount),
                                    style: AppTypography.displayLg.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w900,
                                      fontSize: 34,
                                      shadows: [
                                        Shadow(
                                          color: Colors.black.withValues(alpha: 0.2),
                                          blurRadius: 10,
                                          offset: const Offset(0, 4),
                                        ),
                                      ],
                                    ),
                                  ),
                                ] else ...[
                                  Text(
                                    'Tài khoản sạch nợ',
                                    style: AppTypography.headingMd.copyWith(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 22,
                                    ),
                                  ),
                                  const SizedBox(height: AppSpacing.xs),
                                  Text(
                                    'Tuyệt vời! Bạn không có bất kỳ khoản nợ tồn đọng nào. EVoltSync chúc bạn có những hành trình sạc pin an toàn và trọn vẹn.',
                                    textAlign: TextAlign.center,
                                    style: AppTypography.bodyMd.copyWith(
                                      color: Colors.white.withValues(alpha: 0.9),
                                      fontWeight: FontWeight.w500,
                                      height: 1.4,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: AppSpacing.md),
                                
                                // Capsule status badge inside the card
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.15),
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(
                                      color: Colors.white.withValues(alpha: 0.45),
                                      width: 1.2,
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        hasArrears ? Icons.error_outline : Icons.check_circle_outline,
                                        color: Colors.white,
                                        size: 14,
                                      ),
                                      const SizedBox(width: 6),
                                      Text(
                                        hasArrears ? 'YÊU CẦU THANH TOÁN' : 'TÀI KHOẢN AN TOÀN',
                                        style: AppTypography.caption.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 0.8,
                                          fontSize: 10,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
  
                    const SizedBox(height: AppSpacing.md),
  
                    // ── Arrears Impact Warning Box ────────────────────────
                    if (hasArrears) ...[
                      GlassContainer(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        borderRadius: BorderRadius.circular(AppRadius.lg),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.lock_outline_rounded, color: AppColors.error, size: 20),
                            const SizedBox(width: AppSpacing.md),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Dịch vụ bị hạn chế',
                                    style: AppTypography.bodyMd.copyWith(
                                      fontWeight: FontWeight.w700,
                                      color: isDark ? Colors.white : AppColors.black,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Tài khoản của bạn tạm thời bị khóa đặt lịch và sạc pin. Vui lòng thanh toán số nợ tồn đọng để kích hoạt lại toàn bộ tính năng.',
                                    style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                    ],
  
                    // ── Itemized Debt Breakdown List ──────────────────────
                    if (hasArrears) ...[
                      Text('Chi tiết khoản nợ', style: AppTypography.headingMd),
                      const SizedBox(height: AppSpacing.sm),
                      _buildDetailPill(
                        icon: Icons.receipt_outlined,
                        label: 'Mã giao dịch',
                        value: '#EV21173AR',
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      _buildDetailPill(
                        icon: Icons.electric_bolt_outlined,
                        label: 'Dịch vụ',
                        value: 'Sạc quá hạn / Phạt quá giờ',
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      _buildDetailPill(
                        icon: Icons.calendar_today_outlined,
                        label: 'Thời hạn thanh toán',
                        value: 'Ngay lập tức',
                        valueColor: AppColors.error,
                      ),
                      const SizedBox(height: AppSpacing.sm),
                      _buildDetailPill(
                        icon: Icons.monetization_on_outlined,
                        label: 'Số tiền nợ gốc',
                        value: VndFormatter.format(arrearsAmount),
                        valueColor: AppColors.error,
                        isBold: true,
                      ),
                      const SizedBox(height: AppSpacing.md),
                    ],
  
                    // ── Wallet Balance Status Tile ────────────────────────
                    Text('Phương thức thanh toán', style: AppTypography.headingMd),
                    const SizedBox(height: AppSpacing.sm),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.pillBgDark : AppColors.pillBgLight,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: isDark ? AppColors.pillBorderDark : AppColors.pillBorderLight),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: isDark ? 0.15 : 0.02),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.15),
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: AppColors.primary.withValues(alpha: 0.1),
                                  blurRadius: 12,
                                ),
                              ],
                            ),
                            child: const Icon(Icons.account_balance_wallet_outlined, color: AppColors.primary, size: 22),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Ví điện tử EVolt',
                                  style: AppTypography.bodyMd.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: isDark ? Colors.white : AppColors.black,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Số dư khả dụng: ${VndFormatter.format(balance)}',
                                  style: AppTypography.caption.copyWith(
                                    color: canPayDirect ? AppColors.primary : AppColors.error,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
  
                    const SizedBox(height: AppSpacing.md),
  
                    // ── Arrears Action Payment Area ───────────────────────
                    if (hasArrears) ...[
                      if (canPayDirect) ...[
                        EVButton(
                          label: 'Thanh toán nợ ngay bằng ví',
                          variant: EVButtonVariant.primary,
                          onPressed: () => _confirmPayment(context, arrearsAmount),
                        ),
                        const SizedBox(height: AppSpacing.md),
                      ] else ...[
                        // Inform insufficient balance and prompt quick VNPay top-up
                        Container(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          width: double.infinity,
                          decoration: BoxDecoration(
                            color: AppColors.error.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.error.withValues(alpha: 0.2)),
                          ),
                          child: Text(
                            'Số dư ví không đủ để thanh toán nợ. Vui lòng nạp thêm tiền thông qua cổng VNPay dưới đây.',
                            style: AppTypography.bodyMd.copyWith(color: AppColors.error, fontWeight: FontWeight.w600),
                            textAlign: TextAlign.center,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
  
                        // Quick Top-up buttons
                        Text('Nạp tiền nhanh để trả nợ', style: AppTypography.headingMd),
                        const SizedBox(height: AppSpacing.sm),
                        Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: [50000, 100000, 200000, 500000]
                              .map((amt) => GestureDetector(
                                    onTap: () => context.read<WalletBloc>().add(WalletTopUpInitiate(amount: amt.toDouble())),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                      decoration: BoxDecoration(
                                        color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.white,
                                        borderRadius: BorderRadius.circular(16),
                                        border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
                                        boxShadow: [
                                          if (!isDark)
                                            BoxShadow(
                                              color: AppColors.primary.withValues(alpha: 0.05),
                                              blurRadius: 8,
                                              offset: const Offset(0, 4),
                                            ),
                                        ],
                                      ),
                                      child: Text(
                                        '+${VndFormatter.compact(amt.toDouble())}',
                                        style: AppTypography.labelMd.copyWith(
                                          color: AppColors.primary,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                  ))
                              .toList(),
                        ),
                        const SizedBox(height: AppSpacing.md),
                      ],
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildDetailPill({
    required IconData icon,
    required String label,
    required String value,
    Color? valueColor,
    bool isBold = false,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final Color bg = isDark ? AppColors.pillBgDark : AppColors.pillBgLight;
    final Color border = isDark ? AppColors.pillBorderDark : AppColors.pillBorderLight;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.15 : 0.02),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.textMuted, size: 20),
          const SizedBox(width: 12),
          Text(
            label,
            style: AppTypography.bodyMd.copyWith(
              color: AppColors.textMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
          const Spacer(),
          Text(
            value,
            style: AppTypography.bodyMd.copyWith(
              fontWeight: isBold ? FontWeight.w800 : FontWeight.w600,
              color: valueColor ?? (isDark ? Colors.white : AppColors.black),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmPayment(BuildContext context, double amount) {
    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('Xác nhận thanh toán?'),
        content: Text('Bạn có chắc muốn thanh toán ${VndFormatter.format(amount)} nợ tồn đọng bằng số dư ví?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx),
            child: const Text('Huỷ'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(dialogCtx);
              context.read<WalletBloc>().add(const WalletPayArrears());
            },
            child: const Text('Thanh toán', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
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
