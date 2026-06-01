import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../../../../core/utils/qr_validator.dart';

/// QR Scanning Camera Screen
///
/// Handles two walk-in charging flows:
///
/// Flow 2 — Walk-in (no booking):
///   Scans QR code physically printed on the charger pole.
///   QR format: EVCHARGER-{uuid} — encodes the connector (chargerId).
///   → Navigates to ActiveSessionScreen with chargerId to start session immediately.
///
/// Note: Booking QR (Flow 1) is NOT scanned here.
///   In Flow 1, the USER shows their QR in booking_detail_screen.dart,
///   and the KIOSK device scans it using its own camera.
class QRScanScreen extends StatefulWidget {
  const QRScanScreen({super.key});

  @override
  State<QRScanScreen> createState() => _QRScanScreenState();
}

class _QRScanScreenState extends State<QRScanScreen>
    with SingleTickerProviderStateMixin {
  final MobileScannerController _cameraController =
      MobileScannerController();
  bool _scanned = false;
  late AnimationController _scanAnimController;
  late Animation<double> _scanAnimation;

  @override
  void initState() {
    super.initState();
    _scanAnimController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
    _scanAnimation = Tween<double>(begin: 0, end: 240).animate(
      CurvedAnimation(
          parent: _scanAnimController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _cameraController.dispose();
    _scanAnimController.dispose();
    super.dispose();
  }

  void _onBarcodeDetected(BarcodeCapture capture) {
    if (_scanned) return;
    final code = capture.barcodes.firstOrNull?.rawValue;
    if (code == null) return;

    // Flow 2 — Walk-in: QR on the physical charger pole (EVCHARGER-{uuid})
    if (QrValidator.isChargerQr(code)) {
      final chargerId = QrValidator.extractChargerId(code)!;
      setState(() => _scanned = true);
      _cameraController.stop();
      _navigateToWalkInSession(chargerId);
      return;
    }

    // Booking QR detected — but user's app should NOT scan this.
    // The booking QR is shown BY the app and scanned BY the kiosk camera.
    if (QrValidator.isBookingQr(code)) {
      _showError(
        'Đây là mã QR đặt lịch. Hãy đưa điện thoại cho kiosk tại trạm để quét.',
      );
      return;
    }

    _showError('Mã QR không hợp lệ. Vui lòng quét mã trên cột sạc.');
  }

  /// Flow 2: Walk-in — user scanned charger pole QR, start session directly.
  void _navigateToWalkInSession(String chargerId) {
    EVToast.show(
      context,
      message: 'Đã nhận mã trụ sạc! Đang khởi động phiên sạc...',
      isError: false,
    );
    Future.delayed(const Duration(seconds: 1), () {
      if (mounted) {
        context.go(
          '/charging/session/new',
          extra: {'chargerId': chargerId, 'mode': 'walkin'},
        );
      }
    });
  }

  void _showError(String message) {
    EVToast.show(context, message: message, isError: true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _scanned = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Quét mã trụ sạc'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
        actions: [
          IconButton(
            icon: ValueListenableBuilder<MobileScannerState>(
              valueListenable: _cameraController,
              builder: (_, state, __) => Icon(
                state.torchState == TorchState.on
                    ? Icons.flash_on
                    : Icons.flash_off,
                color: Colors.white,
              ),
            ),
            onPressed: _cameraController.toggleTorch,
          ),
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _cameraController,
            onDetect: _onBarcodeDetected,
          ),

          // Dimmed overlay with cutout
          ColorFiltered(
            colorFilter: ColorFilter.mode(
              Colors.black.withValues(alpha: 0.4),
              BlendMode.srcOut,
            ),
            child: Stack(
              children: [
                Container(
                  decoration: const BoxDecoration(
                    color: Colors.black,
                    backgroundBlendMode: BlendMode.dstOut,
                  ),
                ),
                Center(
                  child: Container(
                    width: 260,
                    height: 260,
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Scan frame corners + animated line
          Center(
            child: SizedBox(
              width: 260,
              height: 260,
              child: Stack(
                children: [
                  ..._buildCorners(),
                  AnimatedBuilder(
                    animation: _scanAnimation,
                    builder: (_, __) => Positioned(
                      top: _scanAnimation.value,
                      left: 0,
                      right: 0,
                      child: Container(
                        height: 2,
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              Colors.transparent,
                              AppColors.secondary,
                              Colors.transparent,
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Instruction label
          Positioned(
            bottom: 140,
            left: 0,
            right: 0,
            child: Column(
              children: [
                Text(
                  'Quét mã QR trên cột sạc',
                  style: AppTypography.bodyMd.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                Text(
                  'Mã QR dán/in trên thân cột sạc (không phải mã đặt lịch)',
                  style: AppTypography.caption.copyWith(
                    color: Colors.white70,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),

          // Info banner at bottom
          Positioned(
            bottom: 40,
            left: 24,
            right: 24,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: AppColors.secondary, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Đã đặt lịch trước? Vào Đặt lịch → Chi tiết → hiển thị mã QR cho kiosk quét.',
                      style: AppTypography.caption.copyWith(color: Colors.white70),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildCorners() {
    const size = 24.0;
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
