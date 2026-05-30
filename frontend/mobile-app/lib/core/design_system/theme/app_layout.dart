import 'package:flutter/widgets.dart';

// ── Unified App Layout Dimension Tokens ───────────────────────
abstract class AppLayout {
  /// Standard header (AppBar) height in logical pixels
  static const double headerHeight = 56.0;

  /// Standard bottom navigation bar height (excluding bottom margin/padding)
  static const double barHeight = 72.0;

  /// Standard screen side padding (md)
  static const double sidePadding = 16.0;

  /// Dynamically calculates the perfect top padding to clear the transparent AppBar
  static double topPadding(BuildContext context) {
    return headerHeight;
  }

  /// Dynamically calculates the perfect bottom padding to clear the floating glass navbar completely
  static double bottomPadding(BuildContext context) {
    return barHeight * 1.6;
  }

  /// Dynamic padding for pages WITH transparent AppBar and NO persistent bottom navbar
  static EdgeInsets paddingWithHeader(BuildContext context) {
    return EdgeInsets.fromLTRB(
      sidePadding,
      topPadding(context),
      sidePadding,
      0.0,
    );
  }

  /// Dynamic padding for pages WITH transparent AppBar AND persistent bottom navbar
  static EdgeInsets paddingWithHeaderAndNavbar(BuildContext context) {
    return EdgeInsets.fromLTRB(
      sidePadding,
      topPadding(context),
      sidePadding,
      bottomPadding(context),
    );
  }

  /// Dynamic padding for pages WITH NO AppBar (custom header in body) and persistent bottom navbar
  static EdgeInsets paddingWithNavbar(BuildContext context) {
    return EdgeInsets.fromLTRB(
      sidePadding,
      0.0,
      sidePadding,
      bottomPadding(context),
    );
  }
}
