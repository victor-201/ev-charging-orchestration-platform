import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/profile_bloc.dart';
import '../../domain/entities/profile_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import 'mfa_setup_wizard_screen.dart';

/// Security Settings Screen
///
/// Renders controls allowing users to update their credentials, manage multi-factor
/// authentication (MFA) tokens, and review or terminate active device sessions.
class SecuritySettingsScreen extends StatelessWidget {
  const SecuritySettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Bảo mật'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Mật khẩu'),
              Tab(text: 'MFA'),
              Tab(text: 'Thiết bị'),
            ],
          ),
        ),
        body: BlocConsumer<ProfileBloc, ProfileState>(
          listener: (context, state) {
            if (state is ProfileError) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: AppColors.error));
            if (state is ProfileSuccess) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(state.message), backgroundColor: AppColors.chargerAvailable));
          },
          builder: (context, state) => TabBarView(children: [
            _ChangePasswordTab(),
            _MFATab(state: state),
            _SessionsTab(state: state),
          ]),
        ),
      ),
    );
  }
}

class _ChangePasswordTab extends StatefulWidget {
  @override State<_ChangePasswordTab> createState() => _ChangePasswordTabState();
}

class _ChangePasswordTabState extends State<_ChangePasswordTab> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _showCurrent = false, _showNew = false;

  @override
  void dispose() { _currentCtrl.dispose(); _newCtrl.dispose(); _confirmCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.all(AppSpacing.xl),
    child: Form(
      key: _formKey,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Đổi mật khẩu', style: AppTypography.headingMd),
        const SizedBox(height: AppSpacing.xl),
        TextFormField(
          controller: _currentCtrl,
          obscureText: !_showCurrent,
          decoration: InputDecoration(
            labelText: 'Mật khẩu hiện tại',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(icon: Icon(_showCurrent ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _showCurrent = !_showCurrent)),
          ),
          validator: (v) => v == null || v.isEmpty ? 'Nhập mật khẩu hiện tại' : null,
        ),
        const SizedBox(height: AppSpacing.md),
        TextFormField(
          controller: _newCtrl,
          obscureText: !_showNew,
          decoration: InputDecoration(
            labelText: 'Mật khẩu mới (tối thiểu 8 ký tự)',
            prefixIcon: const Icon(Icons.lock_reset_outlined),
            suffixIcon: IconButton(icon: Icon(_showNew ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _showNew = !_showNew)),
          ),
          validator: (v) => v == null || v.length < 8 ? 'Mật khẩu tối thiểu 8 ký tự' : null,
        ),
        const SizedBox(height: AppSpacing.md),
        TextFormField(
          controller: _confirmCtrl,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Xác nhận mật khẩu mới', prefixIcon: Icon(Icons.lock_outline)),
          validator: (v) => v != _newCtrl.text ? 'Mật khẩu không khớp' : null,
        ),
        const SizedBox(height: AppSpacing.xl),
        EVButton(
          label: 'Đổi mật khẩu',
          icon: Icons.save_outlined,
          onPressed: () {
            if (_formKey.currentState?.validate() != true) return;
            context.read<ProfileBloc>().add(ProfileChangePassword(currentPassword: _currentCtrl.text, newPassword: _newCtrl.text));
          },
        ),
      ]),
    ),
  );
}

class _MFATab extends StatelessWidget {
  final ProfileState state;
  const _MFATab({required this.state});

  @override
  Widget build(BuildContext context) {
    final profile = state is ProfileLoaded ? (state as ProfileLoaded).profile : null;
    final mfaEnabled = profile?.mfaEnabled ?? false;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: mfaEnabled ? AppColors.chargerAvailable.withValues(alpha: 0.08) : AppColors.amber.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: (mfaEnabled ? AppColors.chargerAvailable : AppColors.amber).withValues(alpha: 0.3)),
          ),
          child: Row(children: [
            Icon(mfaEnabled ? Icons.verified_user_outlined : Icons.warning_amber_outlined,
                color: mfaEnabled ? AppColors.chargerAvailable : AppColors.amber, size: 28),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(mfaEnabled ? 'MFA đang bật' : 'MFA chưa được kích hoạt',
                  style: AppTypography.headingMd.copyWith(color: mfaEnabled ? AppColors.chargerAvailable : AppColors.amber)),
              Text(mfaEnabled ? 'Tài khoản được bảo vệ bằng TOTP' : 'Kích hoạt MFA để tăng bảo mật tài khoản',
                  style: AppTypography.caption.copyWith(color: AppColors.grey600)),
            ])),
          ]),
        ),
        const SizedBox(height: AppSpacing.xl),
        if (!mfaEnabled)
          EVButton(
            label: 'Bật MFA (TOTP)',
            icon: Icons.security_outlined,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => const MfaSetupWizardScreen(isCurrentlyEnabled: false),
              ),
            ),
          )
        else
          EVButton(
            label: 'Tắt MFA',
            variant: EVButtonVariant.danger,
            icon: Icons.no_encryption_outlined,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => const MfaSetupWizardScreen(isCurrentlyEnabled: true),
              ),
            ),
          ),
      ]),
    );
  }
}

class _SessionsTab extends StatefulWidget {
  final ProfileState state;
  const _SessionsTab({required this.state});
  @override State<_SessionsTab> createState() => _SessionsTabState();
}

class _SessionsTabState extends State<_SessionsTab> {
  @override
  void initState() {
    super.initState();
    context.read<ProfileBloc>().add(const ProfileLoadSessions());
  }

  @override
  Widget build(BuildContext context) {
    final sessions = widget.state is ProfileLoaded ? (widget.state as ProfileLoaded).sessions : <SessionDeviceEntity>[];

    return Column(children: [
      if (sessions.isNotEmpty)
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: EVButton(
            label: 'Đăng xuất tất cả thiết bị',
            variant: EVButtonVariant.danger,
            icon: Icons.logout_outlined,
            onPressed: () => context.read<ProfileBloc>().add(const ProfileRevokeAllSessions()),
          ),
        ),
      Expanded(
        child: sessions.isEmpty
            ? const Center(child: Text('Không có phiên đăng nhập nào'))
            : ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                itemCount: sessions.length,
                separatorBuilder: (_, __) => const Divider(),
                itemBuilder: (_, i) {
                  final s = sessions[i];
                  return ListTile(
                    leading: Icon(
                      s.userAgent.toLowerCase().contains('android') ? Icons.phone_android_outlined : Icons.laptop_outlined,
                      color: s.isCurrentSession ? AppColors.primary : AppColors.grey600,
                    ),
                    title: Text(s.ipAddress, style: AppTypography.bodyMd.copyWith(fontWeight: s.isCurrentSession ? FontWeight.w600 : FontWeight.w400)),
                    subtitle: Text('${ev_date.DateUtils.formatRelative(s.createdAt)}${s.isCurrentSession ? ' · Thiết bị này' : ''}',
                        style: AppTypography.caption.copyWith(color: s.isCurrentSession ? AppColors.primary : AppColors.grey600)),
                    trailing: s.isCurrentSession
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.logout, color: AppColors.error, size: 20),
                            onPressed: () => context.read<ProfileBloc>().add(ProfileRevokeSession(id: s.id)),
                          ),
                  );
                },
              ),
      ),
    ]);
  }
}
