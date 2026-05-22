import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import 'glass_container.dart';

/// Animated surface container with Liquid Glass aesthetic
class EVCard extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final Color? backgroundColor;
  final double? elevation;
  final BorderRadius? borderRadius;

  const EVCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding,
    this.margin,
    this.backgroundColor,
    this.elevation,
    this.borderRadius,
  });

  @override
  State<EVCard> createState() => _EVCardState();
}

class _EVCardState extends State<EVCard> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 150),
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.98).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    if (widget.onTap != null) _controller.forward();
  }

  void _onTapUp(TapUpDetails details) {
    if (widget.onTap != null) {
      _controller.reverse();
      widget.onTap!();
    }
  }

  void _onTapCancel() {
    if (widget.onTap != null) _controller.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final radius = widget.borderRadius ?? BorderRadius.circular(AppRadius.xl);

    Widget cardContent = GlassContainer(
      margin: widget.margin,
      padding: EdgeInsets.zero, // Padding handled by internal inkwell/container
      borderRadius: radius,
      enableBlur: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: radius,
          onTap: widget.onTap == null ? null : () {}, // Handled by gesture detector
          splashColor: AppColors.primaryCyan.withValues(alpha: 0.1),
          highlightColor: Colors.transparent,
          child: Padding(
            padding: widget.padding ?? const EdgeInsets.all(AppSpacing.lg),
            child: widget.child,
          ),
        ),
      ),
    );

    if (widget.onTap == null) return cardContent;

    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      child: ScaleTransition(
        scale: _scaleAnimation,
        child: cardContent,
      ),
    );
  }
}

/// Status indicator badge mapping operational charger state colors
class ChargerStatusChip extends StatelessWidget {
  final String status;

  const ChargerStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final color = AppColors.forChargerStatus(status);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.5),
                  blurRadius: 4,
                )
              ]
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          Text(
            _label,
            style: AppTypography.overline.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  String get _label {
    switch (status.toUpperCase()) {
      case 'AVAILABLE':
        return 'TRỐNG';
      case 'IN_USE':
        return 'ĐANG SẠC';
      case 'RESERVED':
        return 'ĐÃ ĐẶT';
      case 'OFFLINE':
        return 'NGOẠI TUYẾN';
      case 'FAULTED':
        return 'LỖI';
      default:
        return status.toUpperCase();
    }
  }
}

/// Status indicator badge mapping reservation state colors
class BookingStatusBadge extends StatelessWidget {
  final String status;

  const BookingStatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final color = AppColors.forBookingStatus(status);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Text(
        _label,
        style: AppTypography.overline.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  String get _label {
    switch (status.toUpperCase()) {
      case 'PENDING_PAYMENT':
        return 'CHỜ THANH TOÁN';
      case 'CONFIRMED':
        return 'ĐÃ XÁC NHẬN';
      case 'COMPLETED':
        return 'HOÀN THÀNH';
      case 'CANCELLED':
        return 'ĐÃ HỦY';
      case 'EXPIRED':
        return 'HẾT HẠN';
      case 'NO_SHOW':
        return 'KHÔNG ĐẾN';
      default:
        return status.toUpperCase();
    }
  }
}

