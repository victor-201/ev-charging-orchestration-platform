import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// EVoltSync Premium Design System — Unified Header Widget
///
/// Standardizes the header layout, height (56.0), text typography (headingLg bold),
/// and leading back button (Icons.arrow_back_ios) across all mobile screens.
class EVHeader extends StatelessWidget implements PreferredSizeWidget {
  /// The title text to display in the header.
  final String title;

  /// Whether to display the default iOS-style back chevron button.
  final bool showBackButton;

  /// Optional custom callback when the back button is tapped.
  /// If null, defaults to Navigator.of(context).pop().
  final VoidCallback? onBackTapped;

  /// Optional action widget (e.g. glass buttons or status badges) to show on the right.
  final Widget? action;

  /// Whether to automatically imply the leading back button behavior when [showBackButton] is true.
  final bool automaticallyImplyLeading;

  /// Optional bottom widget (e.g. TabBar) to show below the header.
  final PreferredSizeWidget? bottom;

  const EVHeader({
    super.key,
    required this.title,
    this.showBackButton = false,
    this.onBackTapped,
    this.action,
    this.automaticallyImplyLeading = true,
    this.bottom,
  });

  @override
  Widget build(BuildContext context) {
    return AppBar(
      title: Text(title),
      centerTitle: false,
      backgroundColor: Colors.transparent,
      elevation: 0.0,
      scrolledUnderElevation: 0.0,
      automaticallyImplyLeading: automaticallyImplyLeading && showBackButton,
      leadingWidth: showBackButton ? 48.0 : 0.0,
      leading: showBackButton
          ? IconButton(
              icon: const Icon(Icons.arrow_back_ios, size: 20),
              onPressed: onBackTapped ?? () => Navigator.of(context).pop(),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            )
          : const SizedBox.shrink(),
      titleSpacing: showBackButton ? 0.0 : AppLayout.sidePadding,
      titleTextStyle: AppTypography.headingLg.copyWith(
        fontWeight: FontWeight.w700,
        color: Theme.of(context).colorScheme.onSurface,
        letterSpacing: -0.5,
      ),
      actions: action != null
          ? [
              Padding(
                padding: const EdgeInsets.only(right: AppLayout.sidePadding),
                child: action!,
              )
            ]
          : null,
      bottom: bottom,
    );
  }

  @override
  Size get preferredSize => Size.fromHeight(
        AppLayout.headerHeight + (bottom?.preferredSize.height ?? 0.0),
      );
}
