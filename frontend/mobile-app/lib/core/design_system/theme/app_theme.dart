import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_colors.dart';
import 'app_typography.dart';

/// EVoltSync — Liquid Glass Theme System
/// Provides MaterialApp ThemeData for light + dark modes.
abstract class AppTheme {
  // ── Light Theme ───────────────────────────────────────────────
  static ThemeData get light => _build(Brightness.light);

  // ── Dark Theme ────────────────────────────────────────────────
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary:         AppColors.cyan,
      onPrimary:       Colors.white,
      primaryContainer: isDark
          ? AppColors.cardDark
          : AppColors.cardLight,
      onPrimaryContainer: isDark
          ? AppColors.textLight
          : AppColors.textDark,
      secondary:        AppColors.lime,
      onSecondary:      Colors.white,
      secondaryContainer: isDark
          ? AppColors.pillBgDark
          : AppColors.pillBgLight,
      onSecondaryContainer: isDark
          ? AppColors.pillTextDark
          : AppColors.pillTextLight,
      surface:         isDark ? AppColors.bgGradDark2 : AppColors.bgGradLight2,
      onSurface:       isDark ? AppColors.textLight : AppColors.textDark,
      surfaceContainerHighest: isDark ? AppColors.cardDark : AppColors.cardLight,
      onSurfaceVariant: AppColors.textMuted,
      error:           AppColors.danger,
      onError:         Colors.white,
      outline:         isDark ? AppColors.cardBorderDark : AppColors.cardBorderLight,
      outlineVariant:  isDark ? AppColors.barBorderDark : AppColors.barBorderLight,
      shadow:          isDark
          ? Colors.black.withValues(alpha: 0.5)
          : Colors.black.withValues(alpha: 0.1),
      scrim:           Colors.black.withValues(alpha: 0.5),
      inverseSurface:  isDark ? AppColors.bgGradLight2 : AppColors.bgDark,
      onInverseSurface: isDark ? AppColors.textDark : AppColors.textLight,
      inversePrimary:  AppColors.lime,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      textTheme: AppTypography.textTheme.apply(
        bodyColor:    isDark ? AppColors.textLight : AppColors.textDark,
        displayColor: isDark ? AppColors.textLight : AppColors.textDark,
      ),
      scaffoldBackgroundColor: Colors.transparent,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        systemOverlayStyle: isDark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
        titleTextStyle: AppTypography.headingMd.copyWith(
          color: isDark ? AppColors.textLight : AppColors.textDark,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
        ),
        iconTheme: IconThemeData(
          color: isDark ? AppColors.textLight : AppColors.textDark,
        ),
      ),
      cardTheme: CardThemeData(
        color: isDark ? AppColors.cardDark : AppColors.cardLight,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(28),
          side: BorderSide(
            color: isDark ? AppColors.cardBorderDark : AppColors.cardBorderLight,
            width: 1.5,
          ),
        ),
        margin: EdgeInsets.zero,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.cyan,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          textStyle: AppTypography.labelMd.copyWith(fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: isDark ? AppColors.textLight : AppColors.textDark,
          side: BorderSide(
            color: isDark ? AppColors.cardBorderDark : AppColors.cardBorderLight,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? AppColors.pillBgDark : AppColors.pillBgLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(
            color: isDark ? AppColors.cardBorderDark : AppColors.cardBorderLight,
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(
            color: isDark ? AppColors.cardBorderDark : AppColors.cardBorderLight,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.cyan, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        hintStyle: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: isDark ? AppColors.cardDark : AppColors.cardLight,
        selectedItemColor: AppColors.cyan,
        unselectedItemColor: AppColors.textMuted,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: isDark ? AppColors.cardDark : AppColors.cardLight,
        indicatorColor: AppColors.cyan.withValues(alpha: 0.2),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: AppColors.cyan);
          }
          return IconThemeData(color: AppColors.textMuted);
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppTypography.labelSm.copyWith(color: AppColors.cyan, fontWeight: FontWeight.w600);
          }
          return AppTypography.labelSm.copyWith(color: AppColors.textMuted);
        }),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: isDark ? AppColors.pillBgDark : AppColors.pillBgLight,
        selectedColor: AppColors.cyan.withValues(alpha: 0.2),
        side: BorderSide(
          color: isDark ? AppColors.cardBorderDark : AppColors.cardBorderLight,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        labelStyle: AppTypography.labelSm,
      ),
      dividerTheme: DividerThemeData(
        color: isDark ? AppColors.cardBorderDark : AppColors.cardBorderLight,
        thickness: 1,
        space: 1,
      ),
      iconTheme: IconThemeData(
        color: isDark ? AppColors.textLight : AppColors.textDark,
        size: 24,
      ),
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: isDark ? AppColors.cardDark : AppColors.cardLight,
        contentTextStyle: AppTypography.bodyMd.copyWith(
          color: isDark ? AppColors.textLight : AppColors.textDark,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        behavior: SnackBarBehavior.floating,
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.linux: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.windows: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}
