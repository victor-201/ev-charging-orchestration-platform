import 'package:flutter/material.dart';

/// Evoltboard Liquid Glass Design System UI color tokens
abstract class AppColors {
  // ── Brand Accents & Gradients ─────────────────────────────────
  static const Color primaryCyan = Color(0xFF10BFC9);
  static const Color primaryLime = Color(0xFF9AED57);
  static const Color accentBlue = Color(0xFF4F7CFF);
  static const Color accentPurple = Color(0xFF8B5CF6);

  static const LinearGradient primaryGradient = LinearGradient(
    colors: [primaryCyan, primaryLime],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const Color primary = primaryCyan; // Fallback primary color
  static const Color onPrimary = Color(0xFFFFFFFF);

  // ── Status Indicators ─────────────────────────────────────────
  static const Color success = Color(0xFF22C55E);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
  static const Color info = Color(0xFF3B82F6);
  static const Color error = danger;
  static const Color onError = Color(0xFFFFFFFF);

  // ── Surface & Background (Dark Mode) ──────────────────────────
  static const Color backgroundDark = Color(0xFF121212);
  static const Color surfaceDark = Color(0xFF181818);
  static const Color cardDark = Color(0xFF1F1F1F);
  
  static const Color textPrimaryDark = Color(0xFFFFFFFF);
  static const Color textSecondaryDark = Color(0xFFB8B8B8);
  static const Color textMutedDark = Color(0xFF7D7D7D);

  static Color get glassBgDark => const Color(0xFFFFFFFF).withValues(alpha: 0.05);
  static Color get glassBorderDark => const Color(0xFFFFFFFF).withValues(alpha: 0.08);
  static Color get glassHighlightDark => const Color(0xFFFFFFFF).withValues(alpha: 0.14);

  // ── Surface & Background (Light Mode) ─────────────────────────
  static const Color backgroundLight = Color(0xFFFFFFFF);
  static const Color surfaceLight = Color(0xFFF5F7F8);
  static const Color cardLight = Color(0xFFEEF2F3);

  static const Color textPrimaryLight = Color(0xFF111111);
  static const Color textSecondaryLight = Color(0xFF4A4A4A);
  static const Color textMutedLight = Color(0xFF7A7A7A);

  static Color get glassBgLight => const Color(0xFFFFFFFF).withValues(alpha: 0.72);
  static Color get glassBorderLight => const Color(0xFFFFFFFF).withValues(alpha: 0.65);
  static Color get glassHighlightLight => const Color(0xFFFFFFFF).withValues(alpha: 0.90);

  // ── Auxiliary Styling Color Tokens ─────────────────────────
  static const Color white = Color(0xFFFFFFFF);
  static const Color black = Color(0xFF000000);

  // ── Charging Station Status Color Mapping ───────────
  static Color forChargerStatus(String status) {
    switch (status.toUpperCase()) {
      case 'AVAILABLE':
        return primaryLime;
      case 'IN_USE':
        return primaryCyan;
      case 'RESERVED':
        return warning;
      case 'OFFLINE':
        return textMutedDark;
      case 'FAULTED':
        return danger;
      default:
        return textMutedDark;
    }
  }

  // ── Charger Reservation State Color Helpers ───────────────
  static Color forBookingStatus(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING_PAYMENT':
        return warning;
      case 'CONFIRMED':
        return primaryLime;
      case 'COMPLETED':
        return primaryCyan;
      case 'CANCELLED':
        return textMutedDark;
      case 'EXPIRED':
        return textMutedDark;
      case 'NO_SHOW':
        return danger;
      default:
        return textMutedDark;
    }
  }

  // ── Backward Compatibility Tokens ─────────────────────────
  static const Color grey400 = textMutedLight;
  static const Color grey600 = textSecondaryLight;
  static const Color grey800 = textPrimaryLight;
  static const Color secondary = primaryLime;
  static const Color amber = warning;
  static const Color chargerAvailable = primaryLime;
  static const Color chargerInUse = primaryCyan;
  static const Color chargerReserved = warning;
  static const Color chargerOffline = textMutedLight;
  static const Color chargerFaulted = danger;
  static const Color outlineLight = Color(0xFFE0E0E0);
  static const Color outlineDark = Color(0xFF2C2C2C);
  static const Color primaryContainer = Color(0xFFB9F6CA);
  static const Color onPrimaryContainer = Color(0xFF00391A);
  static const Color secondaryContainer = Color(0xFFB3E5FC);
  static const Color errorContainer = Color(0xFFFFDAD6);
  static const Color successContainer = Color(0xFFE8F5E9);
  static const Color warningContainer = Color(0xFFFFE0B2);
  static const Color amberContainer = Color(0xFFFFF8E1);
}
