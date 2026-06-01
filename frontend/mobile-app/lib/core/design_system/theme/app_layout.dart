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
    return MediaQuery.of(context).padding.top + headerHeight;
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

  /// Dynamic padding for pages WITH NO AppBar and NO persistent bottom navbar (just system safe area bottom)
  static EdgeInsets paddingWithSafeArea(BuildContext context) {
    return EdgeInsets.fromLTRB(
      sidePadding,
      0.0,
      sidePadding,
      MediaQuery.of(context).padding.bottom + 16.0,
    );
  }

  /// Unified padding for Bottom Sheets, clearing system bottom bar (safe area) but not the floating navbar
  static EdgeInsets paddingForBottomSheet(BuildContext context) {
    return EdgeInsets.fromLTRB(
      sidePadding,
      12.0, // small space below drag handle
      sidePadding,
      MediaQuery.of(context).padding.bottom + 16.0,
    );
  }

  /// Dynamic padding for Bottom Sheets that contain TextFields, adjusting for keyboard insets
  static EdgeInsets paddingForBottomSheetWithKeyboard(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return EdgeInsets.fromLTRB(
      sidePadding,
      12.0, // small space below drag handle
      sidePadding,
      bottomInset > 0 ? (bottomInset + 16.0) : (MediaQuery.of(context).padding.bottom + 16.0),
    );
  }
}
