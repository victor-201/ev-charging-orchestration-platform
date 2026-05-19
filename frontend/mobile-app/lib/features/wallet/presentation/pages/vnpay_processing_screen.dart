import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/wallet_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_theme.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';

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
    return Scaffold(
      appBar: AppBar(
        title: const Text('Xử lý thanh toán'),
        automaticallyImplyLeading: _uiState != _VNPayState.processing,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
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
    );
  }
}

enum _VNPayState { processing, success, failed }
