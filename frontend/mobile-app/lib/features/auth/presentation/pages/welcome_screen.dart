import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../bloc/auth_bloc.dart';
import '../widgets/auth_layout.dart';

/// Application Welcome Portal Screen
class WelcomeScreen extends StatelessWidget {
  final String? redirectUrl;
  const WelcomeScreen({super.key, this.redirectUrl});

  @override
  Widget build(BuildContext context) {
    return AuthLayout(
      showBackButton: true,
      onBackFallback: () => context.go('/map'),
      child: BlocBuilder<AuthBloc, AuthState>(
        builder: (context, state) {
          final isAuthenticated = state is AuthAuthenticated;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Khám phá trải nghiệm sạc xe điện\nmượt mà, tiện lợi và nhanh chóng.',
                style: AppTypography.bodyLg.copyWith(
                  color: AppColors.textMuted,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),

              // Feature chips
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  _FeatureChip(icon: Icons.bolt_rounded, label: 'Sạc siêu tốc'),
                  _FeatureChip(icon: Icons.map_outlined, label: 'Tìm trạm 24/7'),
                  _FeatureChip(icon: Icons.touch_app_rounded, label: 'Thanh toán 1 chạm'),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),

              // CTA Buttons
              if (isAuthenticated) ...[
                EVButton(
                  label: 'Khám phá bản đồ',
                  onPressed: () => context.go('/map'),
                  icon: Icons.explore_rounded,
                ),
                const SizedBox(height: AppSpacing.md),
                EVButton(
                  label: 'Đăng xuất',
                  onPressed: () {
                    context.read<AuthBloc>().add(const AuthLogoutRequested());
                  },
                  variant: EVButtonVariant.outlined,
                ),
              ] else ...[
                EVButton(
                  label: 'Đăng nhập',
                  onPressed: () {
                    final path = redirectUrl != null && redirectUrl!.isNotEmpty
                        ? '/auth/login?redirect=${Uri.encodeComponent(redirectUrl!)}'
                        : '/auth/login';
                    context.push(path);
                  },
                  icon: Icons.login_rounded,
                ),
                const SizedBox(height: AppSpacing.md),
                EVButton(
                  label: 'Tạo tài khoản',
                  onPressed: () {
                    final path = redirectUrl != null && redirectUrl!.isNotEmpty
                        ? '/auth/register?redirect=${Uri.encodeComponent(redirectUrl!)}'
                        : '/auth/register';
                    context.push(path);
                  },
                  variant: EVButtonVariant.outlined,
                ),
                const SizedBox(height: AppSpacing.md),
                Center(
                  child: TextButton(
                    onPressed: () => context.go('/map'),
                    child: Text(
                      'Khám phá bản đồ →',
                      style: AppTypography.bodyMd.copyWith(
                        color: AppColors.cyan,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _FeatureChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _FeatureChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: AppColors.cyan.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(
          color: AppColors.cyan.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: AppColors.cyan, size: 14),
          const SizedBox(width: AppSpacing.xs),
          Text(
            label,
            style: AppTypography.labelSm.copyWith(
              color: isDark ? AppColors.textLight : AppColors.textDark,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
