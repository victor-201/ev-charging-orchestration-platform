import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/profile_bloc.dart';
import '../../../../core/design_system/app_colors.dart';
import '../../../../core/design_system/app_theme.dart';
import '../../../../core/design_system/app_typography.dart';
import '../../../../core/design_system/ev_button.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../auth/presentation/bloc/auth_event_state.dart';

/// Main Profile Screen
///
/// Renders user account information, profile settings controls, vehicle registers,
/// MFA configuration states, and active sessions management options.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  @override
  void initState() {
    super.initState();
    context.read<ProfileBloc>().add(const ProfileLoad());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: BlocConsumer<ProfileBloc, ProfileState>(
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
          return CustomScrollView(slivers: [
            SliverAppBar(
              expandedHeight: 220,
              pinned: true,
              flexibleSpace: FlexibleSpaceBar(
                background: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [AppColors.primary, AppColors.primary.withValues(alpha: 0.7)],
                    ),
                  ),
                  child: SafeArea(
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const SizedBox(height: AppSpacing.xl),
                      CircleAvatar(
                        radius: 40,
                        backgroundColor: Colors.white.withValues(alpha: 0.2),
                        child: Text(
                          profile?.fullName.isNotEmpty == true ? profile!.fullName[0].toUpperCase() : 'U',
                          style: AppTypography.displayMd.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(profile?.fullName ?? '...', style: AppTypography.headingMd.copyWith(color: Colors.white)),
                      Text(profile?.email ?? '', style: AppTypography.caption.copyWith(color: Colors.white70)),
                    ]),
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

            SliverList(delegate: SliverChildListDelegate([
              const SizedBox(height: AppSpacing.lg),
              _SectionLabel(label: 'Tài khoản'),
              _MenuItem(icon: Icons.person_outline, label: 'Chỉnh sửa hồ sơ', onTap: () => _showEditProfileDialog(context, state)),
              _MenuItem(icon: Icons.lock_outline, label: 'Đổi mật khẩu', onTap: () => context.push('/profile/security')),
              _MenuItem(icon: Icons.verified_user_outlined, label: 'Xác thực 2 yếu tố (MFA)',
                  trailing: profile?.mfaEnabled == true
                      ? const Icon(Icons.check_circle, color: AppColors.chargerAvailable, size: 18)
                      : const Icon(Icons.warning_amber_outlined, color: AppColors.amber, size: 18),
                  onTap: () => context.push('/profile/security')),

              const Divider(height: AppSpacing.xl),
              _SectionLabel(label: 'Phương tiện'),
              _MenuItem(icon: Icons.electric_car_outlined, label: 'Quản lý phương tiện',
                  trailing: Text('${state is ProfileLoaded ? state.vehicles.length : 0} xe',
                      style: AppTypography.caption.copyWith(color: AppColors.grey600)),
                  onTap: () => context.push('/profile/vehicles')),

              const Divider(height: AppSpacing.xl),
              _SectionLabel(label: 'Bảo mật'),
              _MenuItem(icon: Icons.devices_outlined, label: 'Thiết bị đang đăng nhập', onTap: () => context.push('/profile/security')),

              const Divider(height: AppSpacing.xl),
              _SectionLabel(label: 'Khác'),
              _MenuItem(icon: Icons.logout, label: 'Đăng xuất', color: AppColors.error, onTap: () => _confirmLogout(context)),

              const SizedBox(height: AppSpacing.xxxl),
            ])),
          ]);
        },
      ),
    );
  }

  void _showEditProfileDialog(BuildContext context, ProfileState state) {
    final profile = state is ProfileLoaded ? state.profile : null;
    if (profile == null) return;
    final nameCtrl = TextEditingController(text: profile.fullName);
    final phoneCtrl = TextEditingController(text: profile.phone ?? '');
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(
          left: AppSpacing.lg, right: AppSpacing.lg, top: AppSpacing.lg,
          bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.lg,
        ),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Chỉnh sửa hồ sơ', style: AppTypography.headingMd),
          const SizedBox(height: AppSpacing.lg),
          TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Họ và tên', prefixIcon: Icon(Icons.person_outline))),
          const SizedBox(height: AppSpacing.md),
          TextField(controller: phoneCtrl, decoration: const InputDecoration(labelText: 'Số điện thoại', prefixIcon: Icon(Icons.phone_outlined)), keyboardType: TextInputType.phone),
          const SizedBox(height: AppSpacing.xl),
          EVButton(
            label: 'Lưu thay đổi',
            onPressed: () {
              Navigator.pop(context);
              context.read<ProfileBloc>().add(ProfileUpdate(fullName: nameCtrl.text, phone: phoneCtrl.text));
            },
          ),
        ]),
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
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Huỷ')),
          TextButton(
            onPressed: () { Navigator.pop(context); context.read<AuthBloc>().add(const AuthLogoutRequested()); },
            child: Text('Đăng xuất', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.xs),
    child: Text(label, style: AppTypography.caption.copyWith(color: AppColors.grey600, fontWeight: FontWeight.w600, letterSpacing: 0.8)),
  );
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final Widget? trailing;
  final Color? color;
  final VoidCallback? onTap;
  const _MenuItem({required this.icon, required this.label, this.trailing, this.color, this.onTap});

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon, color: color ?? AppColors.primary, size: 22),
    title: Text(label, style: AppTypography.bodyMd.copyWith(color: color)),
    trailing: trailing ?? const Icon(Icons.chevron_right, color: AppColors.grey400),
    onTap: onTap,
  );
}
