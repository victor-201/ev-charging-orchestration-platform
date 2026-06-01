import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/booking_bloc.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/ev_header.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';

/// Charging Session Virtual Queue Screen
///
/// Renders live queue order numbers and projects wait duration estimates
/// computed dynamically based on current queue positions (position * 45 minutes).
class QueueStatusScreen extends StatefulWidget {
  final String chargerId;
  const QueueStatusScreen({super.key, required this.chargerId});

  @override
  State<QueueStatusScreen> createState() => _QueueStatusScreenState();
}

class _QueueStatusScreenState extends State<QueueStatusScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    context.read<BookingBloc>().add(QueueJoin(chargerId: widget.chargerId));
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      extendBodyBehindAppBar: true,
      appBar: const EVHeader(
        title: 'Hàng đợi sạc',
        showBackButton: true,
      ),
      child: SafeArea(
        bottom: false,
        child: BlocConsumer<BookingBloc, BookingState>(
          listener: (context, state) {
            if (state is BookingError) {
              EVToast.show(context, message: state.message, isError: true);
            }
          },
          builder: (context, state) {
            if (state is QueuePositionState) return _buildQueueView(context, state);
            if (state is BookingLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            return const Center(child: Text('Đang tải hàng đợi...'));
          },
        ),
      ),
    );
  }

  Widget _buildQueueView(BuildContext context, QueuePositionState state) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: IntrinsicHeight(
            child: Padding(
              padding: AppLayout.paddingWithHeader(context),
              child: Column(
                children: [
                  const SizedBox(height: AppSpacing.xxxl),
        
                  AnimatedBuilder(
                    animation: _pulseController,
                    builder: (_, __) => Container(
                      width: 160,
                      height: 160,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            AppColors.secondary.withValues(
                                alpha: 0.15 + 0.1 * _pulseController.value),
                            AppColors.secondary.withValues(alpha: 0.05),
                          ],
                        ),
                        border: Border.all(
                          color: AppColors.secondary
                              .withValues(alpha: 0.3 + 0.2 * _pulseController.value),
                          width: 2,
                        ),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            '${state.position ?? '--'}',
                            style: AppTypography.displayLg.copyWith(
                              color: AppColors.secondary,
                              fontWeight: FontWeight.w800,
                              fontSize: 56,
                            ),
                          ),
                          Text(
                            'Vị trí của bạn',
                            style: AppTypography.caption
                                .copyWith(color: AppColors.grey600),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xxxl),
        
                  if (state.estimatedWaitMinutes != null)
                    Container(
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      decoration: BoxDecoration(
                        color: AppColors.secondary.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(AppRadius.md),
                        border: Border.all(
                            color: AppColors.secondary.withValues(alpha: 0.2)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.timer_outlined,
                              color: AppColors.secondary, size: 24),
                          const SizedBox(width: AppSpacing.sm),
                          Column(
                            children: [
                              Text(
                                '~ ${state.estimatedWaitMinutes} phút',
                                style: AppTypography.headingLg.copyWith(
                                    color: AppColors.secondary,
                                    fontWeight: FontWeight.w700),
                              ),
                              Text(
                                'Thời gian chờ ước tính',
                                style: AppTypography.caption
                                    .copyWith(color: AppColors.grey600),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
        
                  const Spacer(),
        
                  Text(
                    'Cập nhật mỗi 30 giây. Chúng tôi sẽ thông báo khi đến lượt bạn.',
                    style: AppTypography.caption.copyWith(color: AppColors.grey600),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.lg),
        
                  EVButton(
                    label: 'Rời hàng đợi',
                    variant: EVButtonVariant.danger,
                    icon: Icons.exit_to_app_outlined,
                    onPressed: () {
                      context.read<BookingBloc>().add(
                          QueueLeave(chargerId: widget.chargerId));
                      context.pop();
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
