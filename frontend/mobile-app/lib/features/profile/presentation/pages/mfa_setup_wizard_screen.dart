import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get_it/get_it.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:url_launcher/url_launcher.dart';
import '../bloc/profile_bloc.dart';
import '../../domain/repositories/i_profile_repository.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/ev_header.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../../../../core/design_system/widgets/glass_container.dart';

/// Step-by-Step Multi-Factor Authentication Setup and Configuration Wizard Screen
///
/// Features detailed setup tutorials, dynamic QR codes, backup token grids,
/// deep-linking to popular Authenticator apps, and camera-based QR scanning support.
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

  final List<TextEditingController> _controllers =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focusNodes =
      List.generate(6, (_) => FocusNode());

  // Disable tab
  final _passwordCtrl = TextEditingController();
  bool _showPassword = false;

  @override
  void initState() {
    super.initState();
    if (!widget.isCurrentlyEnabled) {
      _fetchMfaSetup();
    }
    // Initialize focus node listeners to handle backspace on empty boxes and enter key to submit
    for (int i = 0; i < 6; i++) {
      _focusNodes[i].onKeyEvent = (node, event) {
        if (event is KeyDownEvent) {
          if (event.logicalKey == LogicalKeyboardKey.backspace) {
            if (_controllers[i].text.isEmpty && i > 0) {
              _controllers[i - 1].clear();
              _focusNodes[i - 1].requestFocus();
              setState(() {});
              return KeyEventResult.handled;
            }
          } else if (event.logicalKey == LogicalKeyboardKey.enter || event.logicalKey == LogicalKeyboardKey.numpadEnter) {
            if (_otpCode.length == 6) {
              _verifyCode();
              return KeyEventResult.handled;
            }
          }
        }
        return KeyEventResult.ignored;
      };
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
        EVToast.show(context, message: failure.message, isError: true);
      },
      (data) {
        setState(() {
          _secret = data['secret']?.toString();
          _otpauthUrl = data['otpAuthUrl']?.toString() ?? data['otpauth_url']?.toString();
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
        EVToast.show(context, message: failure.message, isError: true);
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
        EVToast.show(context, message: failure.message, isError: true);
      },
      (_) {
        setState(() => _isLoading = false);
        context.read<ProfileBloc>().add(const ProfileLoad());
        EVToast.show(context,
            message: 'Đã tắt bảo mật 2 lớp thành công.', isError: false);
        Navigator.pop(context);
      },
    );
  }

  void _copySecretToClipboard() {
    if (_secret != null) {
      Clipboard.setData(ClipboardData(text: _secret!));
      HapticFeedback.lightImpact();
      EVToast.show(context, message: 'Đã sao chép khóa bí mật!', isError: false);
    }
  }

  Future<void> _openAuthenticatorApp() async {
    if (_otpauthUrl == null) return;
    final url = Uri.parse(_otpauthUrl!);
    if (await canLaunchUrl(url)) {
      HapticFeedback.selectionClick();
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      if (mounted) {
        EVToast.show(context,
            message:
                'Không thể tự động mở Authenticator. Hãy cài đặt Google hoặc Microsoft Authenticator.',
            isError: true);
      }
    }
  }

  void _openSetupQRScanner() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.black,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return _MfaSetupQRScannerSheet(
          onSecretScanned: (scannedSecret, scannedUrl) {
            Navigator.pop(sheetContext);
            HapticFeedback.mediumImpact();
            setState(() {
              _secret = scannedSecret;
              _otpauthUrl = scannedUrl ?? _otpauthUrl;
              _currentStep = 2; // Move directly to step 2 verification!
            });
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _focusNodes[0].requestFocus();
            });
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return LiquidGlassScaffold(
      extendBodyBehindAppBar: true,
      appBar: EVHeader(
        title: widget.isCurrentlyEnabled
            ? 'Tắt bảo mật 2 lớp'
            : 'Thiết lập bảo mật 2 lớp',
        showBackButton: true,
        onBackTapped: () => Navigator.pop(context),
      ),
      child: SafeArea(
        child: _isLoading && _secret == null
            ? const Center(
                child: CircularProgressIndicator(color: AppColors.primary))
            : SingleChildScrollView(
                padding: AppLayout.paddingWithHeader(context),
                child: widget.isCurrentlyEnabled
                    ? _buildDisableFlow(theme)
                    : _buildSetupFlow(theme),
              ),
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
            child: const Icon(Icons.warning_amber_rounded,
                color: AppColors.error, size: 36),
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
              icon: Icon(
                  _showPassword ? Icons.visibility_off : Icons.visibility),
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
    final isDark = theme.brightness == Brightness.dark;

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
            'Sử dụng ứng dụng Authenticator (Google/Microsoft) để quét mã QR dưới đây, hoặc liên kết tự động bằng nút mở ứng dụng.',
            style: AppTypography.caption.copyWith(color: AppColors.grey600),
          ),
          const SizedBox(height: 24),

          // QR Code Card
          if (_otpauthUrl != null)
            Center(
              child: Container(
                padding: const EdgeInsets.all(16.0),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.15),
                      blurRadius: 20,
                    ),
                  ],
                ),
                child: QrImageView(
                  data: _otpauthUrl!,
                  version: QrVersions.auto,
                  size: 200.0,
                  eyeStyle: const QrEyeStyle(
                    eyeShape: QrEyeShape.square,
                    color: Colors.black,
                  ),
                ),
              ),
            ),
          const SizedBox(height: 24),

          // Secret Key Box with Copy Action
          if (_secret != null) ...[
            Center(
              child: Text(
                'Khóa bí mật:',
                style: AppTypography.caption.copyWith(
                  fontWeight: FontWeight.bold,
                  color: AppColors.grey600,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
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
                        color: isDark ? Colors.white : AppColors.pillTextLight,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  onPressed: _copySecretToClipboard,
                  icon: const Icon(Icons.copy_rounded, size: 20),
                  tooltip: 'Sao chép khóa',
                ),
              ],
            ),
          ],
          const SizedBox(height: 32),

          // Quick actions container
          GlassContainer(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              children: [
                EVButton(
                  label: 'Liên kết nhanh (Mở Authenticator)',
                  icon: Icons.open_in_new_outlined,
                  variant: EVButtonVariant.secondary,
                  onPressed: _openAuthenticatorApp,
                ),
                const SizedBox(height: AppSpacing.sm),
                EVButton(
                  label: 'Quét mã QR từ máy tính',
                  icon: Icons.qr_code_scanner_outlined,
                  variant: EVButtonVariant.secondary,
                  onPressed: _openSetupQRScanner,
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),

          EVButton(
            label: 'Tiếp tục bước xác minh',
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
            children: List.generate(6, (index) => _buildOtpBox(index, isDark)),
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
            child: const Icon(Icons.check_circle_outline,
                color: AppColors.chargerAvailable, size: 48),
          ),
        ),
        const SizedBox(height: 20),
        Center(
          child: Text(
            'Đã kích hoạt thành công!',
            style: AppTypography.headingMd
                .copyWith(color: AppColors.chargerAvailable),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Tài khoản của bạn đã được bảo vệ bằng 2 lớp. Dưới đây là các mã khôi phục khẩn cấp. Hãy lưu giữ chúng ở nơi an toàn. Mỗi mã chỉ dùng được 1 lần để vượt qua 2FA nếu bạn mất thiết bị.',
          style: AppTypography.caption.copyWith(color: AppColors.grey600),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),

        // Backup Codes Card
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: theme.cardColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.outlineLight),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.05),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            children: [
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _backupCodes.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 16,
                  childAspectRatio: 3.5,
                ),
                itemBuilder: (context, index) {
                  return Container(
                    decoration: BoxDecoration(
                      color: isDark ? Colors.white10 : AppColors.grey200,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Center(
                      child: SelectableText(
                        _backupCodes[index],
                        style: AppTypography.bodyMd.copyWith(
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.2,
                          fontFamily: 'monospace',
                          color: isDark ? Colors.white : AppColors.pillTextLight,
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: EVButton(
                      label: 'Sao chép tất cả',
                      icon: Icons.copy_all_rounded,
                      variant: EVButtonVariant.secondary,
                      onPressed: () {
                        if (_backupCodes.isNotEmpty) {
                          Clipboard.setData(ClipboardData(text: _backupCodes.join('\n')));
                          HapticFeedback.lightImpact();
                          EVToast.show(context,
                              message: 'Đã sao chép tất cả mã khôi phục!',
                              isError: false);
                        }
                      },
                    ),
                  ),
                ],
              ),
            ],
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

  Widget _buildOtpBox(int index, bool isDark) {
    return SizedBox(
      width: 44,
      height: 54,
      child: TextFormField(
        controller: _controllers[index],
        focusNode: _focusNodes[index],
        keyboardType: TextInputType.number,
        textInputAction: index < 5 ? TextInputAction.next : TextInputAction.done,
        textAlign: TextAlign.center,
        maxLength: 1,
        style: AppTypography.headingLg.copyWith(
          fontWeight: FontWeight.w700,
          color: isDark ? Colors.white : AppColors.pillTextLight,
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
        onFieldSubmitted: (value) {
          if (_otpCode.length == 6) {
            _verifyCode();
          }
        },
      ),
    );
  }
}

/// Custom setup QR code scanner sheet
class _MfaSetupQRScannerSheet extends StatefulWidget {
  final void Function(String secret, String? otpauthUrl) onSecretScanned;
  const _MfaSetupQRScannerSheet({required this.onSecretScanned});

  @override
  State<_MfaSetupQRScannerSheet> createState() =>
      _MfaSetupQRScannerSheetState();
}

class _MfaSetupQRScannerSheetState extends State<_MfaSetupQRScannerSheet> {
  final MobileScannerController _controller = MobileScannerController();
  bool _detected = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      height: MediaQuery.of(context).size.height * 0.85,
      child: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) {
              if (_detected) return;
              final code = capture.barcodes.firstOrNull?.rawValue?.trim();
              if (code != null) {
                String? parsedSecret;
                String? parsedUrl;
                if (code.startsWith('otpauth://')) {
                  try {
                    final uri = Uri.parse(code);
                    parsedSecret = uri.queryParameters['secret'];
                    parsedUrl = code;
                  } catch (_) {}
                } else if (RegExp(r'^[A-Z2-7]{16,64}$', caseSensitive: false)
                    .hasMatch(code)) {
                  parsedSecret = code.toUpperCase();
                }

                if (parsedSecret != null) {
                  _detected = true;
                  _controller.stop();
                  widget.onSecretScanned(parsedSecret, parsedUrl);
                } else {
                  EVToast.show(context,
                      message: 'Định dạng mã QR thiết lập MFA không hợp lệ.',
                      isError: true);
                }
              }
            },
          ),
          Center(
            child: SizedBox(
              width: 240,
              height: 240,
              child: Stack(
                children: [
                  ..._buildCorners(),
                ],
              ),
            ),
          ),
          Positioned(
            top: 20,
            right: 20,
            child: Container(
              decoration: const BoxDecoration(
                  color: Colors.black54, shape: BoxShape.circle),
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 24),
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ),
          Positioned(
            top: 20,
            left: 20,
            child: Container(
              decoration: const BoxDecoration(
                  color: Colors.black54, shape: BoxShape.circle),
              child: IconButton(
                icon: ValueListenableBuilder<MobileScannerState>(
                  valueListenable: _controller,
                  builder: (_, state, __) => Icon(
                    state.torchState == TorchState.on
                        ? Icons.flash_on
                        : Icons.flash_off,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
                onPressed: _controller.toggleTorch,
              ),
            ),
          ),
          Positioned(
            bottom: 60,
            left: 20,
            right: 20,
            child: Column(
              children: [
                Text(
                  'Quét mã QR thiết lập MFA',
                  style: AppTypography.headingMd.copyWith(color: Colors.white),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Quét mã QR từ máy tính hoặc thiết bị khác chứa thông tin liên kết bảo mật 2 yếu tố (MFA).',
                  style: AppTypography.caption.copyWith(color: AppColors.grey400),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildCorners() {
    const size = 20.0;
    const strokeWidth = 3.0;
    const color = AppColors.secondary;

    return [
      Positioned(
        top: 0,
        left: 0,
        child: Container(
          width: size,
          height: size,
          decoration: const BoxDecoration(
            border: Border(
              top: BorderSide(color: color, width: strokeWidth),
              left: BorderSide(color: color, width: strokeWidth),
            ),
          ),
        ),
      ),
      Positioned(
        top: 0,
        right: 0,
        child: Container(
          width: size,
          height: size,
          decoration: const BoxDecoration(
            border: Border(
              top: BorderSide(color: color, width: strokeWidth),
              right: BorderSide(color: color, width: strokeWidth),
            ),
          ),
        ),
      ),
      Positioned(
        bottom: 0,
        left: 0,
        child: Container(
          width: size,
          height: size,
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(color: color, width: strokeWidth),
              left: BorderSide(color: color, width: strokeWidth),
            ),
          ),
        ),
      ),
      Positioned(
        bottom: 0,
        right: 0,
        child: Container(
          width: size,
          height: size,
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(color: color, width: strokeWidth),
              right: BorderSide(color: color, width: strokeWidth),
            ),
          ),
        ),
      ),
    ];
  }
}
