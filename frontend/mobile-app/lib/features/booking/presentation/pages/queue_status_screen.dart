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
import '../../../../core/design_system/widgets/glass_container.dart';
import '../../../../core/di/injection.dart';
import '../../../../features/map/domain/entities/station_entity.dart';
import '../../../../features/map/domain/repositories/i_station_repository.dart';
import '../../../../core/di/injection.dart';
import '../../../../features/map/domain/entities/station_entity.dart';
import '../../../../features/map/domain/repositories/i_station_repository.dart';
import '../../../../core/di/injection.dart';
import '../../../../features/map/domain/entities/station_entity.dart';
import '../../../../features/map/domain/repositories/i_station_repository.dart';

/// Charging Session Virtual Queue Screen
///
/// Renders live queue order numbers and projects wait duration estimates
/// computed dynamically based on current queue positions (position * 45 minutes).
/// Supports an immediate checkout/redirect to QR Scan when the user's turn arrives.
class QueueStatusScreen extends StatefulWidget {
  final String chargerId;
  const QueueStatusScreen({super.key, required this.chargerId});

  @override
  State<QueueStatusScreen> createState() => _QueueStatusScreenState();
}

class _QueueStatusScreenState extends State<QueueStatusScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  StationEntity? _station;
  ChargerEntity? _charger;
  bool _loadingDetails = false;
  String? _detailsError;

  Future<void> _loadDetails() async {
    if (!mounted) return;
    setState(() {
      _loadingDetails = true;
      _detailsError = null;
    });
    try {
      final stationRepo = getIt<IStationRepository>();
      final result = await stationRepo.getStationByChargerId(widget.chargerId);
      result.fold(
        (failure) {
          if (mounted) {
            setState(() {
              _loadingDetails = false;
              _detailsError = 'Không tìm thấy thông tin trạm sạc';
            });
          }
        },
        (station) {
          if (mounted) {
            ChargerEntity? matchingCharger;
            for (final c in station.chargers) {
              if (c.id == widget.chargerId || c.connectorId == widget.chargerId) {
                matchingCharger = c;
                break;
              }
            }
            setState(() {
              _station = station;
              _charger = matchingCharger ?? (station.chargers.isNotEmpty ? station.chargers.first : null);
              _loadingDetails = false;
            });
          }
        },
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadingDetails = false;
          _detailsError = 'Lỗi tải thông tin trạm: $e';
        });
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    context.read<BookingBloc>().add(QueueJoin(chargerId: widget.chargerId));
    _loadDetails();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  Widget _buildInfoCard() {
    if (_loadingDetails) {
      return const GlassContainer(
        padding: EdgeInsets.all(AppSpacing.md),
        child: Center(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 8.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.secondary),
                ),
                SizedBox(width: AppSpacing.md),
                Text('Đang tải thông tin trạm...', style: TextStyle(color: Colors.white70)),
              ],
            ),
          ),
        ),
      );
    }

    if (_detailsError != null) {
      return GlassContainer(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Text(
          _detailsError!,
          style: const TextStyle(color: AppColors.danger),
          textAlign: TextAlign.center,
        ),
      );
    }

    final chargerNameText = _charger?.name ?? 'Trụ sạc #${widget.chargerId.substring(0, widget.chargerId.length > 8 ? 8 : widget.chargerId.length)}';
    final stationNameText = _station?.name ?? 'Hàng đợi sạc xe';
    final stationAddressText = _station?.address ?? '';

    return GlassContainer(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.ev_station_rounded, color: AppColors.secondary, size: 24),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  stationNameText,
                  style: AppTypography.bodyLg.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          if (stationAddressText.isNotEmpty) ...[
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.left(32.0),
              child: Text(
                stationAddressText,
                style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
          const Divider(color: Colors.white12, height: AppSpacing.lg),
          _buildDetailRow(
            icon: Icons.electric_car_rounded,
            label: 'Trụ sạc',
            value: chargerNameText,
          ),
          const SizedBox(height: AppSpacing.sm),
          _buildDetailRow(
            icon: Icons.tag_rounded,
            label: 'Mã trụ sạc',
            value: widget.chargerId.substring(0, widget.chargerId.length > 8 ? 8 : widget.chargerId.length).toUpperCase(),
          ),
          if (_charger?.connectorType != null && _charger!.connectorType.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            _buildDetailRow(
              icon: Icons.power_rounded,
              label: 'Cổng sạc',
              value: _charger!.connectorType,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDetailRow({required IconData icon, required String label, required String value}) {
    return Row(
      children: [
        Icon(icon, color: AppColors.textMuted, size: 18),
        const SizedBox(width: AppSpacing.sm),
        Text(label, style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
        const Spacer(),
        Text(
          value,
          style: AppTypography.bodyMd.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildInfoCard() {
    if (_loadingDetails) {
      return const GlassContainer(
        padding: EdgeInsets.all(AppSpacing.md),
        child: Center(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 8.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.secondary),
                ),
                SizedBox(width: AppSpacing.md),
                Text('Đang tải thông tin trạm...', style: TextStyle(color: Colors.white70)),
              ],
            ),
          ),
        ),
      );
    }

    if (_detailsError != null) {
      return GlassContainer(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Text(
          _detailsError!,
          style: const TextStyle(color: AppColors.danger),
          textAlign: TextAlign.center,
        ),
      );
    }

    final chargerNameText = _charger?.name ?? 'Trụ sạc #${widget.chargerId.substring(0, widget.chargerId.length > 8 ? 8 : widget.chargerId.length)}';
    final stationNameText = _station?.name ?? 'Hàng đợi sạc xe';
    final stationAddressText = _station?.address ?? '';

    return GlassContainer(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.ev_station_rounded, color: AppColors.secondary, size: 24),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  stationNameText,
                  style: AppTypography.bodyLg.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          if (stationAddressText.isNotEmpty) ...[
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.left(32.0),
              child: Text(
                stationAddressText,
                style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
          const Divider(color: Colors.white12, height: AppSpacing.lg),
          _buildDetailRow(
            icon: Icons.electric_car_rounded,
            label: 'Trụ sạc',
            value: chargerNameText,
          ),
          const SizedBox(height: AppSpacing.sm),
          _buildDetailRow(
            icon: Icons.tag_rounded,
            label: 'Mã trụ sạc',
            value: widget.chargerId.substring(0, widget.chargerId.length > 8 ? 8 : widget.chargerId.length).toUpperCase(),
          ),
          if (_charger?.connectorType != null && _charger!.connectorType.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            _buildDetailRow(
              icon: Icons.power_rounded,
              label: 'Cổng sạc',
              value: _charger!.connectorType,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDetailRow({required IconData icon, required String label, required String value}) {
    return Row(
      children: [
        Icon(icon, color: AppColors.textMuted, size: 18),
        const SizedBox(width: AppSpacing.sm),
        Text(label, style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
        const Spacer(),
        Text(
          value,
          style: AppTypography.bodyMd.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildInfoCard() {
    if (_loadingDetails) {
      return const GlassContainer(
        padding: EdgeInsets.all(AppSpacing.md),
        child: Center(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 8.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.secondary),
                ),
                SizedBox(width: AppSpacing.md),
                Text('Đang tải thông tin trạm...', style: TextStyle(color: Colors.white70)),
              ],
            ),
          ),
        ),
      );
    }

    if (_detailsError != null) {
      return GlassContainer(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Text(
          _detailsError!,
          style: const TextStyle(color: AppColors.danger),
          textAlign: TextAlign.center,
        ),
      );
    }

    final chargerNameText = _charger?.name ?? 'Trụ sạc #${widget.chargerId.substring(0, widget.chargerId.length > 8 ? 8 : widget.chargerId.length)}';
    final stationNameText = _station?.name ?? 'Hàng đợi sạc xe';
    final stationAddressText = _station?.address ?? '';

    return GlassContainer(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.ev_station_rounded, color: AppColors.secondary, size: 24),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  stationNameText,
                  style: AppTypography.bodyLg.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          if (stationAddressText.isNotEmpty) ...[
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.left(32.0),
              child: Text(
                stationAddressText,
                style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
          const Divider(color: Colors.white12, height: AppSpacing.lg),
          _buildDetailRow(
            icon: Icons.electric_car_rounded,
            label: 'Trụ sạc',
            value: chargerNameText,
          ),
          const SizedBox(height: AppSpacing.sm),
          _buildDetailRow(
            icon: Icons.tag_rounded,
            label: 'Mã trụ sạc',
            value: widget.chargerId.substring(0, widget.chargerId.length > 8 ? 8 : widget.chargerId.length).toUpperCase(),
          ),
          if (_charger?.connectorType != null && _charger!.connectorType.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            _buildDetailRow(
              icon: Icons.power_rounded,
              label: 'Cổng sạc',
              value: _charger!.connectorType,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDetailRow({required IconData icon, required String label, required String value}) {
    return Row(
      children: [
        Icon(icon, color: AppColors.textMuted, size: 18),
        const SizedBox(width: AppSpacing.sm),
        Text(label, style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
        const Spacer(),
        Text(
          value,
          style: AppTypography.bodyMd.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
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
        bottom: true,
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
    final isYourTurn = state.position == 0;

    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: IntrinsicHeight(
            child: Padding(
              padding: AppLayout.paddingWithHeader(context).copyWith(
                bottom: AppSpacing.lg,
              ),
              child: Column(
                children: [
                  const SizedBox(height: AppSpacing.md),

                  // ── Premium Pulse Circular Status Marker ──
                  AnimatedBuilder(
                    animation: _pulseController,
                    builder: (_, __) => Container(
                      width: 170,
                      height: 170,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: isYourTurn
                              ? [
                                  AppColors.success.withValues(
                                      alpha: 0.2 + 0.15 * _pulseController.value),
                                  AppColors.success.withValues(alpha: 0.04),
                                ]
                              : [
                                  AppColors.secondary.withValues(
                                      alpha: 0.15 + 0.1 * _pulseController.value),
                                  AppColors.secondary.withValues(alpha: 0.04),
                                ],
                        ),
                        border: Border.all(
                          color: isYourTurn
                              ? AppColors.success.withValues(
                                  alpha: 0.4 + 0.3 * _pulseController.value)
                              : AppColors.secondary.withValues(
                                  alpha: 0.3 + 0.2 * _pulseController.value),
                          width: 2.5,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: isYourTurn
                                ? AppColors.success.withValues(
                                    alpha: 0.15 * _pulseController.value)
                                : AppColors.secondary.withValues(
                                    alpha: 0.1 * _pulseController.value),
                            blurRadius: 20,
                            spreadRadius: 2,
                          )
                        ],
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (isYourTurn) ...[
                            ShaderMask(
                              shaderCallback: (bounds) =>
                                  AppColors.cyanLimeGradient.createShader(bounds),
                              child: const Icon(
                                Icons.bolt_rounded,
                                size: 60,
                                color: Colors.white,
                              ),
                            ),
                          ] else ...[
                            Text(
                              'Số ${state.position ?? '--'}',
                              style: AppTypography.displayLg.copyWith(
                                color: AppColors.secondary,
                                fontWeight: FontWeight.w800,
                                fontSize: 48,
                              ),
                            ),
                            Text(
                              'Thứ tự chờ của bạn',
                              style: AppTypography.caption
                                  .copyWith(color: AppColors.textMuted),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _buildInfoCard(),
                  const SizedBox(height: AppSpacing.md),

                  // ── Dynamic Glass Card Layout based on Queue State ──
                  if (isYourTurn) ...[
                    // Your Turn State Card
                    GlassContainer(
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.check_circle,
                                  color: AppColors.success, size: 28),
                              const SizedBox(width: AppSpacing.sm),
                              Text(
                                'ĐẾN LƯỢT BẠN!',
                                style: AppTypography.headingMd.copyWith(
                                  color: AppColors.success,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Text(
                            'Trụ sạc của bạn đã sẵn sàng và được giữ chỗ. Vui lòng di chuyển xe đến trụ sạc và quét mã QR để bắt đầu phiên sạc ngay lập tức.',
                            style: AppTypography.bodyMd.copyWith(
                              color: AppColors.textLight,
                              height: 1.4,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            'Lưu ý: Lượt sạc của bạn sẽ tự động hết hạn sau 5 phút nếu không kích hoạt.',
                            style: AppTypography.caption.copyWith(
                              color: AppColors.danger.withValues(alpha: 0.95),
                              fontWeight: FontWeight.w600,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  ] else ...[
                    // Waiting State Card
                    if (state.estimatedWaitMinutes != null)
                      GlassContainer(
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(AppSpacing.md),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: AppColors.secondary.withValues(alpha: 0.1),
                                  ),
                                  child: const Icon(Icons.timer_outlined,
                                      color: AppColors.secondary, size: 28),
                                ),
                                const SizedBox(width: AppSpacing.md),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '~ ${state.estimatedWaitMinutes} phút',
                                        style: AppTypography.headingLg.copyWith(
                                          color: AppColors.secondary,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        'Thời gian chờ ước tính',
                                        style: AppTypography.caption
                                            .copyWith(color: AppColors.textMuted),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const Divider(color: Colors.white12, height: AppSpacing.lg),
                            Row(
                              children: [
                                const Icon(Icons.info_outline, color: AppColors.warning, size: 18),
                                const SizedBox(width: AppSpacing.sm),
                                Expanded(
                                  child: Text(
                                    'Đợi đến khi trụ sẵn sàng mới đến lượt sạc của bạn.',
                                    style: AppTypography.caption.copyWith(
                                      color: AppColors.textLight,
                                      height: 1.3,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                  ],

                  const Spacer(),

                  // Bottom informational text
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                    child: Text(
                      isYourTurn
                          ? 'Đang giữ chỗ cho bạn. Cảm ơn đã kiên nhẫn chờ đợi!'
                          : 'Hệ thống tự động cập nhật mỗi 30 giây. Bạn sẽ nhận được thông báo khi trụ sạc sẵn sàng.',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.textMuted,
                        height: 1.4,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),

                  // ── Dynamic Call To Action Buttons ──
                  if (isYourTurn) ...[
                    EVButton(
                      label: 'Quét QR để sạc ngay',
                      variant: EVButtonVariant.primary,
                      icon: Icons.qr_code_scanner_rounded,
                      onPressed: () {
                        context.push('/charging/scan');
                      },
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],

                  EVButton(
                    label: isYourTurn ? 'Từ chối lượt sạc' : 'Rời hàng đợi',
                    variant: EVButtonVariant.danger,
                    icon: isYourTurn
                        ? Icons.cancel_outlined
                        : Icons.exit_to_app_outlined,
                    onPressed: () {
                      context.read<BookingBloc>().add(
                          QueueLeave(chargerId: widget.chargerId));
                      context.pop();
                    },
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
