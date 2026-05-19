import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';
import '../bloc/wallet_bloc.dart';
import '../../domain/entities/wallet_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_theme.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/alert_banner.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;

/// Wallet Dashboard Screen
///
/// Displays the customer's active wallet balance, aggregates chronological transaction
/// logs, issues arrears warnings, and initiates payment gateway workflows.
class WalletDashboardScreen extends StatefulWidget {
  const WalletDashboardScreen({super.key});

  @override
  State<WalletDashboardScreen> createState() =>
      _WalletDashboardScreenState();
}

class _WalletDashboardScreenState extends State<WalletDashboardScreen> {
  @override
  void initState() {
    super.initState();
    context.read<WalletBloc>().add(const WalletLoad());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Ví điện tử'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_outlined),
            onPressed: () =>
                context.read<WalletBloc>().add(const WalletLoad()),
          ),
        ],
      ),
      body: BlocConsumer<WalletBloc, WalletState>(
        listener: (context, state) {
          if (state is WalletTopUpInitiated) {
            _openVNPayUrl(state.vnpayUrl, state.transactionId, context);
          } else if (state is WalletError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: AppColors.error,
              ),
            );
          }
        },
        builder: (context, state) {
          if (state is WalletLoading) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: ShimmerLoader(width: double.infinity, height: 200),
              ),
            );
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
    return RefreshIndicator(
      onRefresh: () async =>
          context.read<WalletBloc>().add(const WalletLoad()),
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          Container(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.xl,
              MediaQuery.of(context).padding.top + AppSpacing.xl,
              AppSpacing.xl,
              AppSpacing.xxxl,
            ),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppColors.primary,
                  AppColors.primary.withValues(alpha: 0.8),
                ],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Số dư khả dụng',
                  style: AppTypography.bodyMd.copyWith(
                    color: Colors.white.withValues(alpha: 0.8),
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
                const SizedBox(height: AppSpacing.xl),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () =>
                            _showTopUpDialog(context),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: AppColors.primary,
                          padding: const EdgeInsets.symmetric(
                              vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius:
                                BorderRadius.circular(AppRadius.md),
                          ),
                        ),
                        icon: const Icon(Icons.add, size: 20),
                        label: const Text('Nạp tiền'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          if (state.wallet.hasArrears)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                children: [
                  ArrearsAlertBanner(
                    amount: 'Nợ tồn đọng: ${VndFormatter.format(state.wallet.arrearsAmount ?? 0)}',
                    onTap: null,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  EVButton(
                    label:
                        'Thanh toán nợ (${VndFormatter.format(state.wallet.arrearsAmount ?? 0)})',
                    variant: EVButtonVariant.danger,
                    onPressed: () => context
                        .read<WalletBloc>()
                        .add(const WalletPayArrears()),
                  ),
                ],
              ),
            ),

          Padding(
            padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, 0),
            child: Text(
              'Lịch sử giao dịch',
              style: AppTypography.headingMd,
            ),
          ),

          if (state.transactions.isEmpty)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.xxxl),
              child: Column(
                children: [
                  const Icon(Icons.receipt_long_outlined,
                      size: 64, color: AppColors.grey400),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'Chưa có giao dịch nào',
                    style: AppTypography.bodyMd.copyWith(
                      color: AppColors.grey600,
                    ),
                  ),
                ],
              ),
            )
          else
            ...state.transactions
                .map((tx) => _buildTransactionTile(context, tx)),
        ],
      ),
    );
  }

  Widget _buildTransactionTile(
      BuildContext context, TransactionEntity tx) {
    final isCredit = tx.isCredit;
    final color = isCredit ? AppColors.chargerAvailable : AppColors.error;
    final sign = isCredit ? '+' : '-';

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.xs,
      ),
      leading: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          shape: BoxShape.circle,
        ),
        child: Icon(
          isCredit
              ? Icons.arrow_downward_outlined
              : Icons.arrow_upward_outlined,
          color: color,
          size: 22,
        ),
      ),
      title: Text(
        tx.description ?? _translateType(tx.type),
        style: AppTypography.bodyMd.copyWith(
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Text(
        ev_date.DateUtils.formatDateTime(tx.createdAt),
        style: AppTypography.caption.copyWith(
          color: AppColors.grey600,
        ),
      ),
      trailing: Text(
        '$sign${VndFormatter.format(tx.amount)}',
        style: AppTypography.bodyMd.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  void _showTopUpDialog(BuildContext context) {
    double amount = 100000;
    showDialog(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Nạp tiền vào ví'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
                'Chọn số tiền nạp (thanh toán qua VNPay):'),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              children: [
                50000,
                100000,
                200000,
                500000,
                1000000
              ].map((amt) => ActionChip(
                    label:
                        Text(VndFormatter.format(amt.toDouble())),
                    onPressed: () {
                      amount = amt.toDouble();
                      Navigator.pop(dialogContext);
                      context
                          .read<WalletBloc>()
                          .add(WalletTopUpInitiate(amount: amount));
                    },
                  )).toList(),
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

  Future<void> _openVNPayUrl(
      String url, String txnRef, BuildContext context) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  String _translateType(String type) {
    switch (type) {
      case 'TOPUP':
        return 'Nạp tiền';
      case 'PAYMENT':
        return 'Thanh toán';
      case 'REFUND':
        return 'Hoàn tiền';
      case 'PENALTY':
        return 'Phạt';
      default:
        return type;
    }
  }
}
