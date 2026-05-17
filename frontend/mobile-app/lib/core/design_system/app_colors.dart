import 'package:flutter/material.dart';

/// Material 3 Design System core UI color tokens
abstract class AppColors {
  // ── Primary Brand Palette ─────────────────────────────────
  /// Emerald Green — representing available nodes and confirmations
  static const Color primary = Color(0xFF00C853);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color primaryContainer = Color(0xFFB9F6CA);
  static const Color onPrimaryContainer = Color(0xFF00391A);

  // ── Secondary Telemetry Palette ───────────────────────────
  /// Electric Blue — representing dynamic WebSocket connections
  static const Color secondary = Color(0xFF0288D1);
  static const Color onSecondary = Color(0xFFFFFFFF);
  static const Color secondaryContainer = Color(0xFFB3E5FC);

  // ── High-Risk Alerts Palette ──────────────────────────────
  /// Crimson Red — representing faulted nodes and infractions
  static const Color error = Color(0xFFB00020);
  static const Color onError = Color(0xFFFFFFFF);
  static const Color errorContainer = Color(0xFFFFDAD6);

  // ── Success Signals Palette ───────────────────────────────
  /// Success Green — representing transactions and credential setups
  static const Color success = Color(0xFF2E7D32);
  static const Color successContainer = Color(0xFFE8F5E9);

  // ── Active Warnings Palette ────────────────────────────────
  /// Orange warning indicator
  static const Color warning = Color(0xFFF57C00);
  static const Color warningContainer = Color(0xFFFFE0B2);

  /// Amber warning indicator
  static const Color amber = Color(0xFFFFC107);
  static const Color amberContainer = Color(0xFFFFF8E1);

  // ── Surface & Background (Light) ─────────────────────────
  static const Color surfaceLight = Color(0xFFFAFAFA);
  static const Color backgroundLight = Color(0xFFF5F5F5);
  static const Color outlineLight = Color(0xFFE0E0E0);

  // ── Surface & Background (Dark) ──────────────────────────
  static const Color surfaceDark = Color(0xFF121212);
  static const Color backgroundDark = Color(0xFF1A1A1A);
  static const Color outlineDark = Color(0xFF2C2C2C);

  // ── Charging Station Status Color Mapping ───────────
  static const Color chargerAvailable = Color(0xFF00C853);
  static const Color chargerInUse = Color(0xFF0288D1);
  static const Color chargerReserved = Color(0xFFFFC107);
  static const Color chargerOffline = Color(0xFF9E9E9E);
  static const Color chargerFaulted = Color(0xFFB00020);

  // ── Charger Slot Reservation Color Mapping ───────────
  static const Color bookingPendingPayment = Color(0xFFFFC107);
  static const Color bookingConfirmed = Color(0xFF00C853);
  static const Color bookingCompleted = Color(0xFF0288D1);
  static const Color bookingCancelled = Color(0xFF9E9E9E);
  static const Color bookingExpired = Color(0xFF9E9E9E);
  static const Color bookingNoShow = Color(0xFFB00020);

  // ── Auxiliary Styling Color Tokens ─────────────────────────
  static const Color grey400 = Color(0xFF9E9E9E);
  static const Color grey600 = Color(0xFF757575);
  static const Color grey800 = Color(0xFF424242);
  static const Color white = Color(0xFFFFFFFF);
  static const Color black = Color(0xFF000000);

  // ── Operational Charger State Color Helpers ───────────────
  static Color forChargerStatus(String status) {
    switch (status.toUpperCase()) {
      case 'AVAILABLE':
        return chargerAvailable;
      case 'IN_USE':
        return chargerInUse;
      case 'RESERVED':
        return chargerReserved;
      case 'OFFLINE':
        return chargerOffline;
      case 'FAULTED':
        return chargerFaulted;
      default:
        return chargerOffline;
    }
  }

  // ── Charger Reservation State Color Helpers ───────────────
  static Color forBookingStatus(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING_PAYMENT':
        return bookingPendingPayment;
      case 'CONFIRMED':
        return bookingConfirmed;
      case 'COMPLETED':
        return bookingCompleted;
      case 'CANCELLED':
        return bookingCancelled;
      case 'EXPIRED':
        return bookingExpired;
      case 'NO_SHOW':
        return bookingNoShow;
      default:
        return bookingCancelled;
    }
  }
}
