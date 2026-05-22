import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// GlassSquare — Gradient stat/metric card tile
/// Matches test.html .square pattern: 140×140, gradient bg,
/// diagonal shine overlay (::after), and matching glow shadow.
class GlassSquare extends StatefulWidget {
  final LinearGradient gradient;
  final Color shadowColor;
  final List<Widget> children;
  final double size;
  final VoidCallback? onTap;

  const GlassSquare({
    super.key,
    required this.gradient,
    required this.shadowColor,
    required this.children,
    this.size = 140,
    this.onTap,
  });

  @override
  State<GlassSquare> createState() => _GlassSquareState();
}

class _GlassSquareState extends State<GlassSquare>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 150),
      lowerBound: 0.0,
      upperBound: 1.0,
    );
    _scale = Tween<double>(begin: 1.0, end: 1.04).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return GestureDetector(
      onTapDown: (_) => _controller.forward(),
      onTapUp: (_) {
        _controller.reverse();
        widget.onTap?.call();
      },
      onTapCancel: () => _controller.reverse(),
      child: AnimatedBuilder(
        animation: _scale,
        builder: (context, child) => Transform.scale(
          scale: _scale.value,
          child: child,
        ),
        child: Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(
            gradient: widget.gradient,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(
              color: isDark
                  ? AppColors.cardBorderDark
                  : Colors.white.withValues(alpha: 0.6),
              width: 1.5,
            ),
            boxShadow: [
              // Inset top highlight
              BoxShadow(
                color: Colors.white.withValues(
                    alpha: isDark ? 0.2 : 0.9),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
              // Colored glow
              BoxShadow(
                color: widget.shadowColor,
                blurRadius: 30,
                offset: const Offset(0, 20),
              ),
            ],
          ),
          child: Stack(
            children: [
              // Diagonal shine overlay (::after equivalent)
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(28),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Colors.white.withValues(
                            alpha: isDark ? 0.1 : 0.6),
                        Colors.transparent,
                      ],
                      stops: const [0.0, 0.4],
                    ),
                  ),
                ),
              ),
              // Content
              Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: widget.children,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
