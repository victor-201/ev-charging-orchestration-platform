import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/auth_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../widgets/auth_layout.dart';

class VerifyEmailPendingScreen extends StatefulWidget {
  final String email;

  const VerifyEmailPendingScreen({super.key, required this.email});

  @override
  State<VerifyEmailPendingScreen> createState() => _VerifyEmailPendingScreenState();
}

class _VerifyEmailPendingScreenState extends State<VerifyEmailPendingScreen> {
  final _codeController = TextEditingController();
  Timer? _timer;
  int _countdown = 60;
  bool _canResend = false;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  void _startCountdown() {
    setState(() {
      _countdown = 60;
      _canResend = false;
    });
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_countdown > 0) {
        setState(() => _countdown--);
      } else {
        setState(() => _canResend = true);
        timer.cancel();
      }
    });
  }

  @override
  void dispose() {
    _codeController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  void _submit() {
    final code = _codeController.text.trim();
    if (code.length == 6) {
      context.read<AuthBloc>().add(AuthVerifyEmailCodeRequested(code: code));
    } else {
      EVToast.show(context, message: 'Vui lòng nhập đủ 6 chữ số', isError: true);
    }
  }

  void _resend() {
    context.read<AuthBloc>().add(AuthResendVerificationRequested(email: widget.email));
    _startCountdown();
    EVToast.show(context, message: 'Đã gửi lại email xác nhận!', isError: false);
  }

  @override
  Widget build(BuildContext context) {
    return AuthLayout(
      onBackPressed: () => context.go('/auth/register'),
      child: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthAuthenticated) {
            context.go('/map');
          } else if (state is AuthEmailVerified) {
            // Need to login again since we don't have tokens for manual verification flow?
            // Actually _onVerifyEmailCode dispatches AuthCheckRequested on success, leading to AuthAuthenticated
          } else if (state is AuthError) {
            EVToast.show(context, message: state.message, isError: true);
          }
        },
        builder: (context, state) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
                  const SizedBox(height: AppSpacing.md),
                  const Icon(Icons.mark_email_unread_outlined, size: 56, color: AppColors.primary),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    'Kiểm tra email của bạn',
                    style: AppTypography.headingLg.copyWith(
                      fontWeight: FontWeight.w700,
                      fontSize: 22,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'Chúng tôi đã gửi mã xác nhận 6 số đến email:\n${widget.email}',
                    style: AppTypography.caption.copyWith(color: AppColors.grey600, height: 1.5),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  TextField(
                    controller: _codeController,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 24, letterSpacing: 8, fontWeight: FontWeight.bold),
                    decoration: const InputDecoration(
                      hintText: '000000',
                      counterText: '',
                    ),
                    onChanged: (v) {
                      if (v.length == 6) {
                        _submit();
                      }
                    },
                  ),
                  const SizedBox(height: 32),
                  EVButton(
                    label: 'Xác nhận',
                    onPressed: _submit,
                    isLoading: state is AuthLoading,
                  ),
                  const SizedBox(height: 24),
                  Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        'Chưa nhận được email? ',
                        style: AppTypography.bodyMd.copyWith(color: AppColors.grey600),
                      ),
                      TextButton(
                        onPressed: _canResend ? _resend : null,
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: Text(
                          _canResend ? 'Gửi lại' : 'Gửi lại sau ${_countdown}s',
                          style: AppTypography.bodyMd.copyWith(
                            color: _canResend ? AppColors.primary : AppColors.grey400,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  TextButton(
                    onPressed: () {
                      context.read<AuthBloc>().add(const AuthLogoutRequested());
                      context.go('/auth/login');
                    },
                    child: Text(
                      'Quay lại đăng nhập',
                      style: AppTypography.bodyMd.copyWith(color: AppColors.primary),
                    ),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
