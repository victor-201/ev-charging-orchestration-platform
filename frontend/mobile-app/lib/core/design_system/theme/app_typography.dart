import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Global typography styles utilizing Google Fonts (Inter)
/// Font stack: Inter → SF Pro Display → sans-serif
abstract class AppTypography {
  static TextTheme get textTheme => TextTheme(
        // displayLarge — Hero numbers (40px)
        displayLarge: _inter(
          fontSize: 40,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
        // displayMedium — Sub-hero numbers (32px)
        displayMedium: _inter(
          fontSize: 32,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
        // headlineLarge — H3 Equivalents (24px)
        headlineLarge: _inter(
          fontSize: 24,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.3,
        ),
        // headlineMedium — Screen layout headers (20px)
        headlineMedium: _inter(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
        // bodyLarge — Main descriptive contents and input forms (16px)
        bodyLarge: _inter(
          fontSize: 16,
          fontWeight: FontWeight.w400,
        ),
        // bodyMedium — Auxiliary descriptions and subheadings (14px)
        bodyMedium: _inter(
          fontSize: 14,
          fontWeight: FontWeight.w400,
        ),
        // bodySmall — Timestamps, transactional metadata (12px)
        bodySmall: _inter(
          fontSize: 12,
          fontWeight: FontWeight.w400,
        ),
        // labelLarge — Capitalized status badge chips (12px)
        labelLarge: _inter(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          letterSpacing: 0.5,
        ),
      );

  static TextStyle _inter({
    required double fontSize,
    required FontWeight fontWeight,
    double? letterSpacing,
    Color? color,
  }) {
    return GoogleFonts.inter(
      fontSize: fontSize,
      fontWeight: fontWeight,
      letterSpacing: letterSpacing,
      color: color,
    );
  }

  // ── Auxiliary Typography Token Extensions ──────────────────
  static TextStyle get displayLg => _inter(
        fontSize: 40,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
      );

  static TextStyle get displayMd => _inter(
        fontSize: 32,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
      );

  static TextStyle get headingLg => _inter(
        fontSize: 24,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.3,
      );

  static TextStyle get headingMd => _inter(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
      );

  static TextStyle get bodyLg => _inter(
        fontSize: 16,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get bodyMd => _inter(
        fontSize: 14,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get caption => _inter(
        fontSize: 12,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get overline => _inter(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.8,
      );

  static TextStyle get labelMd => _inter(
        fontSize: 13,
        fontWeight: FontWeight.w500,
      );

  static TextStyle get labelSm => _inter(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.5,
      );
}
