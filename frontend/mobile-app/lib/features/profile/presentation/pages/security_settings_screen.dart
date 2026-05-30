import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/profile_bloc.dart';
import '../../domain/entities/profile_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/liquid_glass_card.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import 'mfa_setup_wizard_screen.dart';

/// Security Settings Screen
///
/// Overhauled with a unified top-to-bottom layout inside the body, preserving
/// the full-bleed background gradient while aligning all elements sequentially.
class SecuritySettingsScreen extends StatelessWidget {
  final int initialIndex;
  const SecuritySettingsScreen({super.key, this.initialIndex = 0});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      initialIndex: initialIndex,
      length: 3,
      child: LiquidGlassScaffold(
        extendBodyBehindAppBar: true,
        appBar: null, // Unified layout in body preserves full-bleed gradients
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 1. Sleek Header Row
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppLayout.sidePadding, vertical: AppSpacing.sm),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back_ios, size: 20),
                      onPressed: () => Navigator.pop(context),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'Bảo mật',
                      style: AppTypography.headingLg.copyWith(
                        fontWeight: FontWeight.w700,
                        color: Theme.of(context).colorScheme.onSurface,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
              ),

              // 2. Beautiful Segmented Pill TabBar
              Container(
                margin: const EdgeInsets.symmetric(horizontal: AppLayout.sidePadding, vertical: 8.0),
                padding: const EdgeInsets.all(4.0),
                decoration: BoxDecoration(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white.withValues(alpha: 0.05)
                      : Colors.black.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(20.0),
                  border: Border.all(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.white.withValues(alpha: 0.08)
                        : Colors.black.withValues(alpha: 0.08),
                    width: 1.0,
                  ),
                ),
                child: TabBar(
                  dividerColor: Colors.transparent,
                  indicator: BoxDecoration(
                    borderRadius: BorderRadius.circular(16.0),
                    gradient: AppColors.cyanLimeGradient,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.cyan.withValues(alpha: 0.35),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  indicatorSize: TabBarIndicatorSize.tab,
                  labelColor: Colors.white,
                  unselectedLabelColor: AppColors.textMuted,
                  labelStyle: AppTypography.labelMd.copyWith(fontWeight: FontWeight.bold),
                  unselectedLabelStyle: AppTypography.labelMd.copyWith(fontWeight: FontWeight.normal),
                  tabs: const [
                    Tab(text: 'Mật khẩu'),
                    Tab(text: 'MFA'),
                    Tab(text: 'Thiết bị'),
                  ],
                ),
              ),

              // 3. Content View
              Expanded(
                child: BlocConsumer<ProfileBloc, ProfileState>(
                  listener: (context, state) {
                    if (state is ProfileError) EVToast.show(context, message: state.message, isError: true);
                    if (state is ProfileSuccess) EVToast.show(context, message: state.message, isError: false);
                  },
                  builder: (context, state) => TabBarView(
                    children: [
                      _ChangePasswordTab(),
                      _MFATab(state: state),
                      _SessionsTab(state: state),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChangePasswordTab extends StatefulWidget {
  @override
  State<_ChangePasswordTab> createState() => _ChangePasswordTabState();
}

class _ChangePasswordTabState extends State<_ChangePasswordTab> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _showCurrent = false, _showNew = false, _showConfirm = false;

  @override
  void initState() {
    super.initState();
    _newCtrl.addListener(() {
      setState(() {});
    });
  }

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  // ── Password Strength Rules ────────────────────────────────
  bool _hasMinLength(String val) => val.length >= 8;
  bool _hasUpperLower(String val) => val.contains(RegExp(r'[A-Z]')) && val.contains(RegExp(r'[a-z]'));
  bool _hasNumber(String val) => val.contains(RegExp(r'[0-9]'));
  bool _hasSpecialChar(String val) => val.contains(RegExp(r'[!@#\$&*~`%^()_\-+={[}\]|:;"<,>.?/]'));

  double _getPasswordStrength() {
    final pass = _newCtrl.text;
    if (pass.isEmpty) return 0.0;
    
    int score = 0;
    if (_hasMinLength(pass)) score++;
    if (_hasUpperLower(pass)) score++;
    if (_hasNumber(pass)) score++;
    if (_hasSpecialChar(pass)) score++;
    
    return score / 4.0; // 0.0 to 1.0
  }

  String _getPasswordStrengthLabel() {
    final score = _getPasswordStrength();
    if (score == 0.0) return '';
    if (score <= 0.25) return 'Mật khẩu rất yếu';
    if (score <= 0.5) return 'Mật khẩu yếu';
    if (score <= 0.75) return 'Mật khẩu trung bình';
    return 'Mật khẩu cực kỳ mạnh (Khuyên dùng)';
  }

  Color _getPasswordStrengthColor() {
    final score = _getPasswordStrength();
    if (score <= 0.25) return AppColors.danger;
    if (score <= 0.5) return AppColors.orange;
    if (score <= 0.75) return AppColors.amber;
    return AppColors.success;
  }

  @override
  Widget build(BuildContext context) {
    final strength = _getPasswordStrength();
    final strengthColor = _getPasswordStrengthColor();
    final strengthLabel = _getPasswordStrengthLabel();
    final newPass = _newCtrl.text;

    return SingleChildScrollView(
      padding: AppLayout.paddingWithNavbar(context),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: AppSpacing.lg),
            Text('Đổi mật khẩu', style: AppTypography.headingMd),
            const SizedBox(height: 8),
            Text(
              'Hãy chọn một mật khẩu mạnh để tăng khả năng bảo vệ tài khoản khỏi các truy cập trái phép.',
              style: AppTypography.caption.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: AppSpacing.lg),

            // Padlock Illustration Header
            Center(
              child: Container(
                width: 90,
                height: 90,
                margin: const EdgeInsets.only(bottom: AppSpacing.lg),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppColors.primary.withValues(alpha: 0.3),
                    width: 2.0,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.15),
                      blurRadius: 20,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.lock_reset_rounded,
                  color: AppColors.primary,
                  size: 40,
                ),
              ),
            ),

            LiquidGlassCard(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextFormField(
                    controller: _currentCtrl,
                    obscureText: !_showCurrent,
                    decoration: InputDecoration(
                      labelText: 'Mật khẩu hiện tại',
                      prefixIcon: const Icon(Icons.lock_outline, color: AppColors.primary),
                      suffixIcon: IconButton(
                        icon: Icon(_showCurrent ? Icons.visibility_off : Icons.visibility, color: AppColors.textMuted),
                        onPressed: () => setState(() => _showCurrent = !_showCurrent),
                      ),
                    ),
                    validator: (v) => v == null || v.isEmpty ? 'Nhập mật khẩu hiện tại' : null,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  TextFormField(
                    controller: _newCtrl,
                    obscureText: !_showNew,
                    decoration: InputDecoration(
                      labelText: 'Mật khẩu mới',
                      prefixIcon: const Icon(Icons.lock_reset_outlined, color: AppColors.primary),
                      suffixIcon: IconButton(
                        icon: Icon(_showNew ? Icons.visibility_off : Icons.visibility, color: AppColors.textMuted),
                        onPressed: () => setState(() => _showNew = !_showNew),
                      ),
                    ),
                    validator: (v) => v == null || v.length < 8 ? 'Mật khẩu tối thiểu 8 ký tự' : null,
                  ),
                  
                  // Interactive Real-time Strength Meter
                  if (newPass.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Độ mạnh mật khẩu:',
                              style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                            ),
                            Text(
                              strengthLabel,
                              style: AppTypography.caption.copyWith(
                                color: strengthColor,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: Container(
                            height: 6,
                            width: double.infinity,
                            color: Colors.white.withValues(alpha: 0.1),
                            child: FractionallySizedBox(
                              alignment: Alignment.centerLeft,
                              widthFactor: strength,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: strengthColor,
                                  boxShadow: [
                                    BoxShadow(
                                      color: strengthColor.withValues(alpha: 0.5),
                                      blurRadius: 4,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        // Requirements Checklist
                        _buildRequirementItem('Tối thiểu 8 ký tự', _hasMinLength(newPass)),
                        _buildRequirementItem('Có chữ hoa và chữ thường', _hasUpperLower(newPass)),
                        _buildRequirementItem('Có ít nhất 1 chữ số', _hasNumber(newPass)),
                        _buildRequirementItem('Có ký tự đặc biệt (ví dụ: @, #, \$, ...)', _hasSpecialChar(newPass)),
                      ],
                    ),
                  ],
                  
                  const SizedBox(height: AppSpacing.md),
                  TextFormField(
                    controller: _confirmCtrl,
                    obscureText: !_showConfirm,
                    decoration: InputDecoration(
                      labelText: 'Xác nhận mật khẩu mới',
                      prefixIcon: const Icon(Icons.verified_outlined, color: AppColors.primary),
                      suffixIcon: IconButton(
                        icon: Icon(_showConfirm ? Icons.visibility_off : Icons.visibility, color: AppColors.textMuted),
                        onPressed: () => setState(() => _showConfirm = !_showConfirm),
                      ),
                    ),
                    validator: (v) => v != _newCtrl.text ? 'Mật khẩu xác nhận không trùng khớp' : null,
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  EVButton(
                    label: 'Cập nhật mật khẩu',
                    icon: Icons.save_outlined,
                    onPressed: () {
                      if (_formKey.currentState?.validate() != true) return;
                      context.read<ProfileBloc>().add(ProfileChangePassword(
                            currentPassword: _currentCtrl.text,
                            newPassword: _newCtrl.text,
                          ));
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRequirementItem(String text, bool isMet) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4.0),
      child: Row(
        children: [
          Icon(
            isMet ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
            color: isMet ? AppColors.success : AppColors.textMuted.withValues(alpha: 0.5),
            size: 14,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              text,
              style: AppTypography.caption.copyWith(
                color: isMet ? AppColors.textLight : AppColors.textMuted,
                fontWeight: isMet ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MFATab extends StatelessWidget {
  final ProfileState state;
  const _MFATab({required this.state});

  @override
  Widget build(BuildContext context) {
    final profile = state is ProfileLoaded ? (state as ProfileLoaded).profile : null;
    final mfaEnabled = profile?.mfaEnabled ?? false;

    return SingleChildScrollView(
      padding: AppLayout.paddingWithNavbar(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: AppSpacing.lg),
          Text('Bảo mật 2 lớp (MFA)', style: AppTypography.headingMd),
          const SizedBox(height: 8),
          Text(
            'MFA bổ sung một bước xác minh khi đăng nhập để đảm bảo duy nhất bạn có quyền truy cập vào tài khoản.',
            style: AppTypography.caption.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: AppSpacing.xl),

          // Glowing premium illustration badge
          Center(
            child: Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                color: (mfaEnabled ? AppColors.chargerAvailable : AppColors.amber).withValues(alpha: 0.12),
                shape: BoxShape.circle,
                border: Border.all(
                  color: (mfaEnabled ? AppColors.chargerAvailable : AppColors.amber).withValues(alpha: 0.35),
                  width: 2.0,
                ),
                boxShadow: [
                  BoxShadow(
                    color: (mfaEnabled ? AppColors.chargerAvailable : AppColors.amber).withValues(alpha: 0.25),
                    blurRadius: 24,
                  ),
                ],
              ),
              child: Icon(
                mfaEnabled ? Icons.verified_user_rounded : Icons.gpp_maybe_rounded,
                color: mfaEnabled ? AppColors.chargerAvailable : AppColors.amber,
                size: 48,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.xl),

          LiquidGlassCard(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(
                      mfaEnabled ? Icons.check_circle_rounded : Icons.error_rounded,
                      color: mfaEnabled ? AppColors.chargerAvailable : AppColors.amber,
                      size: 24,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        mfaEnabled ? 'Đã kích hoạt bảo vệ' : 'Chưa được kích hoạt bảo vệ',
                        style: AppTypography.bodyLg.copyWith(
                          fontWeight: FontWeight.bold,
                          color: mfaEnabled ? AppColors.chargerAvailable : AppColors.amber,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  mfaEnabled
                      ? 'Tài khoản của bạn hiện đang được bảo vệ an toàn bằng mã TOTP thông qua ứng dụng Authenticator liên kết.'
                      : 'Hãy kích hoạt bảo mật 2 lớp ngay hôm nay để tránh hoàn toàn nguy cơ rò rỉ thông tin cá nhân và tài sản thẻ sạc.',
                  style: AppTypography.bodyMd.copyWith(color: AppColors.textLight.withValues(alpha: 0.85)),
                ),
                const SizedBox(height: AppSpacing.xl),
                EVButton(
                  label: mfaEnabled ? 'Hủy kích hoạt bảo vệ' : 'Kích hoạt bảo vệ ngay',
                  variant: mfaEnabled ? EVButtonVariant.danger : EVButtonVariant.primary,
                  icon: mfaEnabled ? Icons.no_encryption_outlined : Icons.security_outlined,
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => MfaSetupWizardScreen(isCurrentlyEnabled: mfaEnabled),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SessionsTab extends StatefulWidget {
  final ProfileState state;
  const _SessionsTab({required this.state});
  @override
  State<_SessionsTab> createState() => _SessionsTabState();
}

class _SessionsTabState extends State<_SessionsTab> {
  @override
  void initState() {
    super.initState();
    context.read<ProfileBloc>().add(const ProfileLoadSessions());
  }

  String _parseUserAgent(String ua) {
    final lower = ua.toLowerCase();
    
    String os = 'Thiết bị lạ';
    if (lower.contains('android')) {
      os = 'Android';
    } else if (lower.contains('iphone')) {
      os = 'iPhone';
    } else if (lower.contains('ipad')) {
      os = 'iPad';
    } else if (lower.contains('windows')) {
      os = 'Windows';
    } else if (lower.contains('macintosh') || lower.contains('mac os')) {
      os = 'macOS';
    } else if (lower.contains('linux')) {
      os = 'Linux';
    }
    
    String browser = '';
    if (lower.contains('chrome') || lower.contains('chromium')) {
      browser = 'Chrome';
    } else if (lower.contains('safari') && !lower.contains('chrome')) {
      browser = 'Safari';
    } else if (lower.contains('firefox')) {
      browser = 'Firefox';
    } else if (lower.contains('edge')) {
      browser = 'Edge';
    } else if (lower.contains('opera') || lower.contains('opr')) {
      browser = 'Opera';
    }
    
    if (browser.isNotEmpty) {
      return '$browser trên $os';
    }
    return os;
  }

  @override
  Widget build(BuildContext context) {
    final sessions = widget.state is ProfileLoaded ? (widget.state as ProfileLoaded).sessions : <SessionDeviceEntity>[];
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return CustomScrollView(
      slivers: [
        // Title & Header info
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppLayout.sidePadding,
              AppSpacing.lg,
              AppLayout.sidePadding,
              AppSpacing.md,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Thiết bị đang hoạt động', style: AppTypography.headingMd),
                const SizedBox(height: 8),
                Text(
                  'Danh sách các trình duyệt và thiết bị đã đăng nhập vào tài khoản của bạn. Vui lòng đăng xuất khỏi các thiết bị lạ.',
                  style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                ),
                if (sessions.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  EVButton(
                    label: 'Đăng xuất tất cả thiết bị khác',
                    variant: EVButtonVariant.danger,
                    icon: Icons.logout_outlined,
                    onPressed: () => context.read<ProfileBloc>().add(const ProfileRevokeAllSessions()),
                  ),
                ],
              ],
            ),
          ),
        ),

        // Sessions list or empty state
        if (sessions.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: LiquidGlassCard(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.devices_other_rounded, size: 56, color: AppColors.textMuted),
                      const SizedBox(height: AppSpacing.lg),
                      Text(
                        'Không có thiết bị hoạt động nào khác',
                        style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          )
        else
          SliverPadding(
            padding: AppLayout.paddingWithNavbar(context),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (_, i) {
                  final s = sessions[i];
                  final uaParsed = _parseUserAgent(s.userAgent);
                  
                  final isAndroid = s.userAgent.toLowerCase().contains('android');
                  final isIOS = s.userAgent.toLowerCase().contains('iphone') || s.userAgent.toLowerCase().contains('ipad');
                  final isMac = s.userAgent.toLowerCase().contains('macintosh') || s.userAgent.toLowerCase().contains('mac os');
                  final isWindows = s.userAgent.toLowerCase().contains('windows');
                  final isLinux = s.userAgent.toLowerCase().contains('linux');

                  IconData deviceIcon = Icons.laptop_rounded;
                  if (isAndroid) {
                    deviceIcon = Icons.phone_android_rounded;
                  } else if (isIOS) {
                    deviceIcon = Icons.phone_iphone_rounded;
                  } else if (isWindows) {
                    deviceIcon = Icons.desktop_windows_rounded;
                  } else if (isMac) {
                    deviceIcon = Icons.desktop_mac_rounded;
                  } else if (isLinux) {
                    deviceIcon = Icons.terminal_rounded;
                  }

                  return Container(
                    margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white.withValues(alpha: 0.03) : Colors.white.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.white.withValues(alpha: 0.3),
                        width: 1.0,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: (s.isCurrentSession ? AppColors.primary : AppColors.textMuted).withValues(alpha: 0.12),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            deviceIcon,
                            color: s.isCurrentSession ? AppColors.primary : AppColors.textMuted,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      uaParsed,
                                      style: AppTypography.bodyMd.copyWith(
                                        fontWeight: FontWeight.w700,
                                        color: s.isCurrentSession ? AppColors.primary : null,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  if (s.isCurrentSession) ...[
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppColors.primary.withValues(alpha: 0.15),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        'THIẾT BỊ NÀY',
                                        style: AppTypography.overline.copyWith(
                                          color: AppColors.primary,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'IP: ${s.ipAddress} · ${ev_date.DateUtils.formatRelative(s.createdAt)}',
                                style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        if (!s.isCurrentSession) ...[
                          const SizedBox(width: 12),
                          IconButton(
                            icon: const Icon(Icons.logout_rounded, color: AppColors.error),
                            onPressed: () {
                              showDialog(
                                context: context,
                                builder: (ctx) => BackdropFilter(
                                  filter: ImageFilter.blur(sigmaX: 5.0, sigmaY: 5.0),
                                  child: AlertDialog(
                                    backgroundColor: isDark ? AppColors.cardDark : AppColors.cardLight,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24.0)),
                                    title: const Text('Đăng xuất thiết bị?'),
                                    content: const Text('Bạn có chắc chắn muốn đăng xuất khỏi phiên truy cập này không?'),
                                    actions: [
                                      TextButton(
                                        child: const Text('Hủy', style: TextStyle(color: AppColors.textMuted)),
                                        onPressed: () => Navigator.pop(ctx),
                                      ),
                                      TextButton(
                                        child: const Text('Đăng xuất', style: TextStyle(color: AppColors.danger)),
                                        onPressed: () {
                                          Navigator.pop(ctx);
                                          context.read<ProfileBloc>().add(ProfileRevokeSession(id: s.id));
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ],
                      ],
                    ),
                  );
                },
                childCount: sessions.length,
              ),
            ),
          ),
      ],
    );
  }
}
