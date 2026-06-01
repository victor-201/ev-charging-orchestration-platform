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

class AuditLogScreen extends StatefulWidget {
  const AuditLogScreen({super.key});

  @override
  State<AuditLogScreen> createState() => _AuditLogScreenState();
}

class _AuditLogScreenState extends State<AuditLogScreen> {
  @override
  void initState() {
    super.initState();
    context.read<ProfileBloc>().add(const ProfileLoadAuditLogs());
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      extendBodyBehindAppBar: true,
      appBar: EVHeader(
        title: 'Nhật ký hoạt động',
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
  
            final logs = state is ProfileLoaded ? state.auditLogs : <AuditLogEntity>[];
  
            if (logs.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.history_toggle_off, size: 64, color: AppColors.grey400),
                    const SizedBox(height: 16),
                    Text(
                      'Không có nhật ký hoạt động nào',
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
      case 'login':
        return const _ActionData(
          title: 'Đăng nhập hệ thống',
          icon: Icons.login,
          color: AppColors.primary,
        );
      case 'logout':
        return const _ActionData(
          title: 'Đăng xuất',
          icon: Icons.logout,
          color: AppColors.grey600,
        );
      case 'profile_update':
      case 'updated':
        return const _ActionData(
          title: 'Cập nhật thông tin hồ sơ',
          icon: Icons.person_outline,
          color: AppColors.primaryCyan,
        );
      case 'password_change':
        return const _ActionData(
          title: 'Thay đổi mật khẩu',
          icon: Icons.lock_outline,
          color: AppColors.amber,
        );
      case 'mfa_enable':
        return const _ActionData(
          title: 'Kích hoạt bảo mật 2 lớp (MFA)',
          icon: Icons.verified_user_outlined,
          color: AppColors.chargerAvailable,
        );
      case 'mfa_disable':
        return const _ActionData(
          title: 'Tắt bảo mật 2 lớp (MFA)',
          icon: Icons.warning_amber_outlined,
          color: AppColors.error,
        );
      case 'vehicle_add':
        return const _ActionData(
          title: 'Liên kết phương tiện mới',
          icon: Icons.directions_car_outlined,
          color: AppColors.primaryLime,
        );
      case 'vehicle_delete':
        return const _ActionData(
          title: 'Hủy liên kết phương tiện',
          icon: Icons.delete_outline,
          color: AppColors.error,
        );
      case 'vehicle_primary':
        return const _ActionData(
          title: 'Đặt phương tiện mặc định',
          icon: Icons.star_border_outlined,
          color: AppColors.primaryCyan,
        );
      case 'autocharge_setup':
        return const _ActionData(
          title: 'Cấu hình AutoCharge',
          icon: Icons.bolt,
          color: AppColors.primary,
        );
      default:
        return const _ActionData(
          title: 'Hoạt động tài khoản',
          icon: Icons.info_outline,
          color: AppColors.primary,
        );
    }
  }

  String _formatDetails(Map<String, dynamic> details) {
    final buffer = StringBuffer();

    // Format: { "after": {...}, "before": {...} }
    if (details.containsKey('after') || details.containsKey('before')) {
      final after = details['after'] as Map<String, dynamic>? ?? {};
      final before = details['before'] as Map<String, dynamic>? ?? {};
      final changedFields = <String>{...after.keys}..addAll(before.keys);
      for (final field in changedFields) {
        final oldVal = _fmt(before[field]);
        final newVal = _fmt(after[field]);
        if (oldVal == newVal) continue;
        buffer.writeln('• ${_fieldLabel(field)}:');
        buffer.writeln('  $oldVal → $newVal');
      }
      return buffer.toString().trim();
    }

    // Format simple key-value changes
    for (final entry in details.entries) {
      buffer.writeln('• ${_fieldLabel(entry.key)}: ${_fmt(entry.value)}');
    }
    return buffer.toString().trim();
  }

  String _fmt(dynamic value) {
    if (value == null) return '(trống)';
    final s = value.toString();
    return s.length > 60 ? '${s.substring(0, 60)}...' : s;
  }

  String _fieldLabel(String field) {
    switch (field) {
      case 'avatarUrl': return 'Ảnh đại diện';
      case 'phone': return 'Số điện thoại';
      case 'address': return 'Địa chỉ';
      case 'dateOfBirth': return 'Ngày sinh';
      case 'email': return 'Email';
      case 'fullName': return 'Họ tên';
      case 'modelName': return 'Mẫu xe';
      case 'plateNumber': return 'Biển số';
      case 'brand': return 'Hãng xe';
      case 'color': return 'Màu sắc';
      case 'year': return 'Năm sản xuất';
      case 'ip': return 'IP';
      case 'device': return 'Thiết bị';
      default: return field;
    }
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
