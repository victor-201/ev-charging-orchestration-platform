import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/profile_bloc.dart';
import '../../domain/entities/profile_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/ev_header.dart';

class VehicleAuditLogScreen extends StatefulWidget {
  final String vehicleId;
  final String plateNumber;

  const VehicleAuditLogScreen({
    super.key,
    required this.vehicleId,
    required this.plateNumber,
  });

  @override
  State<VehicleAuditLogScreen> createState() => _VehicleAuditLogScreenState();
}

class _VehicleAuditLogScreenState extends State<VehicleAuditLogScreen> {
  @override
  void initState() {
    super.initState();
    context.read<ProfileBloc>().add(VehicleLoadAuditLogs(vehicleId: widget.vehicleId));
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      extendBodyBehindAppBar: true,
      appBar: EVHeader(
        title: 'Nhật ký xe ${widget.plateNumber}',
        showBackButton: true,
        onBackTapped: () => Navigator.pop(context),
      ),
      child: SafeArea(
        bottom: false,
        child: BlocBuilder<ProfileBloc, ProfileState>(
          builder: (context, state) {
            if (state is ProfileLoading) {
              return const Center(child: CircularProgressIndicator(color: AppColors.primary));
            }
  
            final logs = state is ProfileLoaded ? state.vehicleAuditLogs : <AuditLogEntity>[];
  
            if (logs.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.history_toggle_off, size: 64, color: AppColors.grey400),
                    const SizedBox(height: 16),
                    Text(
                      'Không có nhật ký hoạt động nào cho xe này',
                      style: AppTypography.bodyMd.copyWith(color: AppColors.grey600),
                    ),
                  ],
                ),
              );
            }
  
            return ListView.builder(
              padding: AppLayout.paddingWithHeader(context),
              itemCount: logs.length,
              itemBuilder: (context, index) {
                final log = logs[index];
                final isLast = index == logs.length - 1;
                return _buildTimelineItem(context, log, isLast);
              },
            );
          },
        ),
      ),
    );
  }

  Widget _buildTimelineItem(BuildContext context, AuditLogEntity log, bool isLast) {
    final actionData = _getActionData(log.action);
    final theme = Theme.of(context);

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Left Line & Dot Column
          Column(
            children: [
              // Glowing Dot containing the action icon
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: actionData.color.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                  border: Border.all(color: actionData.color, width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: actionData.color.withValues(alpha: 0.2),
                      blurRadius: 8,
                    ),
                  ],
                ),
                child: Icon(actionData.icon, color: actionData.color, size: 18),
              ),
              // Vertical Timeline Line
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    color: AppColors.outlineLight.withValues(alpha: 0.5),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 16),

          // Right Content Column
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title and Timestamp
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          actionData.title,
                          style: AppTypography.bodyMd.copyWith(
                            fontWeight: FontWeight.w700,
                            color: theme.colorScheme.onSurface,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        ev_date.DateUtils.formatRelative(log.changedAt),
                        style: AppTypography.caption.copyWith(
                          color: AppColors.grey600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),

                  // Detail Details or Metadata
                  if (log.details.isNotEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: theme.cardColor.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.outlineLight.withValues(alpha: 0.3)),
                      ),
                      child: Text(
                        _formatDetails(log.details),
                        style: AppTypography.caption.copyWith(
                          color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                          height: 1.4,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  _ActionData _getActionData(String action) {
    switch (action.toLowerCase()) {
      case 'vehicle_add':
        return const _ActionData(
          title: 'Liên kết phương tiện',
          icon: Icons.directions_car_filled_outlined,
          color: AppColors.primaryLime,
        );
      case 'vehicle_primary':
        return const _ActionData(
          title: 'Đặt phương tiện mặc định',
          icon: Icons.star_rounded,
          color: AppColors.amber,
        );
      case 'autocharge_setup':
        return const _ActionData(
          title: 'Cấu hình AutoCharge',
          icon: Icons.bolt_rounded,
          color: AppColors.primary,
        );
      case 'vehicle_color_update':
      case 'vehicle_update':
        return const _ActionData(
          title: 'Cập nhật thông tin xe',
          icon: Icons.edit_note_outlined,
          color: AppColors.primaryCyan,
        );
      default:
        return const _ActionData(
          title: 'Cập nhật phương tiện',
          icon: Icons.build_circle_outlined,
          color: AppColors.grey600,
        );
    }
  }

  String _formatDetails(Map<String, dynamic> details) {
    final buffer = StringBuffer();
    details.forEach((key, value) {
      if (key == 'macAddress') {
        buffer.write('MAC AutoCharge: ${value ?? "Không"}  ·  ');
      } else if (key == 'vinNumber') {
        buffer.write('Số VIN: ${value ?? "Không"}  ·  ');
      } else if (key == 'autochargeEnabled') {
        buffer.write('Trạng thái AutoCharge: ${value == true ? "Bật" : "Tắt"}  ·  ');
      } else if (key == 'color') {
        buffer.write('Màu sắc: $value  ·  ');
      } else if (key == 'brand') {
        buffer.write('Hãng xe: $value  ·  ');
      } else if (key == 'modelName') {
        buffer.write('Mẫu xe: $value  ·  ');
      } else if (key == 'year') {
        buffer.write('Năm: $value  ·  ');
      } else if (key == 'batteryCapacityKwh') {
        buffer.write('Pin: ${value}kWh  ·  ');
      }
    });
    final result = buffer.toString();
    if (result.endsWith('  ·  ')) {
      return result.substring(0, result.length - 5);
    }
    return details.toString();
  }
}

class _ActionData {
  final String title;
  final IconData icon;
  final Color color;

  const _ActionData({
    required this.title,
    required this.icon,
    required this.color,
  });
}
