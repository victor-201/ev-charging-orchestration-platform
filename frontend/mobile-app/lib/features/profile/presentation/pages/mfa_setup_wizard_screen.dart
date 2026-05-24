import 'package:flutter/material.dart';
import 'package:get_it/get_it.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/profile_bloc.dart';
import '../../domain/repositories/i_profile_repository.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';

class MfaSetupWizardScreen extends StatefulWidget {
  final bool isCurrentlyEnabled;

  const MfaSetupWizardScreen({
    super.key,
    required this.isCurrentlyEnabled,
  });

  @override
  State<MfaSetupWizardScreen> createState() => _MfaSetupWizardScreenState();
}

class _MfaSetupWizardScreenState extends State<MfaSetupWizardScreen> {
  final _repository = GetIt.instance<IProfileRepository>();
  int _currentStep = 1; // 1: QR & Secret, 2: Code Verification, 3: Backup Codes (Success)
  
  bool _isLoading = false;
  String? _secret;
  String? _otpauthUrl;
  List<String> _backupCodes = [];

  final List<TextEditingController> _controllers = List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focusNodes = List.generate(6, (_) => FocusNode());
  
  // Disable tab
  final _passwordCtrl = TextEditingController();
  bool _showPassword = false;

  @override
  void initState() {
    super.initState();
    if (!widget.isCurrentlyEnabled) {
      _fetchMfaSetup();
    }
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchMfaSetup() async {
    setState(() => _isLoading = true);
    final result = await _repository.setupMfa();
    result.fold(
      (failure) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(failure.message), backgroundColor: AppColors.error),
        );
      },
      (data) {
        setState(() {
          _secret = data['secret']?.toString();
          _otpauthUrl = data['otpauth_url']?.toString();
          _isLoading = false;
        });
      },
    );
  }

  String get _otpCode => _controllers.map((c) => c.text).join();

  Future<void> _verifyCode() async {
    final code = _otpCode;
    if (code.length != 6) return;

    setState(() => _isLoading = true);
    final result = await _repository.verifyAndEnableMfa(code);
    result.fold(
      (failure) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(failure.message), backgroundColor: AppColors.error),
        );
        for (final c in _controllers) {
          c.clear();
        }
        _focusNodes[0].requestFocus();
      },
      (backupCodes) {
        setState(() {
          _backupCodes = backupCodes;
          _currentStep = 3;
          _isLoading = false;
        });
        // Silent refresh of profile state in the app BLoC
        context.read<ProfileBloc>().add(const ProfileLoad());
      },
    );
  }

  Future<void> _disableMfa() async {
    final password = _passwordCtrl.text.trim();
    if (password.isEmpty) return;

    setState(() => _isLoading = true);
    final result = await _repository.disableMfa(password);
    result.fold(
      (failure) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(failure.message), backgroundColor: AppColors.error),
        );
      },
      (_) {
        setState(() => _isLoading = false);
        context.read<ProfileBloc>().add(const ProfileLoad());
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã tắt bảo mật 2 lớp thành công.'), backgroundColor: AppColors.chargerAvailable),
        );
        Navigator.pop(context);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isCurrentlyEnabled ? 'Tắt bảo mật 2 lớp' : 'Thiết lập bảo mật 2 lớp'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: _isLoading && _secret == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
              child: widget.isCurrentlyEnabled ? _buildDisableFlow(theme) : _buildSetupFlow(theme),
            ),
    );
  }

  // --- Disable MFA flow ---
  Widget _buildDisableFlow(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 20),
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: AppColors.error.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 36),
          ),
        ),
        const SizedBox(height: 24),
        Center(
          child: Text(
            'Hủy kích hoạt bảo mật 2 lớp?',
            style: AppTypography.headingMd,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Việc hủy kích hoạt bảo mật 2 lớp (MFA) sẽ khiến tài khoản của bạn kém an toàn hơn. Vui lòng nhập mật khẩu tài khoản của bạn để xác thực.',
          style: AppTypography.caption.copyWith(color: AppColors.grey600),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 32),
        TextFormField(
          controller: _passwordCtrl,
          obscureText: !_showPassword,
          decoration: InputDecoration(
            labelText: 'Mật khẩu tài khoản',
            prefixIcon: const Icon(Icons.lock_outline),
            suffixIcon: IconButton(
              icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _showPassword = !_showPassword),
            ),
          ),
        ),
        const SizedBox(height: 32),
        EVButton(
          label: 'Tắt bảo mật 2 lớp',
          variant: EVButtonVariant.danger,
          icon: Icons.no_encryption_outlined,
          isLoading: _isLoading,
          onPressed: _passwordCtrl.text.isNotEmpty ? _disableMfa : null,
        ),
      ],
    );
  }

  // --- Step-by-Step Enable MFA flow ---
  Widget _buildSetupFlow(ThemeData theme) {
    if (_currentStep == 1) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 10),
          Text(
            'Bước 1: Quét mã QR bảo mật',
            style: AppTypography.headingMd.copyWith(color: AppColors.primary),
          ),
          const SizedBox(height: 8),
          Text(
            'Sử dụng ứng dụng Authenticator (Google/Microsoft) để quét mã QR dưới đây, hoặc nhập thủ công khóa bí mật.',
            style: AppTypography.caption.copyWith(color: AppColors.grey600),
          ),
          const SizedBox(height: 24),

          // QR Code Card
          if (_otpauthUrl != null)
            Center(
              child: Card(
                color: Colors.white,
                elevation: 4,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: QrImageView(
                    data: _otpauthUrl!,
                    version: QrVersions.auto,
                    size: 200.0,
                  ),
                ),
              ),
            ),
          const SizedBox(height: 24),

          // Secret Key Box
          if (_secret != null) ...[
            Center(
              child: Text(
                'Khóa bí mật (nhập thủ công):',
                style: AppTypography.caption.copyWith(fontWeight: FontWeight.bold, color: AppColors.grey600),
              ),
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: theme.cardColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.outlineLight),
              ),
              child: SelectableText(
                _secret!,
                textAlign: TextAlign.center,
                style: AppTypography.caption.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                  fontFamily: 'monospace',
                ),
              ),
            ),
          ],
          const SizedBox(height: 32),

          EVButton(
            label: 'Tôi đã quét mã, Tiếp tục',
            icon: Icons.arrow_forward,
            onPressed: () {
              setState(() => _currentStep = 2);
              WidgetsBinding.instance.addPostFrameCallback((_) {
                _focusNodes[0].requestFocus();
              });
            },
          ),
        ],
      );
    }

    if (_currentStep == 2) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 10),
          Text(
            'Bước 2: Xác minh kích hoạt',
            style: AppTypography.headingMd.copyWith(color: AppColors.primary),
          ),
          const SizedBox(height: 8),
          Text(
            'Nhập mã xác thực gồm 6 chữ số từ ứng dụng Authenticator để kích hoạt tính năng bảo mật này.',
            style: AppTypography.caption.copyWith(color: AppColors.grey600),
          ),
          const SizedBox(height: 48),

          // 6 OTP boxes
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(6, (index) => _buildOtpBox(index)),
          ),
          const SizedBox(height: 48),

          EVButton(
            label: 'Xác minh và Kích hoạt',
            icon: Icons.verified_user_outlined,
            isLoading: _isLoading,
            onPressed: _otpCode.length == 6 ? _verifyCode : null,
          ),
          const SizedBox(height: 12),
          Center(
            child: TextButton(
              onPressed: () => setState(() => _currentStep = 1),
              child: const Text('Quay lại Bước 1'),
            ),
          ),
        ],
      );
    }

    // Step 3: Success and Backup codes
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 10),
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: AppColors.chargerAvailable.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_circle_outline, color: AppColors.chargerAvailable, size: 48),
          ),
        ),
        const SizedBox(height: 20),
        Center(
          child: Text(
            'Đã kích hoạt thành công!',
            style: AppTypography.headingMd.copyWith(color: AppColors.chargerAvailable),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Tài khoản của bạn đã được bảo vệ tuyệt đối bằng 2 lớp. Dưới đây là các mã khôi phục khẩn cấp. Hãy lưu giữ chúng ở nơi an toàn. Mỗi mã chỉ dùng được 1 lần để vượt qua 2FA nếu bạn mất điện thoại.',
          style: AppTypography.caption.copyWith(color: AppColors.grey600),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),

        // Backup Codes Card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: theme.cardColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.outlineLight),
          ),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _backupCodes.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 16,
              childAspectRatio: 3.5,
            ),
            itemBuilder: (context, index) {
              return Center(
                child: SelectableText(
                  _backupCodes[index],
                  style: AppTypography.caption.copyWith(
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.1,
                    fontFamily: 'monospace',
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 32),

        EVButton(
          label: 'Hoàn tất',
          icon: Icons.done,
          onPressed: () => Navigator.pop(context),
        ),
      ],
    );
  }

  Widget _buildOtpBox(int index) {
    return SizedBox(
      width: 44,
      height: 54,
      child: TextFormField(
        controller: _controllers[index],
        focusNode: _focusNodes[index],
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        maxLength: 1,
        style: AppTypography.headingLg.copyWith(
          fontWeight: FontWeight.w700,
        ),
        decoration: InputDecoration(
          counterText: '',
          contentPadding: EdgeInsets.zero,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.outlineLight),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.primary, width: 2),
          ),
        ),
        onChanged: (value) {
          if (value.isNotEmpty && index < 5) {
            _focusNodes[index + 1].requestFocus();
          } else if (value.isEmpty && index > 0) {
            _focusNodes[index - 1].requestFocus();
          }
          if (_otpCode.length == 6) {
            _verifyCode();
          }
          setState(() {});
        },
      ),
    );
  }
}
