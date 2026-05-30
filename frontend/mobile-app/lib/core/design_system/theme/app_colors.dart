import 'package:flutter/material.dart';

/// EVoltSync — Liquid Glass Design System · Color Tokens
/// Light Mode: slate-200 base | Dark Mode: navy-950 base
abstract class AppColors {
  // ── Brand colors ──────────────────────────────────────────────
  static const cyan   = Color(0xFF10BFC9);
  static const lime   = Color(0xFF19BE4B);
  static const pink   = Color(0xFFFD6585);
  static const orange = Color(0xFFFDA085);
  static const blue   = Color(0xFF66A6FF);
  static const yellow = Color(0xFFF6D365);
  static const purple = Color(0xFFA855F7);

  // ── Gradients ─────────────────────────────────────────────────
  static const cyanLimeGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [cyan, lime],
  );
  static const orangePinkGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFFFD3A5), pink],
  );
  static const blueCyanGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF89F7FE), blue],
  );
  static const yellowOrangeGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [yellow, orange],
  );
  static const purpleGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [purple, Color(0xFF7E22CE)],
  );

  // ── Background — Light ────────────────────────────────────────
  static const bgLight      = Color(0xFFE2E8F0);
  static const bgGradLight1 = Color(0xB3FFFFFF);
  static const bgGradLight2 = Color(0xFFF1F5F9);
  static const bgGradLight3 = Color(0xFFCBD5E1);

  // ── Background — Dark ─────────────────────────────────────────
  static const bgDark       = Color(0xFF0F172A);
  static const bgGradDark1  = Color(0x2610BFC9);
  static const bgGradDark2  = Color(0xFF1E293B);
  static const bgGradDark3  = Color(0xFF020617);

  // ── Glass Cards ───────────────────────────────────────────────
  static const cardLight       = Color(0x66FFFFFF);
  static const cardBorderLight = Color(0xCCFFFFFF);
  static const cardDark        = Color(0x990F172A);
  static const cardBorderDark  = Color(0x1AFFFFFF);

  // ── Glass Pill — Light ────────────────────────────────────────
  static const pillBgLight     = Color(0x4DFFFFFF);
  static const pillBorderLight = Color(0xB3FFFFFF);
  static const pillTextLight   = Color(0xFF1E293B);

  // ── Glass Pill — Dark ─────────────────────────────────────────
  static const pillBgDark     = Color(0x801E293B);
  static const pillBorderDark = Color(0x1AFFFFFF);
  static const pillTextDark   = Color(0xFFF1F5F9);

  // ── Dark Pill ─────────────────────────────────────────────────
  static const darkPillBgLight     = Color(0x991E293B);
  static const darkPillBorderLight = Color(0x33FFFFFF);
  static const darkPillTextLight   = Colors.white;
  static const darkPillBgDark      = Color(0x1AFFFFFF);
  static const darkPillBorderDark  = Color(0x1AFFFFFF);
  static const darkPillTextDark    = Color(0xFFF8FAFC);

  // ── Text ──────────────────────────────────────────────────────
  static const textDark  = Color(0xFF000000);
  static const textLight = Color(0xFFF8FAFC);
  static const textMuted = Color(0xFF94A3B8);
  static const textFaded = Color(0xFF64748B);

  // ── Status ────────────────────────────────────────────────────
  static const success = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);
  static const danger  = Color(0xFFEF4444);
  static const info    = Color(0xFF3B82F6);

  // ── Corner Marker ─────────────────────────────────────────────
  static const markerLight = Color(0xB3FFFFFF);
  static const markerDark  = Color(0x33FFFFFF);

  // ── Surface Bar ───────────────────────────────────────────────
  static const barBgLight     = Color(0x33FFFFFF);
  static const barBorderLight = Color(0x80FFFFFF);
  static const barBgDark      = Color(0xCC0F172A);  // navy-950 @ 80% opacity
  static const barBorderDark  = Color(0x26FFFFFF);  // white @ 15% opacity

  // ── Aliases & compatibility tokens ───────────────────────────
  static const primary         = cyan;
  static const secondary       = lime;
  static const white           = Colors.white;
  static const black           = Colors.black;
  static const error           = danger;
  static const amber           = Color(0xFFFFC107);
  static const grey200         = Color(0xFFEEEEEE);
  static const grey400         = Color(0xFF9E9E9E);
  static const grey600         = Color(0xFF757575);
  static const outlineLight    = Color(0xFFE2E8F0);
  static const outlineDark     = Color(0xFF334155);
  static const textMutedDark   = textMuted;

  // ── Glass aliases (ev_button, glass_container, ev_card) ──────
  static const primaryCyan         = cyan;
  static const primaryLime         = lime;
  static const primaryGradient     = cyanLimeGradient;
  static const glassBgDark         = cardDark;
  static const glassBgLight        = cardLight;
  static const glassBorderDark     = cardBorderDark;
  static const glassBorderLight    = cardBorderLight;
  static const glassHighlightDark  = Color(0x1AFFFFFF);
  static const glassHighlightLight = Color(0xFFFFFFFF);

  // ── Map pin marker gradients ──────────────────────────────────
  /// Active — available (≥1 charger free): màu chính đồ án cyan→lime
  static const markerAvailable = cyanLimeGradient;

  /// Active — full (0 charger free): vibrant peach to pink gradient.
  static const markerFull = orangePinkGradient;

  /// Maintenance: warm yellow to orange gradient.
  static const markerMaintenance = yellowOrangeGradient;

  /// Closed: soft grey to slate gradient.
  static const markerClosed = LinearGradient(
    begin: Alignment.topLeft,
    end:   Alignment.bottomRight,
    colors: [Color(0xFFE2E8F0), Color(0xFF94A3B8)],
  );

  /// Inactive: light grey to medium-dark slate gradient.
  static const markerInactive = LinearGradient(
    begin: Alignment.topLeft,
    end:   Alignment.bottomRight,
    colors: [Color(0xFFCBD5E1), Color(0xFF64748B)],
  );

  /// Shadow colors for each marker state
  static const markerShadowAvailable   = cyan;
  static const markerShadowFull        = pink;
  static const markerShadowMaintenance = orange;
  static const markerShadowClosed      = Color(0xFF94A3B8);
  static const markerShadowInactive    = Color(0xFF64748B);

  // ── Status color helpers ──────────────────────────────────────
  static Color forChargerStatus(String status) {
    switch (status.toUpperCase()) {
      case 'AVAILABLE': return lime;
      case 'IN_USE':    return cyan;
      case 'RESERVED':  return warning;
      case 'OFFLINE':   return grey400;
      case 'FAULTED':   return danger;
      default:          return grey400;
    }
  }

  static Color forBookingStatus(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING_PAYMENT': return warning;
      case 'CONFIRMED':       return cyan;
      case 'COMPLETED':       return success;
      case 'CANCELLED':       return danger;
      case 'EXPIRED':         return grey400;
      case 'NO_SHOW':         return danger;
      default:                return grey400;
    }
  }

  // ── Charger status color constants ────────────────────────────
  static const chargerAvailable = lime;
  static const chargerInUse     = cyan;
  static const chargerReserved  = warning;
  static const chargerFaulted   = danger;
  static const chargerOffline   = grey400;

  // ── Color → SVG hex string converter ─────────────────────────
  /// Returns a CSS hex color string e.g. "#10BFC9" for use in SVGs.
  static String toHex(Color color) {
    return '#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';
  }
}


// ── Radius tokens ─────────────────────────────────────────────
abstract class AppRadius {
  static const double xs   = 8.0;
  static const double sm   = 12.0;
  static const double md   = 16.0;
  static const double lg   = 24.0;
  static const double xl   = 28.0;
  static const double card = 36.0;
  static const double full = 999.0;
}

abstract class AppSpacing {
  static const double xs  = 4.0;
  static const double sm  = 8.0;
  static const double md  = 16.0;
  static const double lg  = 24.0;
  static const double xl  = 32.0;
  static const double xxl = 48.0;
  static const double xxxl = 64.0;
}

