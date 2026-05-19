import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/auth_bloc.dart';
import '../bloc/auth_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';

class MagicLinkVerifyScreen extends StatefulWidget {
  final String token;

  const MagicLinkVerifyScreen({super.key, required this.token});

  @override
  State<MagicLinkVerifyScreen> createState() => _MagicLinkVerifyScreenState();
}

class _MagicLinkVerifyScreenState extends State<MagicLinkVerifyScreen> {
  @override
  void initState() {
    super.initState();
    // Automatically triggers token validation when view mounts
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AuthBloc>().add(AuthVerifyMagicLinkRequested(token: widget.token));
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthAuthenticated) {
            context.go('/map');
          }
        },
        builder: (context, state) {
          return SafeArea(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (state is AuthLoading || state is AuthInitial) ...[
                      const CircularProgressIndicator(),
                      const SizedBox(height: 24),
                      Text(
                        'Đang xác thực email của bạn...',
                        style: AppTypography.bodyLg,
                        textAlign: TextAlign.center,
                      ),
                    ] else if (state is AuthError) ...[
                      const Icon(Icons.error_outline, size: 80, color: AppColors.error),
                      const SizedBox(height: 24),
                      Text(
                        'Xác thực thất bại',
                        style: AppTypography.displayMd,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        state.message,
                        style: AppTypography.bodyLg.copyWith(color: AppColors.grey600),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 32),
                      EVButton(
                        label: 'Quay lại đăng nhập',
                        onPressed: () => context.go('/auth/login'),
                      ),
                    ] else if (state is AuthEmailVerified) ...[
                      const Icon(Icons.check_circle_outline, size: 80, color: AppColors.success),
                      const SizedBox(height: 24),
                      Text(
                        'Xác thực thành công!',
                        style: AppTypography.displayMd,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Tài khoản của bạn đã được xác thực.',
                        style: AppTypography.bodyLg.copyWith(color: AppColors.grey600),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 32),
                      EVButton(
                        label: 'Tiếp tục',
                        onPressed: () => context.go('/map'),
                      ),
                    ]
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
