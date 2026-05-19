import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/notification_bloc.dart';
import '../../domain/entities/notification_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_theme.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;

/// User Notifications Inbox Screen
///
/// Renders a list of chronological system, charging, billing, and queue alerts,
/// allowing status updates (mark-as-read/mark-all-read) and deep-linking routing.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<NotificationBloc>().add(const NotificationLoad());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Thông báo'),
        actions: [
          IconButton(
            icon: const Icon(Icons.done_all_outlined),
            tooltip: 'Đánh dấu tất cả đã đọc',
            onPressed: () => context.read<NotificationBloc>().add(const NotificationMarkAllRead()),
          ),
        ],
      ),
      body: BlocBuilder<NotificationBloc, NotificationState>(
        builder: (context, state) {
          if (state is NotificationLoading) return const Center(child: CircularProgressIndicator());
          if (state is NotificationLoaded) {
            if (state.notifications.isEmpty) {
              return Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.notifications_none_outlined, size: 72, color: AppColors.grey400),
                  const SizedBox(height: AppSpacing.lg),
                  Text('Không có thông báo nào', style: AppTypography.headingMd.copyWith(color: AppColors.grey600)),
                ]),
              );
            }
            return RefreshIndicator(
              onRefresh: () async => context.read<NotificationBloc>().add(const NotificationLoad()),
              child: ListView.separated(
                itemCount: state.notifications.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) => _NotificationTile(notif: state.notifications[i]),
              ),
            );
          }
          if (state is NotificationError) {
            return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(state.message, style: AppTypography.bodyMd.copyWith(color: AppColors.error)),
              const SizedBox(height: AppSpacing.lg),
              EVButton(label: 'Thử lại', variant: EVButtonVariant.secondary,
                  onPressed: () => context.read<NotificationBloc>().add(const NotificationLoad())),
            ]));
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final NotificationEntity notif;
  const _NotificationTile({required this.notif});

  @override
  Widget build(BuildContext context) {
    IconData icon;
    Color color;
    switch (notif.type) {
      case 'booking_confirmed':     icon = Icons.event_available_outlined; color = AppColors.chargerAvailable; break;
      case 'booking_no_show':       icon = Icons.event_busy_outlined;      color = AppColors.error; break;
      case 'charging_started':      icon = Icons.bolt_outlined;            color = AppColors.secondary; break;
      case 'charging_completed':    icon = Icons.check_circle_outline;     color = AppColors.chargerAvailable; break;
      case 'payment_success':       icon = Icons.payment_outlined;         color = AppColors.primary; break;
      case 'arrears_created':       icon = Icons.warning_amber_outlined;   color = AppColors.error; break;
      case 'idle_fee_started':      icon = Icons.timer_outlined;           color = AppColors.amber; break;
      default:                      icon = Icons.notifications_outlined;   color = AppColors.grey600;
    }

    return Material(
      color: notif.isRead ? Colors.transparent : AppColors.primary.withValues(alpha: 0.04),
      child: InkWell(
        onTap: () {
          if (!notif.isRead) {
            context.read<NotificationBloc>().add(NotificationMarkRead(id: notif.id));
          }
          final link = notif.deepLink;
          if (link != null) context.push(link);
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.1), shape: BoxShape.circle),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(notif.title,
                    style: AppTypography.bodyMd.copyWith(fontWeight: notif.isRead ? FontWeight.w400 : FontWeight.w600))),
                if (!notif.isRead)
                  Container(width: 8, height: 8,
                      decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
              ]),
              const SizedBox(height: 2),
              Text(notif.body, style: AppTypography.caption.copyWith(color: AppColors.grey600), maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              Text(ev_date.DateUtils.formatRelative(notif.createdAt),
                  style: AppTypography.caption.copyWith(color: AppColors.grey400, fontSize: 10)),
            ])),
          ]),
        ),
      ),
    );
  }
}
