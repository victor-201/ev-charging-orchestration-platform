import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/notification_bloc.dart';
import '../../domain/entities/notification_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;

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

  List<_DateSection> _buildSections(List<NotificationEntity> notifs) {
    final now = DateTime.now();
    final sections = <_DateSection>[];
    List<NotificationEntity> today = [];
    List<NotificationEntity> yesterday = [];
    List<NotificationEntity> thisWeek = [];
    List<NotificationEntity> older = [];

    for (final n in notifs) {
      if (ev_date.DateUtils.isSameDay(n.createdAt, now)) {
        today.add(n);
      } else if (ev_date.DateUtils.isSameDay(n.createdAt, now.subtract(const Duration(days: 1)))) {
        yesterday.add(n);
      } else if (now.difference(n.createdAt).inDays < 7) {
        thisWeek.add(n);
      } else {
        older.add(n);
      }
    }

    if (today.isNotEmpty) sections.add(_DateSection('Hôm nay', today));
    if (yesterday.isNotEmpty) sections.add(_DateSection('Hôm qua', yesterday));
    if (thisWeek.isNotEmpty) sections.add(_DateSection('Tuần này', thisWeek));
    if (older.isNotEmpty) sections.add(_DateSection('Cũ hơn', older));

    return sections;
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      appBar: AppBar(
        title: const Text('Thông báo'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.done_all_outlined),
            tooltip: 'Đánh dấu tất cả đã đọc',
            onPressed: () =>
                context.read<NotificationBloc>().add(const NotificationMarkAllRead()),
          ),
        ],
      ),
      child: SafeArea(
        child: BlocBuilder<NotificationBloc, NotificationState>(
          builder: (context, state) {
            if (state is NotificationLoading) {
              return const Center(
                child: CircularProgressIndicator(
                  color: AppColors.primary,
                  strokeCap: StrokeCap.round,
                ),
              );
            }
            if (state is NotificationLoaded) {
              if (state.notifications.isEmpty) {
                return _EmptyState();
              }
              final sections = _buildSections(state.notifications);
              return RefreshIndicator(
                onRefresh: () async =>
                    context.read<NotificationBloc>().add(const NotificationLoad()),
                child: ListView.builder(
                  padding: EdgeInsets.only(
                    top: AppSpacing.md,
                    bottom: AppSpacing.xxxl,
                    left: AppSpacing.md,
                    right: AppSpacing.md,
                  ),
                  itemCount: sections.length,
                  itemBuilder: (_, si) => _NotificationSection(
                    section: sections[si],
                    onTap: (notif) {
                      if (!notif.isRead) {
                        context
                            .read<NotificationBloc>()
                            .add(NotificationMarkRead(id: notif.id));
                      }
                      final link = notif.deepLink;
                      if (link != null) context.push(link);
                    },
                  ),
                ),
              );
            }
            if (state is NotificationError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.cloud_off_rounded, size: 48,
                          color: AppColors.grey400),
                      const SizedBox(height: AppSpacing.md),
                      Text(state.message,
                          style: AppTypography.bodyMd.copyWith(color: AppColors.error),
                          textAlign: TextAlign.center),
                      const SizedBox(height: AppSpacing.lg),
                      EVButton(
                        label: 'Thử lại',
                        variant: EVButtonVariant.secondary,
                        onPressed: () =>
                            context.read<NotificationBloc>().add(const NotificationLoad()),
                      ),
                    ],
                  ),
                ),
              );
            }
            return const SizedBox.shrink();
          },
        ),
      ),
    );
  }
}

class _DateSection {
  final String label;
  final List<NotificationEntity> items;
  const _DateSection(this.label, this.items);
}

class _NotificationSection extends StatelessWidget {
  final _DateSection section;
  final void Function(NotificationEntity) onTap;

  const _NotificationSection({required this.section, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
          child: Text(
            section.label,
            style: AppTypography.overline.copyWith(
              color: AppColors.textFaded,
              letterSpacing: 0.8,
            ),
          ),
        ),
        ...List.generate(section.items.length, (i) {
          final notif = section.items[i];
          final isFirst = i == 0;
          final isLast = i == section.items.length - 1;
          return _NotificationTile(
            notif: notif,
            isFirst: isFirst,
            isLast: isLast,
            onTap: () => onTap(notif),
          );
        }),
        const SizedBox(height: AppSpacing.sm),
      ],
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final NotificationEntity notif;
  final bool isFirst;
  final bool isLast;
  final VoidCallback onTap;

  const _NotificationTile({
    required this.notif,
    required this.isFirst,
    required this.isLast,
    required this.onTap,
  });

  (IconData, Gradient) _iconForType() {
    switch (notif.type) {
      case 'booking_confirmed':
      case 'booking.confirmed':
        return (Icons.event_available_outlined, AppColors.cyanLimeGradient);
      case 'booking_no_show':
      case 'booking.no_show':
        return (Icons.event_busy_outlined, AppColors.orangePinkGradient);
      case 'booking.created':
        return (Icons.add_circle_outline, AppColors.blueCyanGradient);
      case 'booking.cancelled':
        return (Icons.cancel_outlined, AppColors.orangePinkGradient);
      case 'booking.expired':
        return (Icons.timer_off_outlined, AppColors.yellowOrangeGradient);
      case 'charging_started':
      case 'session.started':
        return (Icons.bolt_outlined, AppColors.cyanLimeGradient);
      case 'charging_completed':
      case 'session.completed':
        return (Icons.check_circle_outline, AppColors.cyanLimeGradient);
      case 'payment_success':
      case 'payment.completed':
        return (Icons.payment_outlined, AppColors.blueCyanGradient);
      case 'payment.failed':
        return (Icons.payment_outlined, AppColors.orangePinkGradient);
      case 'arrears_created':
      case 'wallet.arrears.created':
        return (Icons.warning_amber_outlined, AppColors.purpleGradient);
      case 'wallet.arrears.cleared':
        return (Icons.check_circle_outline, AppColors.cyanLimeGradient);
      case 'charger.queue.ready':
        return (Icons.ev_station_outlined, AppColors.cyanLimeGradient);
      case 'idle_fee_started':
      case 'billing.idle_fee_charged':
        return (Icons.timer_outlined, AppColors.yellowOrangeGradient);
      case 'billing.extra_charge':
        return (Icons.receipt_long_outlined, AppColors.orangePinkGradient);
      case 'billing.refund_issued':
        return (Icons.account_balance_wallet_outlined, AppColors.cyanLimeGradient);
      case 'charger.fault':
      case 'charger_fault':
        return (Icons.error_outline, AppColors.orangePinkGradient);
      case 'queue.updated':
        return (Icons.format_list_numbered_outlined, AppColors.blueCyanGradient);
      default:
        return (Icons.notifications_outlined, AppColors.cyanLimeGradient);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (icon, gradient) = _iconForType();

    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.sm,
        right: AppSpacing.sm,
        top: isFirst ? 0 : AppSpacing.xs,
        bottom: isLast ? 0 : AppSpacing.xs,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.md),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            decoration: BoxDecoration(
              color: notif.isRead
                  ? Colors.transparent
                  : (isDark
                      ? AppColors.primary.withValues(alpha: 0.06)
                      : AppColors.primary.withValues(alpha: 0.04)),
              borderRadius: BorderRadius.circular(AppRadius.md),
              border: !notif.isRead
                  ? Border(
                      left: BorderSide(
                        color: AppColors.primary.withValues(alpha: 0.3),
                        width: 3.0,
                      ),
                    )
                  : null,
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.md,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: gradient,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primary.withValues(alpha: 0.15),
                        blurRadius: 8.0,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Icon(icon, color: Colors.white, size: 22),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(
                              notif.translatedTitle,
                              style: AppTypography.bodyMd.copyWith(
                                fontWeight: notif.isRead ? FontWeight.w500 : FontWeight.w700,
                                color: isDark ? AppColors.textLight : AppColors.textDark,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          if (!notif.isRead)
                            Container(
                              width: 8,
                              height: 8,
                              margin: const EdgeInsets.only(top: 6),
                              decoration: BoxDecoration(
                                color: AppColors.primary,
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: AppColors.primary.withValues(alpha: 0.4),
                                    blurRadius: 4.0,
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        notif.translatedBody,
                        style: AppTypography.caption.copyWith(
                          color: isDark
                              ? AppColors.textLight.withValues(alpha: 0.7)
                              : AppColors.textFaded,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        ev_date.DateUtils.formatRelative(notif.createdAt),
                        style: AppTypography.caption.copyWith(
                          color: AppColors.textFaded.withValues(alpha: 0.7),
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.cyan.withValues(alpha: 0.15),
                    AppColors.lime.withValues(alpha: 0.15),
                  ],
                ),
              ),
              child: Icon(
                Icons.notifications_none_rounded,
                size: 48,
                color: AppColors.primary.withValues(alpha: 0.4),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Không có thông báo nào',
              style: AppTypography.headingMd.copyWith(
                color: isDark ? AppColors.textLight.withValues(alpha: 0.6) : AppColors.textFaded,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Bạn sẽ nhận được thông báo về\nlịch sạc, thanh toán và cập nhật hệ thống',
              style: AppTypography.bodyMd.copyWith(
                color: AppColors.textFaded.withValues(alpha: 0.7),
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
