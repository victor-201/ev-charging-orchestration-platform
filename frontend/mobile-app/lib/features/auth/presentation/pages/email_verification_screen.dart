import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/auth_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../widgets/auth_layout.dart';

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
    return AuthLayout(
      onBackPressed: () => context.go('/auth/register'),
      child: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthAuthenticated) {
            context.go('/map');
          } else if (state is AuthEmailVerified) {
            EVToast.show(context, message: 'Email đã được xác thực thành công!', isError: false);
            final router = GoRouter.of(context);
            Future.delayed(const Duration(seconds: 1), () {
              if (mounted) router.go('/auth/login');
            });
          }
          else if (state is AuthEmailVerificationRequired) {
            EVToast.show(context, message: 'Đã gửi lại email xác thực!', isError: false);
          } else if (state is AuthError) {
            EVToast.show(context, message: state.message, isError: true);
          }
        },
        builder: (context, state) {
          final isLoading = state is AuthLoading;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Icon animation
                   ScaleTransition(
                    scale: _pulseAnimation,
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            AppColors.primary.withValues(alpha: 0.15),
                            AppColors.secondary.withValues(alpha: 0.15),
                          ],
                        ),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppColors.primary.withValues(alpha: 0.3),
                          width: 2,
                        ),
                      ),
                      child: const Icon(
                        Icons.mark_email_unread_outlined,
                        color: AppColors.primary,
                        size: 36,
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),

                  // Title
                  Text(
                    'Xác thực Email',
                    style: AppTypography.headingLg.copyWith(
                      color: Theme.of(context).colorScheme.onSurface,
                      fontWeight: FontWeight.w700,
                      fontSize: 22,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.xs),

                  // Subtitle
                  RichText(
                    textAlign: TextAlign.center,
                    text: TextSpan(
                      style: AppTypography.caption.copyWith(
                        color: AppColors.grey600,
                        height: 1.5,
                      ),
                      children: [
                        const TextSpan(text: 'Chúng tôi đã gửi link xác thực đến\n'),
                        TextSpan(
                          text: widget.email,
                          style: AppTypography.caption.copyWith(
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
                              color: AppColors.grey600.withValues(alpha: 0.5),
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
                  Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
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
            ],
          );
        },
      ),
    );
  }
}
