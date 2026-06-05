import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../bloc/auth_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../widgets/auth_layout.dart';

/// Multi-Factor Authentication Verification Screen — Liquid Glass Design System
///
/// Features a 6-digit OTP input grid, automatic clipboard detection for seamless
/// paste action, and a QR code scanner overlay using camera.
class MFAVerifyScreen extends StatefulWidget {
  const MFAVerifyScreen({super.key});

  @override
  State<MFAVerifyScreen> createState() => _MFAVerifyScreenState();
}

class _MFAVerifyScreenState extends State<MFAVerifyScreen> {
  final List<TextEditingController> _controllers =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focusNodes =
      List.generate(6, (_) => FocusNode());
  String? _detectedClipboardCode;

  @override
  void initState() {
    super.initState();
    _checkClipboard();
    // Auto-focus first box
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _focusNodes[0].requestFocus();
      }
    });
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
              _submit();
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
    super.dispose();
  }

  Future<void> _checkClipboard() async {
    try {
      final data = await Clipboard.getData(Clipboard.kTextPlain);
      final text = data?.text?.trim().replaceAll(RegExp(r'\s+'), '') ?? '';
      if (text.length == 6 && RegExp(r'^\d{6}$').hasMatch(text)) {
        if (mounted) {
          setState(() {
            _detectedClipboardCode = text;
          });
        }
      }
    } catch (_) {}
  }

  void _pasteFromClipboard() {
    if (_detectedClipboardCode != null && _detectedClipboardCode!.length == 6) {
      HapticFeedback.lightImpact();
      for (int i = 0; i < 6; i++) {
        _controllers[i].text = _detectedClipboardCode![i];
      }
      _submit();
    }
  }

  String get _otpCode => _controllers.map((c) => c.text).join();

  void _submit() {
    final code = _otpCode;
    if (code.length == 6) {
      context.read<AuthBloc>().add(AuthMfaVerifyRequested(otpCode: code));
    }
  }

  void _openQRScanner() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.black,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return _MfaQRScannerSheet(
          onCodeScanned: (scannedCode) {
            Navigator.pop(sheetContext);
            HapticFeedback.mediumImpact();
            for (int i = 0; i < 6; i++) {
              _controllers[i].text = scannedCode[i];
            }
            _submit();
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return AuthLayout(
      onBackPressed: () => context.go('/auth/login'),
      child: BlocConsumer<AuthBloc, AuthState>(
        listener: (context, state) {
          if (state is AuthAuthenticated) {
            final savedRoute =
                HydratedBloc.storage.read('last_visited_route') as String?;
            if (savedRoute != null && savedRoute.isNotEmpty) {
              context.go(savedRoute);
            } else {
              context.go('/map');
            }
          } else if (state is AuthError) {
            EVToast.show(context, message: state.message, isError: true);
            for (final c in _controllers) {
              c.clear();
            }
            _focusNodes[0].requestFocus();
            _checkClipboard(); // Re-check clipboard in case they copied a new one
          }
        },
        builder: (context, state) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Premium Lock Shield Icon
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppColors.secondary.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppColors.secondary.withValues(alpha: 0.25),
                    width: 1.5,
                  ),
                ),
                child: const Icon(
                  Icons.security_outlined,
                  color: AppColors.secondary,
                  size: 32,
                ),
              ),
              const SizedBox(height: AppSpacing.md),

              Text(
                'Nhập mã xác thực',
                style: AppTypography.headingMd.copyWith(
                  fontWeight: FontWeight.w700,
                  fontSize: 18,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Nhập mã 6 chữ số từ ứng dụng Authenticator của bạn.',
                style: AppTypography.caption.copyWith(color: AppColors.grey600),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xl),

              // Floating Clipboard Auto-fill Pill
              if (_detectedClipboardCode != null) ...[
                GestureDetector(
                  onTap: _pasteFromClipboard,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      border: Border.all(
                        color: AppColors.primary.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.paste_rounded,
                          size: 15,
                          color: AppColors.primary,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Dán mã $_detectedClipboardCode',
                          style: AppTypography.labelMd.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
              ],

              // 6 Box Grid
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: List.generate(
                  6,
                  (index) => _buildOtpBox(index, isDark),
                ),
              ),
              const SizedBox(height: AppSpacing.md),

              // QR Code Scanner Action
              Center(
                child: TextButton.icon(
                  onPressed: _openQRScanner,
                  icon: const Icon(Icons.qr_code_scanner_outlined, size: 20),
                  label: Text(
                    'Quét mã QR OTP',
                    style: AppTypography.labelMd.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),

              EVButton(
                label: 'Xác nhận',
                icon: Icons.login_outlined,
                onPressed: _otpCode.length == 6 ? _submit : null,
                isLoading: state is AuthLoading,
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildOtpBox(int index, bool isDark) {
    return SizedBox(
      width: 32,
      height: 48,
      child: TextFormField(
        controller: _controllers[index],
        focusNode: _focusNodes[index],
        keyboardType: TextInputType.number,
        textInputAction: index < 5 ? TextInputAction.next : TextInputAction.done,
        textAlign: TextAlign.center,
        maxLength: 1,
        style: AppTypography.headingMd.copyWith(
          fontWeight: FontWeight.w800,
          fontSize: 18,
          color: isDark ? Colors.white : AppColors.pillTextLight,
        ),
        decoration: InputDecoration(
          counterText: '',
          filled: true,
          fillColor: isDark 
              ? Colors.black.withValues(alpha: 0.25) 
              : AppColors.bgLight.withValues(alpha: 0.6),
          contentPadding: EdgeInsets.zero,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(
              color: AppColors.primary.withValues(alpha: 0.35),
              width: 1.2,
            ),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(
              color: AppColors.primary.withValues(alpha: 0.35),
              width: 1.2,
            ),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
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
            _submit();
          }
          setState(() {});
        },
        onFieldSubmitted: (value) {
          if (_otpCode.length == 6) {
            _submit();
          }
        },
      ),
    );
  }
}

/// Custom Bottom Sheet containing the camera scanner
class _MfaQRScannerSheet extends StatefulWidget {
  final ValueChanged<String> onCodeScanned;
  const _MfaQRScannerSheet({required this.onCodeScanned});

  @override
  State<_MfaQRScannerSheet> createState() => _MfaQRScannerSheetState();
}

class _MfaQRScannerSheetState extends State<_MfaQRScannerSheet> {
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
                // Find 6-digit numbers in the scanned content
                final regExp = RegExp(r'\b\d{6}\b');
                final match = regExp.firstMatch(code);
                if (match != null) {
                  _detected = true;
                  _controller.stop();
                  widget.onCodeScanned(match.group(0)!);
                } else {
                  EVToast.show(context,
                      message: 'Không tìm thấy mã OTP 6 chữ số trong QR.',
                      isError: true);
                }
              }
            },
          ),

          // Scanning Overlay Guideline
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
                color: Colors.black54,
                shape: BoxShape.circle,
              ),
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
                color: Colors.black54,
                shape: BoxShape.circle,
              ),
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
                  'Đặt mã QR OTP vào khung để quét',
                  style: AppTypography.headingMd.copyWith(color: Colors.white),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Quét mã QR chứa mã xác thực 6 chữ số để tự động đăng nhập.',
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
