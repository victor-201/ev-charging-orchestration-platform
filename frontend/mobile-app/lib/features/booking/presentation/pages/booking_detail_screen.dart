import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../bloc/booking_bloc.dart';
import '../../domain/entities/booking_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/ev_header.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_container.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../../../features/map/domain/entities/station_entity.dart';
import '../../../../features/map/domain/repositories/i_station_repository.dart';
import '../widgets/booking_station_card.dart';
import '../widgets/booking_info_row.dart';
import '../widgets/payment_bottom_sheet.dart';

/// Detailed Reservation Information Screen
///
/// Renders comprehensive transaction records for an EV connector reservation,
/// displaying countdown timers, secure QR tokens, and interactive cancel workflows.
class BookingDetailScreen extends StatefulWidget {
  final String bookingId;
  const BookingDetailScreen({super.key, required this.bookingId});

  @override
  State<BookingDetailScreen> createState() => _BookingDetailScreenState();
}

class _BookingDetailScreenState extends State<BookingDetailScreen> {
  late BookingBloc _bookingBloc;
  Timer? _timer;
  Duration _qrRemaining = Duration.zero;
  bool _qrValid = false;

  // Station and charger detail fields
  StationEntity? _station;
  ChargerEntity? _charger;
  PricingEntity? _pricing;
  bool _loadingStation = false;
  String? _stationError;
  bool _didShowPayment = false;
  bool _isBottomSheetOpen = false;
  bool _paymentInitiated = false; // guards duplicate VNPay launch

  @override
  void initState() {
    super.initState();
    _bookingBloc = context.read<BookingBloc>();
    _bookingBloc.add(BookingLoadDetail(id: widget.bookingId));
  }

  Future<void> _loadStationDetails(BookingEntity booking) async {
    final chargerId = booking.chargerId;

    // If already loaded and matches chargerId, skip
    if (_station != null &&
        _charger != null &&
        (_charger!.id == chargerId || _charger!.connectorId == chargerId)) {
      return;
    }
    setState(() {
      _loadingStation = true;
      _stationError = null;
    });

    try {
      final stationRepo = getIt<IStationRepository>();
      final result = await stationRepo.getStationByChargerId(chargerId);

      if (mounted) {
        await result.fold(
          (failure) async {
            setState(() {
              _loadingStation = false;
              _stationError = 'Không tìm thấy thông tin trạm sạc từ mã trụ sạc: $chargerId (${failure.message})';
            });
          },
          (station) async {
            ChargerEntity? matchingCharger;
            for (final c in station.chargers) {
              if (c.id == chargerId || c.connectorId == chargerId) {
                matchingCharger = c;
                break;
              }
            }
            if (matchingCharger == null && station.chargers.isNotEmpty) {
              matchingCharger = station.chargers.first;
            }

            setState(() {
              _station = station;
              _charger = matchingCharger;
            });

            // Fetch pricing dynamically
            if (matchingCharger != null) {
              try {
                final resolvedConnectorType = matchingCharger.connectorType.isNotEmpty
                    ? matchingCharger.connectorType
                    : (booking.connectorType.isNotEmpty ? booking.connectorType : 'GB/T');

                final pricingResult = await stationRepo.getChargerPricing(
                  stationId: station.id,
                  chargerId: matchingCharger.id,
                  connectorType: resolvedConnectorType,
                  startTime: booking.startTime,
                  endTime: booking.endTime,
                );
                pricingResult.fold(
                  (pricingFailure) {
                    debugPrint('Failed to load dynamic pricing: ${pricingFailure.message}');
                  },
                  (pricing) {
                    if (mounted) {
                      setState(() {
                        _pricing = pricing;
                      });
                    }
                  },
                );
              } catch (e) {
                debugPrint('Error loading dynamic pricing: $e');
              }
            }

            if (mounted) {
              setState(() {
                _loadingStation = false;
              });
            }
          },
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadingStation = false;
          _stationError = 'Lỗi truy xuất thông tin sạc: $e';
        });
      }
    }
  }

  /// Returns the raw booking.qrToken.
  String _bookingQrData(BookingEntity booking) {
    return booking.qrToken ?? '';
  }

  Future<void> _openGoogleMaps() async {
    if (_station == null) return;
    final url = Uri.parse(
      'https://www.google.com/maps/dir/?api=1'
      '&destination=${_station!.latitude},${_station!.longitude}'
      '&travelmode=driving',
    );
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      if (mounted) {
        EVToast.show(context, message: 'Không thể mở ứng dụng bản đồ.', isError: true);
      }
    }
  }

  void _startCountdown(BookingEntity b) {
    _timer?.cancel();
    _tick(b);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) _tick(b);
    });
  }

  void _tick(BookingEntity b) {
    final now = DateTime.now();
    final from = b.startTime.subtract(const Duration(minutes: 15));
    final until = b.endTime.add(const Duration(minutes: 5));
    final valid = now.isAfter(from) && now.isBefore(until);
    setState(() {
      _qrValid = valid;
      _qrRemaining = valid
          ? until.difference(now)
          : now.isBefore(from)
              ? from.difference(now)
              : Duration.zero;
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _bookingBloc.add(const BookingStopPolling());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      extendBodyBehindAppBar: true,
      appBar: EVHeader(
        title: 'Chi tiết đặt lịch',
        showBackButton: true,
        onBackTapped: () => context.pop(true),
      ),
      child: BlocConsumer<BookingBloc, BookingState>(
          listener: (context, state) {
            if (state is BookingDetailLoaded) {
              _startCountdown(state.booking);
              _loadStationDetails(state.booking);
              if (!state.booking.isPendingPayment) {
                _bookingBloc.add(const BookingStopPolling());
              }
              if (state.booking.isPendingPayment && !_didShowPayment) {
                _didShowPayment = true;
                WidgetsBinding.instance.addPostFrameCallback((_) async {
                  _isBottomSheetOpen = true;
                  await PaymentBottomSheet.show(context, booking: state.booking);
                  if (mounted) _isBottomSheetOpen = false;
                });
              }
            }
            if (state is BookingCancelled) {
              EVToast.show(context, message: 'Đã hủy thành công!', isError: false);
              // Capture router before async gap to avoid lint warning
              final router = GoRouter.of(context);
              // Introduce a tiny delay so backend event bus can process cancellation state
              Future.delayed(const Duration(milliseconds: 800), () {
                if (mounted) {
                  if (router.canPop()) {
                    router.pop(true);
                  } else {
                    router.go('/bookings');
                  }
                }
              });
            }
            if (state is BookingError) {
              if (_isBottomSheetOpen) {
                _isBottomSheetOpen = false;
                if (Navigator.canPop(context)) Navigator.pop(context);
              }
              EVToast.show(context, message: state.message, isError: true);
            }
            if (state is BookingPaymentInitiated) {
              if (_paymentInitiated) return; // prevent duplicate VNPay launch
              _paymentInitiated = true;
              if (_isBottomSheetOpen) {
                _isBottomSheetOpen = false;
                if (Navigator.canPop(context)) Navigator.pop(context);
              }
              if (state.paymentResult.method == 'gateway' && state.paymentResult.paymentUrl != null) {
                launchUrl(Uri.parse(state.paymentResult.paymentUrl!), mode: LaunchMode.externalApplication).then((_) {
                  // After returning from browser, start polling to update status automatically
                  if (mounted) {
                    _bookingBloc.add(BookingStartPolling(id: widget.bookingId));
                  }
                });
              } else {
                if (state.paymentResult.status == 'completed') {
                  EVToast.show(context, message: 'Thanh toán thành công!', isError: false);
                  _bookingBloc.add(BookingStartPolling(id: widget.bookingId));
                } else {
                  EVToast.show(context, message: 'Thanh toán thất bại, vui lòng thử lại.', isError: true);
                  _bookingBloc.add(BookingLoadDetail(id: widget.bookingId));
                }
              }
            }
          },
          builder: (context, state) {
            if (state is BookingLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            if (state is BookingDetailLoaded) {
              return _buildDetail(context, state.booking);
            }
            if (state is BookingError) {
              return Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(state.message, style: AppTypography.bodyMd.copyWith(color: AppColors.error)),
                  const SizedBox(height: AppSpacing.lg),
                  EVButton(
                    label: 'Thử lại',
                    variant: EVButtonVariant.secondary,
                    onPressed: () => context.read<BookingBloc>().add(BookingLoadDetail(id: widget.bookingId)),
                  ),
                ]),
              );
            }
            return const Center(child: CircularProgressIndicator());
          },
        ),
    );
  }

  Widget _buildDetail(BuildContext context, BookingEntity b) {
    Color statusColor;
    String statusLabel;
    switch (b.status) {
      case 'CONFIRMED':      statusColor = AppColors.cyan;             statusLabel = 'Đã xác nhận'; break;
      case 'PENDING_PAYMENT':statusColor = AppColors.warning;          statusLabel = 'Chờ thanh toán'; break;
      case 'COMPLETED':      statusColor = AppColors.success;          statusLabel = 'Hoàn thành'; break;
      case 'CANCELLED':      statusColor = AppColors.grey400;          statusLabel = 'Đã hủy'; break;
      case 'EXPIRED':        statusColor = AppColors.grey400;          statusLabel = 'Hết hạn'; break;
      case 'NO_SHOW':        statusColor = AppColors.error;            statusLabel = 'Không đến (phạt 20%)'; break;
      default:               statusColor = AppColors.grey400;          statusLabel = b.status;
    }

    final now = DateTime.now();
    final from = b.startTime.subtract(const Duration(minutes: 15));
    final isNotYet = now.isBefore(from);

    return RefreshIndicator(
      onRefresh: () async {
        context.read<BookingBloc>().add(BookingLoadDetail(id: widget.bookingId));
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: AppLayout.paddingWithHeaderAndNavbar(context).copyWith(
          bottom: AppLayout.paddingWithHeaderAndNavbar(context).bottom,
        ),
        child: Column(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: 6.0),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(AppRadius.full),
            border: Border.all(color: statusColor.withValues(alpha: 0.3)),
          ),
          child: Text(statusLabel, style: AppTypography.bodyMd.copyWith(color: statusColor, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: AppSpacing.md),

        // Beautiful Charging Station & Charger Point details card!
        BookingStationCard(
          isLoading: _loadingStation,
          error: _stationError,
          station: _station,
          charger: _charger,
          pricing: _pricing,
          booking: b,
          onRetry: () => _loadStationDetails(b),
          onOpenMaps: _openGoogleMaps,
        ),

        if (b.qrToken != null && b.isConfirmed) ...[
          // Flow 1 — Pre-booked: user shows QR to kiosk camera
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.qr_code_2, color: AppColors.primary, size: 20),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Mã QR kích hoạt sạc', style: AppTypography.headingMd),
                    Text(
                      'Đưa màn hình này cho kiosk tại trụ sạc để quét',
                      style: AppTypography.caption.copyWith(color: AppColors.grey600),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),

          // QR code display
          Center(
            child: _qrValid
                ? Container(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(AppRadius.lg),
                      boxShadow: [
                        BoxShadow(color: AppColors.primary.withValues(alpha: 0.2), blurRadius: 24, spreadRadius: 2),
                      ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        QrImageView(
                          data: _bookingQrData(b),
                          version: QrVersions.auto,
                          size: 220,
                          eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: AppColors.primary),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.camera_alt_outlined, color: AppColors.primary, size: 14),
                              const SizedBox(width: 6),
                              Text(
                                'Hướng camera kiosk vào đây',
                                style: AppTypography.caption.copyWith(
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  )
                : Container(
                    width: 220, height: 220,
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(AppRadius.lg),
                      border: Border.all(color: Theme.of(context).colorScheme.outline),
                    ),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(isNotYet ? Icons.schedule_outlined : Icons.timer_off_outlined,
                          size: 48, color: AppColors.grey400),
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        isNotYet ? 'Chưa đến giờ sạc' : 'Mã QR đã hết hạn',
                        style: AppTypography.bodyMd.copyWith(color: AppColors.grey600),
                      ),
                    ]),
                  ),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (_qrRemaining > Duration.zero)
            Center(
              child: Text(
                _qrValid
                    ? 'Mã hết hạn sau: ${ev_date.DateUtils.formatCountdown(_qrRemaining)}'
                    : 'Mã mở sau: ${ev_date.DateUtils.formatCountdown(_qrRemaining)}',
                style: AppTypography.bodyMd.copyWith(
                  color: _qrValid ? AppColors.primary : AppColors.grey600,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),

          // Step-by-step guide when QR is valid
          if (_qrValid) ...[
            const SizedBox(height: AppSpacing.lg),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: AppColors.primary.withValues(alpha: 0.15)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Hướng dẫn sử dụng',
                      style: AppTypography.bodyMd.copyWith(fontWeight: FontWeight.bold, color: AppColors.primary)),
                  const SizedBox(height: AppSpacing.sm),
                  _buildStep('1', 'Đến trụ sạc đã đặt'),
                  _buildStep('2', 'Mở màn hình này và giữ điện thoại trước camera kiosk'),
                  _buildStep('3', 'Kiosk tự động nhận diện mã và khởi động phiên sạc'),
                  _buildStep('4', 'Cắm đầu sạc vào xe khi kiosk báo sẵn sàng'),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
        ],


        Container(
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(AppRadius.md),
            border: Border.all(color: Theme.of(context).colorScheme.outline),
          ),
          child: Column(children: [
            BookingInfoRow(icon: Icons.play_circle_outline, label: 'Thời gian bắt đầu', value: ev_date.DateUtils.formatDateTime(b.startTime)),
            const Divider(height: AppSpacing.lg),
            BookingInfoRow(icon: Icons.stop_circle_outlined, label: 'Thời gian kết thúc', value: ev_date.DateUtils.formatDateTime(b.endTime)),
            if (b.depositAmount > 0) ...[
              const Divider(height: AppSpacing.lg),
              BookingInfoRow(icon: Icons.payment_outlined, label: 'Tiền đặt cọc', value: VndFormatter.format(b.depositAmount)),
            ],
            if (b.penaltyAmount != null) ...[
              const Divider(height: AppSpacing.lg),
              BookingInfoRow(icon: Icons.warning_amber_outlined, label: 'Phạt vi phạm (Không đến)',
                  value: VndFormatter.format(b.penaltyAmount!), valueColor: AppColors.error),
            ],
          ]),
        ),
        const SizedBox(height: AppSpacing.xl),

        if (b.isPendingPayment) ...[
          EVButton(
            label: 'Thanh toán ngay',
            icon: Icons.payment,
            onPressed: () async {
              _isBottomSheetOpen = true;
              await PaymentBottomSheet.show(context, booking: b);
              if (mounted) _isBottomSheetOpen = false;
            },
          ),
          const SizedBox(height: AppSpacing.md),
        ],

        if (b.isCancellable) ...[
          EVButton(
            label: 'Hủy đặt lịch (hoàn 100%)',
            variant: EVButtonVariant.danger,
            icon: Icons.cancel_outlined,
            onPressed: () {
              final isDark = Theme.of(context).brightness == Brightness.dark;
              showDialog(
                context: context,
                builder: (dialogContext) => Dialog(
                  backgroundColor: Colors.transparent,
                  elevation: 0,
                  child: GlassContainer(
                    borderRadius: BorderRadius.circular(24),
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Xác nhận hủy?',
                          style: AppTypography.headingMd.copyWith(
                            fontWeight: FontWeight.w800,
                            color: isDark ? Colors.white : AppColors.black,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          'Bạn có chắc chắn muốn hủy đặt lịch này? Bạn sẽ được hoàn 100% tiền đặt cọc.',
                          style: AppTypography.bodyMd.copyWith(
                            color: isDark ? Colors.white70 : Colors.black87,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xl),
                        EVButton(
                          label: 'Hủy đặt lịch',
                          variant: EVButtonVariant.danger,
                          onPressed: () {
                            Navigator.pop(dialogContext);
                            context.read<BookingBloc>().add(BookingCancel(id: b.id));
                          },
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        EVButton(
                          label: 'Huỷ bỏ',
                          variant: EVButtonVariant.secondary,
                          onPressed: () => Navigator.pop(dialogContext),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: AppSpacing.md),
        ],

        EVButton(
          label: 'Quay lại',
          variant: EVButtonVariant.secondary,
          icon: Icons.arrow_back,
          onPressed: () => context.pop(true),
        ),
      ]),
      ),
    );
  }

  Widget _buildStep(String number, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: const BoxDecoration(
              color: AppColors.primary,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                number,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodyMd.copyWith(fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
