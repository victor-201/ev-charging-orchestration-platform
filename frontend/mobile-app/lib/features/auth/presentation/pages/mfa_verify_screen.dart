import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/auth_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_theme.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';

/// High-Fidelity 6-Digit MFA Verification Screen
/// Integrated 6-box OTP verification fields with auto-focus shifting
/// APIs: [13] POST /auth/mfa/verify
class MFAVerifyScreen extends StatefulWidget {
  const MFAVerifyScreen({super.key});

  @override
  State<MFAVerifyScreen> createState() => _MFAVerifyScreenState();
}

class _MFAVerifyScreenState extends State<MFAVerifyScreen> {
  final List<TextEditingController> _controllers =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focusNodes =
      List.generate(6, (_) => FocusNode());

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  String get _otpCode =>
      _controllers.map((c) => c.text).join();

  void _submit() {
    final code = _otpCode;
    if (code.length == 6) {
      context.read<AuthBloc>().add(AuthMfaVerifyRequested(otpCode: code));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Xác thực hai bước'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios),
          onPressed: () => context.go('/auth/login'),
        ),
      ),
      body: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthAuthenticated) {
            context.go('/map');
          } else if (state is AuthError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: AppColors.error,
              ),
            );
            // Discard OTP input buffers on failure
            for (final c in _controllers) {
              c.clear();
            }
            _focusNodes[0].requestFocus();
          }
        },
        builder: (context, state) {
          return Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(height: AppSpacing.xxxl),
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: AppColors.secondary.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.security_outlined,
                    color: AppColors.secondary,
                    size: 36,
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                Text(
                  'Nhập mã xác thực',
                  style: AppTypography.headingLg.copyWith(
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Nhập mã 6 chữ số từ ứng dụng xác thực của bạn.',
                  style: AppTypography.bodyMd.copyWith(
                    color: AppColors.grey600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.xxxl),

                // Render 6 adjacent OTP fields
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: List.generate(6, (index) => _buildOtpBox(index)),
                ),
                const SizedBox(height: AppSpacing.xxxl),

                EVButton(
                  label: 'Xác nhận',
                  onPressed: _otpCode.length == 6 ? _submit : null,
                  isLoading: state is AuthLoading,
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildOtpBox(int index) {
    return SizedBox(
      width: 48,
      height: 58,
      child: TextFormField(
        controller: _controllers[index],
        focusNode: _focusNodes[index],
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        maxLength: 1,
        style: AppTypography.headingLg.copyWith(
          fontWeight: FontWeight.w700,
        ),
        decoration: InputDecoration(
          counterText: '',
          contentPadding: EdgeInsets.zero,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
            borderSide: const BorderSide(color: AppColors.outlineLight),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
            borderSide:
                const BorderSide(color: AppColors.primary, width: 2),
          ),
        ),
        onChanged: (value) {
          if (value.isNotEmpty && index < 5) {
            _focusNodes[index + 1].requestFocus();
          } else if (value.isEmpty && index > 0) {
            _focusNodes[index - 1].requestFocus();
          }
          if (_otpCode.length == 6) {
            _submit();
          }
          setState(() {});
        },
      ),
    );
  }
}
