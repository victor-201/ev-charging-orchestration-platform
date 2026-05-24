import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// LiquidGlassScaffold — reusable background for all app screens
/// Applies the 3-layer radial + linear gradient background from
/// test.html spec. Wrap content with this widget.
class LiquidGlassScaffold extends StatelessWidget {
  final Widget child;
  final PreferredSizeWidget? appBar;
  final Widget? bottomNavigationBar;
  final Widget? floatingActionButton;
  final bool extendBodyBehindAppBar;
  final Color? backgroundColor;

  const LiquidGlassScaffold({
    super.key,
    required this.child,
    this.appBar,
    this.bottomNavigationBar,
    this.floatingActionButton,
    this.extendBodyBehindAppBar = true,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      extendBodyBehindAppBar: extendBodyBehindAppBar,
      appBar: appBar,
      bottomNavigationBar: bottomNavigationBar,
      floatingActionButton: floatingActionButton,
      backgroundColor: Colors.transparent,
      body: Container(
        width: double.infinity,
        height: double.infinity,
        color: isDark ? AppColors.bgDark : AppColors.bgLight,
        child: Stack(
          children: [
            // Layer 1: top-left radial glow
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: const Alignment(-0.75, -0.8),
                    radius: 1.0,
                    colors: [
                      isDark ? AppColors.bgGradDark1 : AppColors.bgGradLight1,
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.4],
                  ),
                ),
              ),
            ),
            // Layer 2: bottom-right radial glow
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: const Alignment(0.85, 0.85),
                    radius: 1.0,
                    colors: [
                      isDark ? AppColors.bgGradDark1 : AppColors.bgGradLight1,
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.4],
                  ),
                ),
              ),
            ),
            // Layer 3: 135° linear gradient
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      isDark ? AppColors.bgGradDark2 : AppColors.bgGradLight2,
                      isDark ? AppColors.bgGradDark3 : AppColors.bgGradLight3,
                    ],
                  ),
                ),
              ),
            ),
            // Content
            child,
          ],
        ),
      ),
    );
  }
}
