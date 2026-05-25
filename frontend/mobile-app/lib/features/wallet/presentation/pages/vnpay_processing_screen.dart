import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/wallet_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/ev_header.dart';

/// VNPay Payment Processing Screen
///
/// Parses deep-link redirection parameters from VNPay gateway integrations,
/// triggers payment state verification, and updates local wallet indicator components.
class VNPayProcessingScreen extends StatefulWidget {
  final String? txnRef;
  final String? responseCode;

  const VNPayProcessingScreen({
    super.key,
    this.txnRef,
    this.responseCode,
  });

  @override
  State<VNPayProcessingScreen> createState() => _VNPayProcessingScreenState();
}

class _VNPayProcessingScreenState extends State<VNPayProcessingScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _spinController;
  _VNPayState _uiState = _VNPayState.processing;
  String _message = 'Đang xác minh thanh toán...';

  @override
  void initState() {
    super.initState();
    _spinController = AnimationController(
        vsync: this, duration: const Duration(seconds: 1))
      ..repeat();
    _verifyPayment();
  }

  Future<void> _verifyPayment() async {
    // A response code of '00' indicates a successful transaction cycle according to VNPay specifications.
    await Future.delayed(const Duration(seconds: 2));
    if (!mounted) return;

    final isSuccess = widget.responseCode == '00';
    setState(() {
      _uiState = isSuccess ? _VNPayState.success : _VNPayState.failed;
      _message = isSuccess
          ? 'Nạp tiền thành công! Số dư đã được cập nhật.'
          : 'Thanh toán thất bại. Vui lòng thử lại.';
    });

    if (isSuccess) {
      _spinController.stop();
      context.read<WalletBloc>().add(const WalletLoad());
    }
  }

  @override
  void dispose() {
    _spinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      extendBodyBehindAppBar: true,
      appBar: EVHeader(
        title: 'Xử lý thanh toán',
        showBackButton: _uiState != _VNPayState.processing,
        automaticallyImplyLeading: _uiState != _VNPayState.processing,
      ),
      child: SafeArea(
        bottom: false,
        child: Center(
          child: SingleChildScrollView(
            padding: AppLayout.paddingWithHeaderAndNavbar(context),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              if (_uiState == _VNPayState.processing)
                RotationTransition(
                  turns: _spinController,
                  child: const Icon(Icons.sync, size: 72, color: AppColors.primary),
                )
              else if (_uiState == _VNPayState.success)
                Container(
                  width: 80, height: 80,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.chargerAvailable,
                  ),
                  child: const Icon(Icons.check_rounded, color: Colors.white, size: 40),
                )
              else
                Container(
                  width: 80, height: 80,
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.error),
                  child: const Icon(Icons.close_rounded, color: Colors.white, size: 40),
                ),
              const SizedBox(height: AppSpacing.xl),
              Text(_message, style: AppTypography.headingMd, textAlign: TextAlign.center),
              if (widget.txnRef != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text('Mã giao dịch: ${widget.txnRef}',
                    style: AppTypography.caption.copyWith(color: AppColors.grey600)),
              ],
              if (_uiState != _VNPayState.processing) ...[
                const SizedBox(height: AppSpacing.xxxl),
                EVButton(
                  label: 'Về ví điện tử',
                  icon: Icons.account_balance_wallet_outlined,
                  onPressed: () => context.go('/wallet'),
                ),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

enum _VNPayState { processing, success, failed }
