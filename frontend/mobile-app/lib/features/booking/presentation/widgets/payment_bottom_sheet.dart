import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/booking_entity.dart';
import '../bloc/booking_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../wallet/presentation/bloc/wallet_bloc.dart';
import '../../../wallet/domain/entities/wallet_entity.dart';

class PaymentBottomSheet extends StatefulWidget {
  final BookingEntity booking;

  const PaymentBottomSheet({super.key, required this.booking});

  static Future<void> show(BuildContext context, {required BookingEntity booking}) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => MultiBlocProvider(
        providers: [
          BlocProvider.value(value: context.read<BookingBloc>()),
          BlocProvider.value(value: context.read<WalletBloc>()),
        ],
        child: PaymentBottomSheet(booking: booking),
      ),
    );
  }

  @override
  State<PaymentBottomSheet> createState() => _PaymentBottomSheetState();
}

class _PaymentBottomSheetState extends State<PaymentBottomSheet> {
  String _selectedMethod = 'wallet';

  @override
  void initState() {
    super.initState();
    // Load wallet balance when sheet opens
    context.read<WalletBloc>().add(const WalletLoad());
  }

  void _onPay() {
    context.read<BookingBloc>().add(BookingPay(
          bookingId: widget.booking.id,
          amount: widget.booking.depositAmount,
          method: _selectedMethod,
        ));
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final depositAmount = widget.booking.depositAmount;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 20,
            offset: const Offset(0, -5),
          )
        ],
      ),
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 16,
        bottom: MediaQuery.of(context).padding.bottom + 24,
      ),
      child: BlocBuilder<WalletBloc, WalletState>(
        builder: (context, walletState) {
          final WalletEntity? wallet =
              walletState is WalletLoaded ? walletState.wallet : null;
          final bool loadingWallet = walletState is WalletLoading;
          final double balance = wallet?.balance ?? 0;
          final bool insufficientBalance =
              _selectedMethod == 'wallet' && balance < depositAmount;

          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Handle bar
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Title
              Text(
                'Thanh toán Đặt lịch',
                style: AppTypography.headingMd,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                'Vui lòng thanh toán cọc để xác nhận lịch sạc.',
                style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),

              // Deposit amount card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Số tiền cọc', style: AppTypography.bodyLg),
                    Text(
                      VndFormatter.format(depositAmount),
                      style: AppTypography.headingLg.copyWith(color: AppColors.primary),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Text(
                'Phương thức thanh toán',
                style: AppTypography.labelMd.copyWith(
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 12),

              // Wallet method
              _buildMethodTile(
                id: 'wallet',
                title: 'Ví EVolt (Ưu tiên)',
                subtitle: loadingWallet
                    ? 'Đang tải số dư...'
                    : 'Số dư: ${VndFormatter.format(balance)}',
                icon: Icons.account_balance_wallet_rounded,
                iconColor: insufficientBalance ? AppColors.error : AppColors.primary,
                badge: insufficientBalance
                    ? 'Không đủ số dư'
                    : null,
              ),
              const SizedBox(height: 12),

              // Gateway method
              _buildMethodTile(
                id: 'gateway',
                title: 'Thẻ tín dụng / VNPay',
                subtitle: 'Thanh toán qua cổng VNPay',
                icon: Icons.credit_card_rounded,
                iconColor: AppColors.warning,
              ),

              // Insufficient balance warning
              if (insufficientBalance) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.error.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                  ),
                  child: Row(children: [
                    const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Số dư ví không đủ. Vui lòng nạp thêm hoặc chọn VNPay.',
                        style: AppTypography.caption.copyWith(color: AppColors.error),
                      ),
                    ),
                  ]),
                ),
              ],

              const SizedBox(height: 32),
              BlocBuilder<BookingBloc, BookingState>(
                builder: (context, bookingState) {
                  final isLoading = bookingState is BookingLoading;
                  return EVButton(
                    label: isLoading ? 'Đang xử lý...' : 'Xác nhận thanh toán',
                    isLoading: isLoading,
                    onPressed: (insufficientBalance || isLoading) ? null : _onPay,
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildMethodTile({
    required String id,
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    String? badge,
  }) {
    final isSelected = _selectedMethod == id;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return GestureDetector(
      onTap: () => setState(() => _selectedMethod = id),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.1)
              : (isDark ? Colors.grey[800] : Colors.grey[50]),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppColors.primary : Colors.transparent,
            width: 2,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isDark ? Colors.black26 : Colors.white,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Text(
                      title,
                      style: AppTypography.labelMd.copyWith(fontWeight: FontWeight.w600),
                    ),
                    if (badge != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.error.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          badge,
                          style: AppTypography.overline.copyWith(color: AppColors.error),
                        ),
                      ),
                    ],
                  ]),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
            if (isSelected)
              const Icon(Icons.check_circle_rounded, color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}
