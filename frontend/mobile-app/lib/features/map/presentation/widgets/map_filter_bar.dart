import 'dart:ui' as dart_ui;
import 'package:flutter/material.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';

class MapFilterBar extends StatefulWidget {
  final List<String> connectorTypes;
  final String? selectedConnector;
  final ValueChanged<String?> onFilterChanged;

  const MapFilterBar({
    super.key,
    required this.connectorTypes,
    required this.selectedConnector,
    required this.onFilterChanged,
  });

  @override
  State<MapFilterBar> createState() => _MapFilterBarState();
}

class _MapFilterBarState extends State<MapFilterBar> {
  late final ScrollController _scrollController;
  double _lastPointerX = 0.0;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final Color barBg = isDark ? AppColors.barBgDark : AppColors.barBgLight;
    final Color barBorder = isDark ? AppColors.barBorderDark : AppColors.barBorderLight;

    return SizedBox(
      width: double.infinity,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(23),
        child: BackdropFilter(
          filter: dart_ui.ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            height: 46,
            decoration: BoxDecoration(
              color: barBg,
              borderRadius: BorderRadius.circular(23),
              border: Border.all(
                color: barBorder,
                width: 1.2,
              ),
              boxShadow: [
                BoxShadow(
                  color: isDark
                      ? Colors.black.withValues(alpha: 0.25)
                      : Colors.black.withValues(alpha: 0.08),
                  blurRadius: 15,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Listener(
              onPointerDown: (event) {
                _lastPointerX = event.position.dx;
              },
              onPointerMove: (event) {
                if (_scrollController.hasClients) {
                  final deltaX = event.position.dx - _lastPointerX;
                  _lastPointerX = event.position.dx;

                  final targetOffset = _scrollController.offset - deltaX;
                  _scrollController.jumpTo(
                    targetOffset.clamp(
                      0.0,
                      _scrollController.position.maxScrollExtent,
                    ),
                  );
                }
              },
              child: ShaderMask(
                shaderCallback: (Rect bounds) {
                  return const LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [
                      Colors.transparent,
                      Colors.white,
                      Colors.white,
                      Colors.transparent,
                    ],
                    stops: [0.0, 0.04, 0.96, 1.0],
                  ).createShader(bounds);
                },
                blendMode: BlendMode.dstIn,
                child: SingleChildScrollView(
                  controller: _scrollController,
                  scrollDirection: Axis.horizontal,
                  physics: const NeverScrollableScrollPhysics(),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.start,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      _buildChip(
                        context,
                        label: 'Tất cả',
                        isSelected: widget.selectedConnector == null,
                        onTap: () => widget.onFilterChanged(null),
                      ),
                      ...widget.connectorTypes.map((type) => _buildChip(
                            context,
                            label: type,
                            isSelected: widget.selectedConnector == type,
                            onTap: () => widget.onFilterChanged(type),
                          )),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildChip(
    BuildContext context, {
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final Color inactiveBg = isDark
        ? Colors.white.withValues(alpha: 0.06)
        : Colors.black.withValues(alpha: 0.04);
    final Color inactiveBorder = isDark
        ? Colors.white.withValues(alpha: 0.08)
        : Colors.black.withValues(alpha: 0.06);
    final Color textColor = isSelected
        ? Colors.white
        : (isDark ? AppColors.pillTextDark : AppColors.pillTextLight);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4.0),
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            gradient: isSelected ? AppColors.cyanLimeGradient : null,
            color: isSelected ? null : inactiveBg,
            borderRadius: BorderRadius.circular(15),
            border: Border.all(
              color: isSelected
                  ? Colors.white.withValues(alpha: 0.35)
                  : inactiveBorder,
              width: 1.0,
            ),
            boxShadow: isSelected
                ? [
                    BoxShadow(
                      color: AppColors.cyan.withValues(alpha: 0.45),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildConnectorIcon(
                label,
                isSelected
                    ? Colors.white
                    : (isDark ? AppColors.cyan.withValues(alpha: 0.8) : AppColors.cyan),
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: AppTypography.caption.copyWith(
                  color: textColor,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildConnectorIcon(String type, Color color) {
    IconData iconData;
    switch (type.toUpperCase()) {
      case 'TẤT CẢ':
        iconData = Icons.grid_view_rounded;
        break;
      case 'CCS':
        iconData = Icons.bolt_rounded;
        break;
      case 'CHADEMO':
        iconData = Icons.electric_car_rounded;
        break;
      case 'TYPE2':
        iconData = Icons.power_rounded;
        break;
      case 'GB/T':
        iconData = Icons.electrical_services_rounded;
        break;
      default:
        iconData = Icons.cable_rounded;
    }
    return Icon(
      iconData,
      color: color,
      size: 14,
    );
  }
}
