import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/auth_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_theme.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';

/// Email Verification Code Screen
/// Displayed immediately post user registration to trigger token checks
/// APIs: GET /auth/verify-email?token=... | POST /auth/resend-verification
class EmailVerificationScreen extends StatefulWidget {
  final String email;
  const EmailVerificationScreen({super.key, required this.email});

  @override
  State<EmailVerificationScreen> createState() =>
      _EmailVerificationScreenState();
}

class _EmailVerificationScreenState extends State<EmailVerificationScreen>
    with SingleTickerProviderStateMixin {
  final _tokenController = TextEditingController();
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  bool _resendCooldown = false;
  int _cooldownSeconds = 0;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.95, end: 1.05).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _tokenController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  void _verify() {
    final token = _tokenController.text.trim();
    if (token.isNotEmpty) {
      context.read<AuthBloc>().add(AuthVerifyMagicLinkRequested(token: token));
    }
  }

  void _resend() {
    if (_resendCooldown) return;
    context
        .read<AuthBloc>()
        .add(AuthResendVerificationRequested(email: widget.email));
    _startCooldown();
  }

  void _startCooldown() {
    setState(() {
      _resendCooldown = true;
      _cooldownSeconds = 60;
    });
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return false;
      setState(() => _cooldownSeconds--);
      if (_cooldownSeconds <= 0) {
        setState(() => _resendCooldown = false);
        return false;
      }
      return true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthAuthenticated) {
            context.go('/map');
          } else if (state is AuthEmailVerified) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Row(children: [
                  const Icon(Icons.check_circle, color: Colors.white, size: 18),
                  const SizedBox(width: 8),
                  const Text('Email đã được xác thực thành công!'),
                ]),
                backgroundColor: AppColors.success,
                duration: const Duration(seconds: 2),
              ),
            );
            Future.delayed(const Duration(seconds: 1), () {
              if (mounted) context.go('/auth/login');
            });
          }
          else if (state is AuthEmailVerificationRequired) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Đã gửi lại email xác thực!'),
                backgroundColor: AppColors.secondary,
              ),
            );
          } else if (state is AuthError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: AppColors.error,
              ),
            );
          }
        },
        builder: (context, state) {
          final isLoading = state is AuthLoading;
          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const SizedBox(height: AppSpacing.xxxl),

                  // Icon animation
                  ScaleTransition(
                    scale: _pulseAnimation,
                    child: Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            AppColors.primary.withOpacity(0.15),
                            AppColors.secondary.withOpacity(0.15),
                          ],
                        ),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppColors.primary.withOpacity(0.3),
                          width: 2,
                        ),
                      ),
                      child: const Icon(
                        Icons.mark_email_unread_outlined,
                        color: AppColors.primary,
                        size: 48,
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),

                  // Title
                  Text(
                    'Xác thực Email',
                    style: AppTypography.displayMd.copyWith(
                      color: Theme.of(context).colorScheme.onSurface,
                      fontWeight: FontWeight.w700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.sm),

                  // Subtitle
                  RichText(
                    textAlign: TextAlign.center,
                    text: TextSpan(
                      style: AppTypography.bodyMd.copyWith(
                        color: AppColors.grey600,
                        height: 1.5,
                      ),
                      children: [
                        const TextSpan(text: 'Chúng tôi đã gửi link xác thực đến\n'),
                        TextSpan(
                          text: widget.email,
                          style: AppTypography.bodyMd.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xxxl),

                  // Token input
                  Container(
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(AppRadius.lg),
                      border: Border.all(
                        color: AppColors.outlineLight,
                      ),
                    ),
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Dán token từ email vào đây',
                          style: AppTypography.labelMd.copyWith(
                            color: AppColors.grey600,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        TextFormField(
                          controller: _tokenController,
                          maxLines: 3,
                          style: AppTypography.bodyMd.copyWith(
                            fontFamily: 'monospace',
                            fontSize: 12,
                          ),
                          decoration: InputDecoration(
                            hintText: 'eyJ0b2tlbi...',
                            hintStyle: AppTypography.bodyMd.copyWith(
                              color: AppColors.grey600.withOpacity(0.5),
                              fontSize: 12,
                            ),
                            suffixIcon: IconButton(
                              icon: const Icon(Icons.content_paste_outlined, size: 20),
                              onPressed: () async {
                                final data = await Clipboard.getData('text/plain');
                                if (data?.text != null) {
                                  _tokenController.text = data!.text!.trim();
                                }
                              },
                              tooltip: 'Dán từ clipboard',
                            ),
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),

                  // Verify button
                  EVButton(
                    label: 'Xác thực Email',
                    onPressed: _tokenController.text.trim().isNotEmpty
                        ? _verify
                        : null,
                    isLoading: isLoading,
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  // Resend button
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Không nhận được email? ',
                        style: AppTypography.bodyMd.copyWith(
                          color: AppColors.grey600,
                        ),
                      ),
                      TextButton(
                        onPressed: _resendCooldown ? null : _resend,
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: Text(
                          _resendCooldown
                              ? 'Gửi lại ($_cooldownSeconds s)'
                              : 'Gửi lại',
                          style: AppTypography.bodyMd.copyWith(
                            color: _resendCooldown
                                ? AppColors.grey600
                                : AppColors.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  // Back to login
                  TextButton.icon(
                    onPressed: () => context.go('/auth/login'),
                    icon: const Icon(Icons.arrow_back_ios, size: 14),
                    label: const Text('Quay lại đăng nhập'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.grey600,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
