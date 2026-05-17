import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Global typography styles utilizing Google Fonts (Be Vietnam Pro)
/// Font stack: Be Vietnam Pro → Roboto → sans-serif
abstract class AppTypography {
  static TextTheme get textTheme => TextTheme(
        // displayLg — VND currency charging session meters
        displayLarge: _beVietnamPro(
          fontSize: 32,
          fontWeight: FontWeight.w700,
        ),
        // displayMd — Wallet ledger balances
        displayMedium: _beVietnamPro(
          fontSize: 24,
          fontWeight: FontWeight.w700,
        ),
        // headingLg — AppBar and screen layout headers
        headlineLarge: _beVietnamPro(
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
        // headingMd — Card titles and dashboard section headers
        headlineMedium: _beVietnamPro(
          fontSize: 17,
          fontWeight: FontWeight.w600,
        ),
        // bodyLg — Main descriptive contents and input forms
        bodyLarge: _beVietnamPro(
          fontSize: 16,
          fontWeight: FontWeight.w400,
        ),
        // bodyMd — Auxiliary descriptions and subheadings
        bodyMedium: _beVietnamPro(
          fontSize: 14,
          fontWeight: FontWeight.w400,
        ),
        // bodySmall — Timestamps, transactional metadata, and indices
        bodySmall: _beVietnamPro(
          fontSize: 12,
          fontWeight: FontWeight.w400,
        ),
        // labelLarge — Capitalized status badge chips
        labelLarge: _beVietnamPro(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          letterSpacing: 0.8,
        ),
      );

  static TextStyle _beVietnamPro({
    required double fontSize,
    required FontWeight fontWeight,
    double? letterSpacing,
    Color? color,
  }) {
    return GoogleFonts.beVietnamPro(
      fontSize: fontSize,
      fontWeight: fontWeight,
      letterSpacing: letterSpacing,
      color: color,
    );
  }

  // ── Auxiliary Typography Token Extensions ──────────────────
  static TextStyle get displayLg => _beVietnamPro(
        fontSize: 32,
        fontWeight: FontWeight.w700,
      );

  static TextStyle get displayMd => _beVietnamPro(
        fontSize: 24,
        fontWeight: FontWeight.w700,
      );

  static TextStyle get headingLg => _beVietnamPro(
        fontSize: 20,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get headingMd => _beVietnamPro(
        fontSize: 17,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get bodyLg => _beVietnamPro(
        fontSize: 16,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get bodyMd => _beVietnamPro(
        fontSize: 14,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get caption => _beVietnamPro(
        fontSize: 12,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get overline => _beVietnamPro(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.8,
      );

  static TextStyle get labelMd => _beVietnamPro(
        fontSize: 13,
        fontWeight: FontWeight.w500,
      );

  static TextStyle get labelSm => _beVietnamPro(
        fontSize: 11,
        fontWeight: FontWeight.w500,
      );
}
