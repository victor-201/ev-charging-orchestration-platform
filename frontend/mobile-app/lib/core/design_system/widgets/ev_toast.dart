import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Premium, compact, top-floating toast notification system.
/// Positions the toast just below the status bar (top padding + 16)
/// to avoid blocking bottom menu bars, action sheets, or navigation buttons.
class EVToast {
  static OverlayEntry? _currentOverlay;
  static Timer? _currentTimer;

  static void show(
    BuildContext context, {
    required String message,
    bool isError = false,
    IconData? icon,
  }) {
    // Dismiss the active toast immediately before displaying the new one
    _currentOverlay?.remove();
    _currentOverlay = null;
    _currentTimer?.cancel();
    _currentTimer = null;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Curated high-fidelity color tokens matching EVoltSync Glassmorphism spec
    final resolvedIcon = icon ?? (isError ? Icons.warning_amber_rounded : Icons.check_circle_outline_rounded);
    
    final resolvedBgColor = isDark 
        ? (isError ? const Color(0xFF3B1E22) : const Color(0xFF0C2E2B))
        : (isError ? const Color(0xFFFFF1F2) : const Color(0xFFECFDF5));
        
    final resolvedBorderColor = isError 
        ? AppColors.error.withValues(alpha: 0.3) 
        : AppColors.chargerAvailable.withValues(alpha: 0.3);
        
    final resolvedTextColor = isDark
        ? (isError ? const Color(0xFFFCA5A5) : const Color(0xFF34D399))
        : (isError ? const Color(0xFFE11D48) : const Color(0xFF059669));
        
    final resolvedIconColor = resolvedTextColor;

    final overlay = Overlay.of(context);
    late OverlayEntry entry;
    
    entry = OverlayEntry(
      builder: (context) {
        final topPadding = MediaQuery.of(context).padding.top;
        return Positioned(
          top: topPadding + 16,
          left: 20,
          right: 20,
          child: _ToastWidget(
            backgroundColor: resolvedBgColor,
            borderColor: resolvedBorderColor,
            iconColor: resolvedIconColor,
            textColor: resolvedTextColor,
            icon: resolvedIcon,
            message: message,
            onDismiss: () {
              if (_currentOverlay == entry) {
                entry.remove();
                _currentOverlay = null;
              }
            },
          ),
        );
      },
    );

    _currentOverlay = entry;
    overlay.insert(entry);
  }
}

class _ToastWidget extends StatefulWidget {
  final Color backgroundColor;
  final Color borderColor;
  final Color iconColor;
  final Color textColor;
  final IconData icon;
  final String message;
  final VoidCallback onDismiss;

  const _ToastWidget({
    required this.backgroundColor,
    required this.borderColor,
    required this.iconColor,
    required this.textColor,
    required this.icon,
    required this.message,
    required this.onDismiss,
  });

  @override
  State<_ToastWidget> createState() => _ToastWidgetState();
}

class _ToastWidgetState extends State<_ToastWidget> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _yAnimation;
  late Animation<double> _fadeAnimation;
  Timer? _dismissTimer;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
    );
    _yAnimation = Tween<double>(begin: -60, end: 0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
    );
    _fadeAnimation = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
    _controller.forward();

    // Auto dismiss start: trigger reverse animation at 2.6s so that it finishes at 3.0s
    _dismissTimer = Timer(const Duration(milliseconds: 2650), () {
      if (mounted) {
        _controller.reverse().then((_) {
          widget.onDismiss();
        });
      }
    });
  }

  @override
  void dispose() {
    _dismissTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Opacity(
          opacity: _fadeAnimation.value,
          child: Transform.translate(
            offset: Offset(0, _yAnimation.value),
            child: child,
          ),
        );
      },
      child: Material(
        color: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: widget.backgroundColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: widget.borderColor, width: 1.2),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              Icon(widget.icon, color: widget.iconColor, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  widget.message,
                  style: AppTypography.bodyMd.copyWith(
                    color: widget.textColor,
                    fontWeight: FontWeight.w700,
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
