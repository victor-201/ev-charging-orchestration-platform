import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import '../bloc/auth_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../widgets/auth_layout.dart';

/// User Identity Portal Login Screen
/// APIs: [02] POST /auth/login
class LoginScreen extends StatefulWidget {
  final String? redirectUrl;

  const LoginScreen({super.key, this.redirectUrl});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _isSubmitting =
      false; // true only when the user explicitly clicked login
  bool _rememberMe = false;

  @override
  void initState() {
    super.initState();
    _loadSavedCredentials();
  }

  void _loadSavedCredentials() {
    final savedEmail = HydratedBloc.storage.read('remembered_email') as String?;
    final savedPassword =
        HydratedBloc.storage.read('remembered_password') as String?;
    if (savedEmail != null && savedEmail.isNotEmpty) {
      _emailController.text = savedEmail;
    }
    if (savedPassword != null && savedPassword.isNotEmpty) {
      _passwordController.text = savedPassword;
    }
    if ((savedEmail != null && savedEmail.isNotEmpty) ||
        (savedPassword != null && savedPassword.isNotEmpty)) {
      setState(() {
        _rememberMe = true;
      });
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() ?? false) {
      setState(() => _isSubmitting = true);
      context.read<AuthBloc>().add(
        AuthLoginRequested(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return AuthLayout(
      onBackPressed: () => context.go('/welcome'),
      child: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is! AuthLoading) {
            // Reset submit flag whenever bloc finishes processing
            if (_isSubmitting) setState(() => _isSubmitting = false);
          }
          if (state is AuthAuthenticated) {
            // Save or delete remembered credentials
            if (_rememberMe) {
              HydratedBloc.storage.write(
                'remembered_email',
                _emailController.text.trim(),
              );
              HydratedBloc.storage.write(
                'remembered_password',
                _passwordController.text,
              );
            } else {
              HydratedBloc.storage.delete('remembered_email');
              HydratedBloc.storage.delete('remembered_password');
            }

            final savedRoute =
                HydratedBloc.storage.read('last_visited_route') as String?;
            if (widget.redirectUrl != null && widget.redirectUrl!.isNotEmpty) {
              context.go(widget.redirectUrl!);
            } else if (savedRoute != null && savedRoute.isNotEmpty) {
              context.go(savedRoute);
            } else {
              context.go('/map');
            }
          } else if (state is AuthMfaRequired) {
            context.go('/auth/mfa');
          } else if (state is AuthEmailVerificationRequired) {
            context.go(
              '/auth/verify-email?email=${Uri.encodeComponent(state.email)}',
            );
          }
        },
        builder: (context, state) {
          return Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Đăng nhập',
                  style: AppTypography.displayMd.copyWith(
                    color: Theme.of(context).colorScheme.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Chào mừng trở lại! Đăng nhập để tiếp tục hành trình.',
                  style: AppTypography.bodyMd.copyWith(
                    color: AppColors.textMuted,
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                // Error banners
                if (state is AuthError && state.lockedUntil != null)
                  _buildLockoutBanner(state),
                if (state is AuthError && state.lockedUntil == null)
                  _buildErrorBanner(state.message),

                // Email field
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  style: AppTypography.bodyMd.copyWith(
                    color: isDark ? AppColors.textLight : AppColors.textDark,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    hintText: 'example@email.com',
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Vui lòng nhập email';
                    final emailRegex = RegExp(
                      r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$',
                    );
                    if (!emailRegex.hasMatch(v.trim())) {
                      return 'Email không hợp lệ';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.md),

                // Password field
                TextFormField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  style: AppTypography.bodyMd.copyWith(
                    color: isDark ? AppColors.textLight : AppColors.textDark,
                  ),
                  decoration: InputDecoration(
                    labelText: 'Mật khẩu',
                    prefixIcon: const Icon(Icons.lock_outlined),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                      onPressed: () =>
                          setState(() => _obscurePassword = !_obscurePassword),
                    ),
                  ),
                  validator: (v) {
                    if (v == null || v.isEmpty) return 'Vui lòng nhập mật khẩu';
                    if (v.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự';
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                // Remember Me and Forgot Password
                Row(
                  children: [
                    GestureDetector(
                      onTap: () {
                        setState(() {
                          _rememberMe = !_rememberMe;
                        });
                      },
                      behavior: HitTestBehavior.opaque,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            width: 18,
                            height: 18,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(5),
                              border: Border.all(
                                color: _rememberMe
                                    ? AppColors.cyan
                                    : (isDark
                                          ? AppColors.textMuted.withValues(
                                              alpha: 0.4,
                                            )
                                          : AppColors.textMuted.withValues(
                                              alpha: 0.6,
                                            )),
                                width: 1.5,
                              ),
                              color: _rememberMe
                                  ? AppColors.cyan.withValues(alpha: 0.15)
                                  : Colors.transparent,
                            ),
                            child: Center(
                              child: AnimatedScale(
                                scale: _rememberMe ? 1.0 : 0.0,
                                duration: const Duration(milliseconds: 150),
                                child: const Icon(
                                  Icons.check,
                                  size: 13,
                                  color: AppColors.cyan,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Text(
                            'Lưu mật khẩu',
                            style: AppTypography.caption.copyWith(
                              color: isDark
                                  ? AppColors.textLight
                                  : AppColors.textDark,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () => context.push('/auth/forgot-password'),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        'Quên mật khẩu?',
                        style: AppTypography.caption.copyWith(
                          color: AppColors.cyan,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xl),

                // Login button — isLoading only when user triggered submit
                EVButton(
                  label: 'Đăng nhập',
                  onPressed: _submit,
                  isLoading: _isSubmitting && state is AuthLoading,
                ),
                const SizedBox(height: AppSpacing.lg),

                // Register link
                Center(
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        'Chưa có tài khoản? ',
                        style: AppTypography.bodyMd.copyWith(
                          color: AppColors.textMuted,
                        ),
                      ),
                      TextButton(
                        onPressed: () => context.push('/auth/register'),
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: Text(
                          'Đăng ký ngay',
                          style: AppTypography.bodyMd.copyWith(
                            color: AppColors.cyan,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildLockoutBanner(AuthError state) {
    String message = state.message;
    if (state.lockedUntil != null) {
      message =
          'Tài khoản bị khóa đến ${ev_date.DateUtils.formatDateTime(state.lockedUntil!)}';
    }
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.lg),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.lock_outlined, color: AppColors.error, size: 18),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: AppTypography.bodyMd.copyWith(color: AppColors.error),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorBanner(String message) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.lg),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.error, size: 18),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: AppTypography.bodyMd.copyWith(color: AppColors.error),
            ),
          ),
        ],
      ),
    );
  }
}
