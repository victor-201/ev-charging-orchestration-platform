import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/profile_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_square.dart';
import '../../../../core/design_system/widgets/liquid_glass_card.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../../core/utils/vnd_formatter.dart';
import 'audit_log_screen.dart';

/// Main Profile Screen — Liquid Glass Design
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  @override
  void initState() {
    super.initState();
    context.read<ProfileBloc>().add(const ProfileLoad());
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      child: BlocConsumer<ProfileBloc, ProfileState>(
        listener: (context, state) {
          if (state is ProfileError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: AppColors.error),
            );
          }
          if (state is ProfileSuccess) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.message), backgroundColor: AppColors.chargerAvailable),
            );
          }
        },
        builder: (context, state) {
          final profile = state is ProfileLoaded ? state.profile : null;
          final vehicleCount = state is ProfileLoaded ? state.vehicles.length : 0;
          final isMfaEnabled = profile?.mfaEnabled == true;

          return CustomScrollView(
            slivers: [
              // ── Glass App Bar ──────────────────────────────────
              SliverAppBar(
                expandedHeight: 240,
                pinned: true,
                backgroundColor: Colors.transparent,
                elevation: 0,
                flexibleSpace: FlexibleSpaceBar(
                  collapseMode: CollapseMode.pin,
                  background: Container(
                    decoration: BoxDecoration(
                      gradient: AppColors.cyanLimeGradient,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cyan.withValues(alpha: 0.3),
                          blurRadius: 40,
                          offset: const Offset(0, 20),
                        ),
                      ],
                    ),
                    child: SafeArea(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(height: AppSpacing.xl),
                          // Avatar — show network image if available, else initials
                          Container(
                            width: 80,
                            height: 80,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white.withValues(alpha: 0.25),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.6),
                                width: 2.5,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.15),
                                  blurRadius: 20,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                            ),
                            child: ClipOval(
                              child: profile?.avatarUrl != null && profile!.avatarUrl!.isNotEmpty
                                  ? CachedNetworkImage(
                                      imageUrl: profile.avatarUrl!,
                                      fit: BoxFit.cover,
                                      placeholder: (_, __) => Center(
                                        child: Text(
                                          profile.fullName.isNotEmpty ? profile.fullName[0].toUpperCase() : 'U',
                                          style: AppTypography.displayMd.copyWith(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                      errorWidget: (_, __, ___) => Center(
                                        child: Text(
                                          profile.fullName.isNotEmpty ? profile.fullName[0].toUpperCase() : 'U',
                                          style: AppTypography.displayMd.copyWith(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                    )
                                  : Center(
                                      child: Text(
                                        profile?.fullName.isNotEmpty == true
                                            ? profile!.fullName[0].toUpperCase()
                                            : 'U',
                                        style: AppTypography.displayMd.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Text(
                            profile?.fullName ?? '...',
                            style: AppTypography.headingMd.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            profile?.email ?? '',
                            style: AppTypography.caption.copyWith(
                              color: Colors.white.withValues(alpha: 0.8),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          // Status + email-verified badges
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (profile?.emailVerified == true)
                                Container(
                                  margin: const EdgeInsets.only(right: 6),
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(Icons.verified, color: Colors.white, size: 12),
                                      const SizedBox(width: 4),
                                      Text('Đã xác thực', style: AppTypography.caption.copyWith(color: Colors.white, fontSize: 10)),
                                    ],
                                  ),
                                ),
                              if (profile?.status != null)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Text(
                                    profile!.status!.toUpperCase(),
                                    style: AppTypography.caption.copyWith(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                actions: [
                  IconButton(
                    icon: const Icon(Icons.notifications_outlined, color: Colors.white),
                    onPressed: () => context.push('/notifications'),
                  ),
                ],
              ),

              // ── Content ────────────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppLayout.sidePadding,
                    vertical: AppLayout.sidePadding,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Stats Row
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          GlassSquare(
                            size: 100,
                            gradient: AppColors.blueCyanGradient,
                            shadowColor: AppColors.blue.withValues(alpha: 0.4),
                            children: [
                              Text(
                                vehicleCount.toString(),
                                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white),
                              ),
                              const SizedBox(height: 4),
                              const Text('Xe của bạn', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500, fontSize: 12)),
                            ],
                            onTap: () => context.push('/profile/vehicles'),
                          ),
                          GlassSquare(
                            size: 100,
                            gradient: isMfaEnabled ? AppColors.cyanLimeGradient : AppColors.yellowOrangeGradient,
                            shadowColor: (isMfaEnabled ? AppColors.cyan : AppColors.yellow).withValues(alpha: 0.4),
                            children: [
                              Icon(
                                isMfaEnabled ? Icons.verified_user : Icons.warning_amber_rounded,
                                color: Colors.white,
                                size: 28,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                isMfaEnabled ? 'MFA Bật' : 'MFA Tắt',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12),
                              ),
                            ],
                            onTap: () => context.push('/profile/security'),
                          ),
                          GlassSquare(
                            size: 100,
                            gradient: AppColors.orangePinkGradient,
                            shadowColor: AppColors.pink.withValues(alpha: 0.4),
                            children: const [
                              Icon(Icons.headset_mic_rounded, color: Colors.white, size: 28),
                              SizedBox(height: 8),
                              Text('Hỗ trợ', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)),
                            ],
                            onTap: () {},
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.xxxl),

                      // Tài khoản
                      _SectionLabel(label: 'Tài khoản'),
                      // Address info pill (if available)
                      if (profile?.address != null && profile!.address!.isNotEmpty) ...[
                        _InfoPill(
                          icon: Icons.location_on_outlined,
                          label: profile.address!,
                        ),
                        const SizedBox(height: AppSpacing.md),
                      ],
                      if (profile?.phone != null && profile!.phone!.isNotEmpty) ...[
                        _InfoPill(
                          icon: Icons.phone_outlined,
                          label: profile.phone!,
                        ),
                        const SizedBox(height: AppSpacing.md),
                      ],
                      _MenuPill(
                        label: 'Chỉnh sửa hồ sơ',
                        trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
                        onTap: () => _showEditProfileDialog(context, state),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _MenuPill(
                        label: 'Đổi mật khẩu',
                        trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
                        onTap: () => context.push('/profile/security'),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _MenuPill(
                        label: 'Xác thực 2 yếu tố (MFA)',
                        trailing: isMfaEnabled
                            ? const Icon(Icons.check_circle, color: AppColors.cyan)
                            : const Icon(Icons.warning_amber_outlined, color: AppColors.yellow),
                        onTap: () => context.push('/profile/security'),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _MenuPill(
                        label: 'Quản lý công nợ',
                        trailing: profile?.hasArrears == true
                            ? Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    '-${VndFormatter.format(profile?.arrearsAmount ?? 0.0)}',
                                    style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.bold, fontSize: 13),
                                  ),
                                  const SizedBox(width: 4),
                                  const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 16),
                                ],
                              )
                            : const Icon(Icons.chevron_right, color: AppColors.textMuted),
                        onTap: () => context.push('/profile/arrears'),
                      ),
                      const SizedBox(height: AppSpacing.xxxl),

                      // Phương tiện
                      _SectionLabel(label: 'Phương tiện'),
                      _MenuPill(
                        label: 'Quản lý phương tiện',
                        trailing: Text(
                          '$vehicleCount xe',
                          style: AppTypography.caption.copyWith(color: AppColors.textMuted, fontWeight: FontWeight.bold),
                        ),
                        onTap: () => context.push('/profile/vehicles'),
                      ),
                      const SizedBox(height: AppSpacing.xxxl),

                      // Bảo mật
                      _SectionLabel(label: 'Hệ thống'),
                      _MenuPill(
                        label: 'Thiết bị đang đăng nhập',
                        trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
                        onTap: () => context.push('/profile/security'),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _MenuPill(
                        label: 'Nhật ký hoạt động',
                        trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const AuditLogScreen(),
                          ),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      _MenuPill(
                        label: 'Đăng xuất',
                        isDanger: true,
                        isDarkVariant: true,
                        onTap: () => _confirmLogout(context),
                      ),
                      SizedBox(height: AppLayout.bottomPadding(context)),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showEditProfileDialog(BuildContext context, ProfileState state) {
    final profile = state is ProfileLoaded ? state.profile : null;
    if (profile == null) return;
    // API PATCH /users/me only accepts avatarUrl and address
    final avatarCtrl  = TextEditingController(text: profile.avatarUrl ?? '');
    final addressCtrl = TextEditingController(text: profile.address ?? '');
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        margin: const EdgeInsets.all(AppSpacing.md),
        child: LiquidGlassCard(
          padding: EdgeInsets.only(
            left: AppSpacing.lg,
            right: AppSpacing.lg,
            top: AppSpacing.lg,
            bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Chỉnh sửa hồ sơ', style: AppTypography.headingMd),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Tên và số điện thoại được đặt khi đăng ký và không thể thay đổi.',
                style: AppTypography.caption.copyWith(color: AppColors.textMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              TextField(
                controller: avatarCtrl,
                decoration: const InputDecoration(
                  labelText: 'URL ảnh đại diện',
                  prefixIcon: Icon(Icons.image_outlined),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: addressCtrl,
                decoration: const InputDecoration(
                  labelText: 'Địa chỉ',
                  prefixIcon: Icon(Icons.location_on_outlined),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              EVButton(
                label: 'Lưu thay đổi',
                onPressed: () {
                  Navigator.pop(context);
                  context.read<ProfileBloc>().add(ProfileUpdate(
                    avatarUrl: avatarCtrl.text.isNotEmpty ? avatarCtrl.text : null,
                    address: addressCtrl.text.isNotEmpty ? addressCtrl.text : null,
                  ));
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Đăng xuất?'),
        content: const Text('Bạn có chắc muốn đăng xuất khỏi ứng dụng?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Huỷ'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              context.read<AuthBloc>().add(const AuthLogoutRequested());
            },
            child: const Text('Đăng xuất', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }
}

class _MenuPill extends StatelessWidget {
  final String label;
  final bool isDarkVariant;
  final bool isDanger;
  final Widget? trailing;
  final VoidCallback onTap;

  const _MenuPill({
    required this.label,
    this.isDarkVariant = false,
    this.isDanger = false,
    this.trailing,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final Color bg = isDarkVariant
        ? (isDark ? AppColors.darkPillBgDark : AppColors.darkPillBgLight)
        : (isDark ? AppColors.pillBgDark : AppColors.pillBgLight);

    final Color border = isDarkVariant
        ? (isDark ? AppColors.darkPillBorderDark : AppColors.darkPillBorderLight)
        : (isDark ? AppColors.pillBorderDark : AppColors.pillBorderLight);

    final Color textColor = isDanger
        ? AppColors.error
        : (isDarkVariant
            ? (isDark ? AppColors.darkPillTextDark : AppColors.darkPillTextLight)
            : (isDark ? AppColors.pillTextDark : AppColors.pillTextLight));

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.02),
              blurRadius: 15,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                label,
                style: AppTypography.bodyMd.copyWith(
                  color: textColor,
                  fontWeight: FontWeight.w600,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: 8),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {

  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(
          left: AppSpacing.xs,
          bottom: AppSpacing.md,
        ),
        child: Text(
          label.toUpperCase(),
          style: AppTypography.overline.copyWith(
            color: AppColors.textMuted,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
      );
}

class _InfoPill extends StatelessWidget {
  final IconData icon;
  final String label;

  const _InfoPill({
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final Color bg = isDark ? AppColors.pillBgDark : AppColors.pillBgLight;
    final Color border = isDark ? AppColors.pillBorderDark : AppColors.pillBorderLight;
    final Color textColor = isDark ? AppColors.pillTextDark : AppColors.pillTextLight;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.textMuted, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: AppTypography.bodyMd.copyWith(
                color: textColor,
                fontWeight: FontWeight.w500,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
