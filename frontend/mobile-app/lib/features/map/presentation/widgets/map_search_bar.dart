import 'dart:ui' as dart_ui;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';

class MapSearchBar extends StatelessWidget {
  final TextEditingController searchController;
  final FocusNode searchFocusNode;
  final GlobalKey searchFieldKey;
  final bool isLoading;
  final ValueChanged<String> onChanged;
  final ValueChanged<String> onSubmitted;
  final VoidCallback onClear;

  const MapSearchBar({
    super.key,
    required this.searchController,
    required this.searchFocusNode,
    required this.searchFieldKey,
    required this.isLoading,
    required this.onChanged,
    required this.onSubmitted,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.full),
            child: BackdropFilter(
              filter: dart_ui.ImageFilter.blur(sigmaX: 16, sigmaY: 16),
              child: Container(
                key: const ValueKey('search_container'),
                height: 54,
                decoration: BoxDecoration(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xFF1E293B).withValues(alpha: 0.85)
                      : Colors.white.withValues(alpha: 0.8),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.15),
                      blurRadius: searchFocusNode.hasFocus ? 30 : 15,
                      offset: const Offset(0, 8),
                    ),
                  ],
                  border: Border.all(
                    color: searchFocusNode.hasFocus
                        ? AppColors.cyan.withValues(alpha: 0.6)
                        : (Theme.of(context).brightness == Brightness.dark
                            ? Colors.white.withValues(alpha: 0.12)
                            : Colors.white.withValues(alpha: 0.6)),
                    width: searchFocusNode.hasFocus ? 2.0 : 1.0,
                  ),
                ),
                child: Row(
                  children: [
                    const SizedBox(width: AppSpacing.lg),
                    isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary)),
                          )
                        : Icon(Icons.search_rounded,
                            color: searchFocusNode.hasFocus ? AppColors.cyan : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.9),
                            size: 22),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: TextField(
                        key: searchFieldKey,
                        controller: searchController,
                        focusNode: searchFocusNode,
                        decoration: InputDecoration(
                          hintText: 'Bạn muốn sạc ở đâu?',
                          hintStyle: AppTypography.bodyMd.copyWith(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.8)),
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          errorBorder: InputBorder.none,
                          disabledBorder: InputBorder.none,
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(vertical: 16),
                          filled: false,
                        ),
                        style: AppTypography.bodyMd.copyWith(fontWeight: FontWeight.w600, color: Theme.of(context).colorScheme.onSurface),
                        onChanged: onChanged,
                        onSubmitted: onSubmitted,
                      ),
                    ),
                    if (searchController.text.isNotEmpty)
                      IconButton(
                        icon: Icon(Icons.close_rounded, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.9), size: 20),
                        onPressed: onClear,
                      )
                    else
                      const SizedBox(width: AppSpacing.lg),
                  ],
                ),
              ),
            ),
          ),
        ),
        BlocBuilder<AuthBloc, AuthState>(
          builder: (context, authState) {
            if (authState is AuthAuthenticated) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(left: AppSpacing.sm),
              child: _buildLoginButton(context),
            );
          },
        ),
      ],
    );
  }

  Widget _buildLoginButton(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      height: 54,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadius.full),
        gradient: AppColors.primaryGradient,
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.3),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.full),
          onTap: () => context.push('/welcome'),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
            child: Center(
              child: Text(
                'Đăng nhập',
                style: AppTypography.bodyMd.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
