import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:get_it/get_it.dart';
import '../bloc/booking_bloc.dart';
import '../../domain/entities/booking_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/alert_banner.dart';
import '../../../../core/design_system/widgets/glass_container.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../map/domain/usecases/get_charger_pricing_usecase.dart';
import '../../../map/domain/entities/station_entity.dart';
import '../widgets/booking_date_selector.dart';
import '../widgets/time_picker_card.dart';
import '../widgets/booking_summary_panel.dart';
import '../widgets/booking_timeline.dart';
import '../widgets/booking_mode_tabs.dart';
import '../widgets/booking_legend.dart';

/// New Slot Booking and Scheduler Screen — Liquid Glass Design System
///
/// Supports two booking modes:
///   1. Quick Slot Grid (30-min blocks)
///   2. Custom Time Picker (precision hour/minute selection)
class BookingNewScreen extends StatefulWidget {
  final String chargerId;
  final String stationId;
  final String connectorType;
  final String physicalChargerId;

  const BookingNewScreen({
    super.key,
    required this.chargerId,
    required this.stationId,
    required this.connectorType,
    this.physicalChargerId = '',
  });

  @override
  State<BookingNewScreen> createState() => _BookingNewScreenState();
}

class _BookingNewScreenState extends State<BookingNewScreen>
    with SingleTickerProviderStateMixin {
  DateTime _selectedDate = DateTime.now();

  // Quick-mode range selection
  AvailabilitySlotEntity? _rangeStart;
  AvailabilitySlotEntity? _rangeEnd;

  // Dynamic pricing
  PricingEntity? _pricingEstimate;
  bool _isPricingLoading = false;
  String? _pricingError;

  // Custom time mode
  bool _isCustomMode = false;
  TimeOfDay? _customStartTime;
  TimeOfDay? _customEndTime;

  @override
  void initState() {
    super.initState();
    if (widget.chargerId.isNotEmpty) {
      _loadSlots();
    }
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  void _loadSlots() {
    setState(() {
      _rangeStart = null;
      _rangeEnd = null;
      _pricingEstimate = null;
      _pricingError = null;
    });
    context.read<BookingBloc>().add(BookingLoadAvailability(
          chargerId: widget.chargerId,
          date: _selectedDate,
        ));
  }

  Future<void> _fetchPricingEstimate() async {
    final start = _rangeStart;
    if (start == null) return;
    final end = _rangeEnd ?? start;

    setState(() {
      _isPricingLoading = true;
      _pricingError = null;
    });

    try {
      final usecase = GetIt.I<GetChargerPricingUseCase>();
      final result = await usecase.call(
        stationId: widget.stationId,
        chargerId: widget.physicalChargerId.isNotEmpty
            ? widget.physicalChargerId
            : widget.chargerId,
        connectorType: widget.connectorType,
        startTime: start.startTime,
        endTime: end.endTime,
      );

      if (mounted) {
        result.fold(
          (failure) => setState(() {
            _pricingError = failure.message;
            _isPricingLoading = false;
          }),
          (pricing) => setState(() {
            _pricingEstimate = pricing;
            _isPricingLoading = false;
          }),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _pricingError = 'Lỗi tải báo giá: $e';
          _isPricingLoading = false;
        });
      }
    }
  }

  // ── Mode switching ────────────────────────────────────────────────────────

  void _switchMode(bool isCustom) {
    if (_isCustomMode == isCustom) return;
    HapticFeedback.selectionClick();
    setState(() {
      _isCustomMode = isCustom;
      _rangeStart = null;
      _rangeEnd = null;
      _pricingEstimate = null;
      _pricingError = null;
      if (isCustom) {
        final now = TimeOfDay.now();
        final startHour = (now.hour + 1) % 24;
        _customStartTime = TimeOfDay(hour: startHour, minute: 0);
        _customEndTime = TimeOfDay(hour: (startHour + 1) % 24, minute: 0);
      } else {
        _customStartTime = null;
        _customEndTime = null;
      }
    });
    if (isCustom) _updateCustomTimes();
  }

  // ── Custom time validation ────────────────────────────────────────────────

  bool _checkCustomConflict(DateTime startDt, DateTime endDt) {
    final state = context.read<BookingBloc>().state;
    if (state is BookingAvailabilityLoaded) {
      for (final slot in state.slots) {
        if (!slot.isAvailable) {
          if (startDt.isBefore(slot.endTime) && endDt.isAfter(slot.startTime)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  void _updateCustomTimes() {
    if (_customStartTime == null || _customEndTime == null) {
      setState(() { _rangeStart = null; _pricingError = null; });
      return;
    }

    final now = DateTime.now();
    final startDt = DateTime(
      _selectedDate.year, _selectedDate.month, _selectedDate.day,
      _customStartTime!.hour, _customStartTime!.minute,
    );
    var endDt = DateTime(
      _selectedDate.year, _selectedDate.month, _selectedDate.day,
      _customEndTime!.hour, _customEndTime!.minute,
    );
    if (!endDt.isAfter(startDt)) endDt = endDt.add(const Duration(days: 1));

    final duration = endDt.difference(startDt);
    if (duration.inMinutes < 15) {
      setState(() { _rangeStart = null; _pricingError = 'Thời gian sạc tối thiểu là 15 phút.'; });
      return;
    }
    if (duration.inHours > 24) {
      setState(() { _rangeStart = null; _pricingError = 'Thời gian sạc tối đa là 24 giờ.'; });
      return;
    }
    if (startDt.isBefore(now)) {
      setState(() { _rangeStart = null; _pricingError = 'Thời gian bắt đầu không thể ở quá khứ.'; });
      return;
    }
    if (_checkCustomConflict(startDt, endDt)) {
      setState(() { _rangeStart = null; _pricingError = 'Khoảng giờ trùng với lịch đã bận!'; });
      return;
    }

    setState(() {
      _rangeStart = AvailabilitySlotEntity(
        startTime: startDt, endTime: endDt, isAvailable: true,
      );
      _rangeEnd = null;
      _pricingError = null;
    });
    _fetchPricingEstimate();
  }

  Future<void> _pickTime(BuildContext context, {required bool isStart}) async {
    final initial = isStart
        ? (_customStartTime ?? const TimeOfDay(hour: 8, minute: 0))
        : (_customEndTime ?? const TimeOfDay(hour: 9, minute: 0));

    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
      builder: (ctx, child) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        return Theme(
          data: Theme.of(ctx).copyWith(
            timePickerTheme: TimePickerThemeData(
              backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null && mounted) {
      HapticFeedback.selectionClick();
      setState(() {
        if (isStart) { _customStartTime = picked; }
        else { _customEndTime = picked; }
      });
      _updateCustomTimes();
    }
  }

  // ── Quick mode slot handling ──────────────────────────────────────────────

  void _handleSlotTap(AvailabilitySlotEntity slot, List<AvailabilitySlotEntity> allSlots) {
    HapticFeedback.lightImpact();

    if (_rangeStart == null || _rangeEnd != null) {
      setState(() {
        _rangeStart = slot;
        _rangeEnd = null;
        _pricingEstimate = null;
        _pricingError = null;
      });
      _fetchPricingEstimate();
    } else {
      if (slot.startTime.isBefore(_rangeStart!.startTime)) {
        setState(() { _rangeStart = slot; _rangeEnd = null; _pricingEstimate = null; });
        _fetchPricingEstimate();
      } else if (slot == _rangeStart) {
        // same slot, no-op
      } else {
        final startIdx = allSlots.indexOf(_rangeStart!);
        final endIdx = allSlots.indexOf(slot);
        final now = DateTime.now();
        bool conflict = false;
        for (int k = startIdx; k <= endIdx; k++) {
          if (!allSlots[k].isAvailable || allSlots[k].startTime.isBefore(now)) {
            conflict = true;
            break;
          }
        }
        if (conflict) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Khoảng giờ chứa ô đã bận hoặc quá giờ!'),
              backgroundColor: AppColors.error,
            ),
          );
        } else {
          setState(() { _rangeEnd = slot; });
          _fetchPricingEstimate();
        }
      }
    }
  }

  bool _isSlotInRange(AvailabilitySlotEntity slot) {
    if (_rangeStart == null) return false;
    final start = _rangeStart!.startTime;
    if (_rangeEnd == null) return slot == _rangeStart;
    final end = _rangeEnd!.endTime;
    return !slot.startTime.isBefore(start) && !slot.endTime.isAfter(end);
  }

  void _confirmBooking() {
    final start = _rangeStart;
    if (start == null) return;
    final end = _rangeEnd ?? start;
    context.read<BookingBloc>().add(BookingCreate(
          chargerId: widget.chargerId,
          stationId: widget.stationId,
          connectorType: widget.connectorType,
          startTime: start.startTime,
          endTime: end.endTime,
        ));
  }

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthBloc>().state;
    final hasArrears = authState is AuthAuthenticated && authState.hasArrears;

    // Guard: no charger selected
    if (widget.chargerId.isEmpty) {
      return LiquidGlassScaffold(
        appBar: AppBar(
          title: const Text('Đặt lịch sạc'),
          backgroundColor: Colors.transparent,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios),
            onPressed: () => context.pop(),
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: GlassContainer(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.ev_station_rounded,
                          color: AppColors.primary, size: 48),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('Chưa chọn trụ sạc', style: AppTypography.headingMd),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'Vui lòng quay lại màn hình bản đồ để lựa chọn trạm sạc phù hợp.',
                      textAlign: TextAlign.center,
                      style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    EVButton(label: 'Quay lại Bản đồ', onPressed: () => context.go('/map')),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return LiquidGlassScaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Đặt lịch sạc'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios),
          onPressed: () => context.pop(),
        ),
      ),
      child: SafeArea(
        child: BlocConsumer<BookingBloc, BookingState>(
          listener: (context, state) {
            if (state is BookingCreated) {
              HapticFeedback.heavyImpact();
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Đặt lịch thành công! Vui lòng thanh toán.'),
                backgroundColor: AppColors.primary,
              ));
              context.go('/bookings/${state.booking.id}');
            } else if (state is BookingError) {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text(state.message),
                backgroundColor: AppColors.error,
              ));
            }
          },
          builder: (context, state) {
            final showSummary = _rangeStart != null || (_isCustomMode && _pricingError != null);
            final isDark = Theme.of(context).brightness == Brightness.dark;

            return Stack(
              children: [
                // ── Main Content Column ──
                Column(
                  children: [
                    if (hasArrears)
                      ArrearsAlertBanner(
                        amount: 'Nợ tồn đọng — không thể đặt lịch',
                        onTap: () => context.go('/wallet'),
                      ),

                    // ── Date selector ──────────────────────────────────
                    BookingDateSelector(
                      selected: _selectedDate,
                      onChanged: (d) {
                        setState(() { _selectedDate = d; });
                        _loadSlots();
                        if (_isCustomMode) _updateCustomTimes();
                      },
                    ),

                    // ── Mode tabs ──────────────────────────────────────
                    BookingModeTabs(
                      isCustomMode: _isCustomMode,
                      onModeChanged: _switchMode,
                    ),

                    // ── Legend (Quick mode only) ───────────────────────
                    if (!_isCustomMode)
                      const Padding(
                        padding: EdgeInsets.fromLTRB(
                            AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xs),
                        child: BookingLegend(),
                      ),

                    // ── Main content scroll view ───────────────────────
                    Expanded(
                      child: _isCustomMode
                          ? _buildCustomContent(context, state, showSummary)
                          : _buildQuickGrid(context, state, hasArrears, showSummary),
                    ),
                  ],
                ),

                // ── Tap-Absorbing Modal Barrier ──
                Positioned.fill(
                  child: IgnorePointer(
                    ignoring: !showSummary,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      color: showSummary
                          ? (isDark ? Colors.black.withValues(alpha: 0.4) : Colors.black.withValues(alpha: 0.2))
                          : Colors.transparent,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          HapticFeedback.lightImpact();
                          setState(() {
                            _rangeStart = null;
                            _rangeEnd = null;
                            _pricingEstimate = null;
                            _pricingError = null;
                            if (_isCustomMode) {
                              _customStartTime = null;
                              _customEndTime = null;
                            }
                          });
                        },
                      ),
                    ),
                  ),
                ),

                // ── Sliding Swipe-to-Dismiss Summary Panel ──
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 280),
                  curve: Curves.easeOutCubic,
                  left: 0,
                  right: 0,
                  bottom: showSummary ? 0 : -360,
                  child: GestureDetector(
                    onVerticalDragEnd: (details) {
                      if (details.primaryVelocity != null && details.primaryVelocity! > 100) {
                        HapticFeedback.lightImpact();
                        setState(() {
                          _rangeStart = null;
                          _rangeEnd = null;
                          _pricingEstimate = null;
                          _pricingError = null;
                          if (_isCustomMode) {
                            _customStartTime = null;
                            _customEndTime = null;
                          }
                        });
                      }
                    },
                    child: BookingSummaryPanel(
                      rangeStart: _rangeStart,
                      rangeEnd: _rangeEnd,
                      pricing: _pricingEstimate,
                      isPricingLoading: _isPricingLoading,
                      pricingError: _pricingError,
                      isLoading: state is BookingLoading,
                      canConfirm: !hasArrears &&
                          _pricingError == null &&
                          _rangeStart != null,
                      onConfirm: _confirmBooking,
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  // ── Quick Grid ────────────────────────────────────────────────────────────

  Widget _buildQuickGrid(
      BuildContext context, BookingState state, bool hasArrears, bool showSummary) {
    if (state is BookingLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state is BookingAvailabilityLoaded) {
      if (state.slots.isEmpty) {
        return Center(
          child: Text('Không có slot khả dụng',
              style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
        );
      }

      final now = DateTime.now();
      final isDark = Theme.of(context).brightness == Brightness.dark;

      return GridView.builder(
        padding: EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.xs,
            AppSpacing.lg,
            showSummary ? 260.0 : AppSpacing.lg),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          childAspectRatio: 1.7,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
        ),
        itemCount: state.slots.length,
        itemBuilder: (_, i) {
          final slot = state.slots[i];
          final isPast = slot.startTime.isBefore(now);
          final isAvailable = slot.isAvailable && !isPast && !hasArrears;
          final isSelected = _isSlotInRange(slot);

          Color? cardBgColor;
          Gradient? cardGradient;
          Color cardBorderColor;
          Color timeTextColor;
          Color statusTextColor;
          IconData? statusIcon;
          Color? iconColor;

          if (isSelected) {
            cardGradient = AppColors.cyanLimeGradient;
            cardBorderColor = AppColors.primary;
            timeTextColor = Colors.white;
            statusTextColor = Colors.white.withValues(alpha: 0.9);
          } else if (isAvailable) {
            cardBgColor = AppColors.primary.withValues(alpha: 0.08);
            cardBorderColor = AppColors.primary.withValues(alpha: 0.35);
            timeTextColor = AppColors.primary;
            statusTextColor = AppColors.primary.withValues(alpha: 0.8);
          } else if (isPast) {
            cardBgColor = isDark
                ? Colors.white.withValues(alpha: 0.03)
                : Colors.black.withValues(alpha: 0.03);
            cardBorderColor = AppColors.outlineLight.withValues(alpha: 0.2);
            timeTextColor = AppColors.textMuted.withValues(alpha: 0.6);
            statusTextColor = AppColors.textMuted.withValues(alpha: 0.5);
            statusIcon = Icons.history_rounded;
            iconColor = AppColors.textMuted.withValues(alpha: 0.5);
          } else {
            // isBooked / hasArrears
            cardBgColor = AppColors.error.withValues(alpha: 0.06);
            cardBorderColor = AppColors.error.withValues(alpha: 0.3);
            timeTextColor = AppColors.error;
            statusTextColor = AppColors.error.withValues(alpha: 0.8);
            statusIcon = Icons.lock_outline_rounded;
            iconColor = AppColors.error.withValues(alpha: 0.8);
          }

          return GestureDetector(
            onTap: isAvailable
                ? () => _handleSlotTap(slot, state.slots)
                : () {
                    HapticFeedback.mediumImpact();
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(isPast
                          ? 'Khung giờ này đã trôi qua!'
                          : 'Khung giờ này đã được đặt trước!'),
                      duration: const Duration(seconds: 1),
                      backgroundColor: AppColors.error.withValues(alpha: 0.9),
                    ));
                  },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              decoration: BoxDecoration(
                gradient: cardGradient,
                color: cardBgColor,
                borderRadius: BorderRadius.circular(AppRadius.sm),
                border: Border.all(
                  color: cardBorderColor,
                  width: isSelected ? 1.5 : 1.0,
                ),
                boxShadow: isSelected
                    ? [
                        BoxShadow(
                          color: AppColors.primary.withValues(alpha: 0.3),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        )
                      ]
                    : null,
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        ev_date.DateUtils.formatTimeHm(slot.startTime),
                        style: TextStyle(
                          color: timeTextColor,
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        isSelected
                            ? 'Đang chọn'
                            : isAvailable
                                ? 'Còn trống'
                                : isPast
                                    ? 'Quá giờ'
                                    : 'Đã bận',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: isSelected || isAvailable
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: statusTextColor,
                        ),
                      ),
                    ],
                  ),
                  if (statusIcon != null)
                    Positioned(
                      top: 3,
                      right: 3,
                      child: Icon(
                        statusIcon,
                        size: 9,
                        color: iconColor,
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      );
    }
    return const Center(child: Text('Vui lòng chọn ngày để xem lịch sạc'));
  }

  // ── Custom Time Picker ────────────────────────────────────────────────────

  Widget _buildCustomContent(BuildContext context, BookingState state, bool showSummary) {
    List<AvailabilitySlotEntity> slots = [];
    if (state is BookingAvailabilityLoaded) slots = state.slots;

    bool isNextDay = false;
    if (_customStartTime != null && _customEndTime != null) {
      final startDt = DateTime(
        _selectedDate.year, _selectedDate.month, _selectedDate.day,
        _customStartTime!.hour, _customStartTime!.minute,
      );
      var endDt = DateTime(
        _selectedDate.year, _selectedDate.month, _selectedDate.day,
        _customEndTime!.hour, _customEndTime!.minute,
      );
      if (!endDt.isAfter(startDt)) endDt = endDt.add(const Duration(days: 1));
      isNextDay = endDt.day != startDt.day ||
          endDt.month != startDt.month ||
          endDt.year != startDt.year;
    }

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.xs,
          AppSpacing.lg,
          showSummary ? 260.0 : AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Info tip
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(AppRadius.full),
              border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.info_outline_rounded,
                    size: 13, color: AppColors.primary),
                const SizedBox(width: 6),
                Text(
                  'Chọn bất kỳ khung giờ theo nhu cầu của bạn',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: AppSpacing.md),

          // Time picker cards
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: TimePickerCard(
                    label: 'Bắt đầu',
                    icon: Icons.play_circle_rounded,
                    accentColor: AppColors.primary,
                    time: _customStartTime,
                    onTap: () => _pickTime(context, isStart: true),
                    isStart: true,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.primary.withValues(alpha: 0.1),
                          border: Border.all(
                              color: AppColors.primary.withValues(alpha: 0.3)),
                        ),
                        child: const Icon(Icons.arrow_forward_rounded,
                            size: 14, color: AppColors.primary),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: TimePickerCard(
                    label: 'Kết thúc',
                    icon: Icons.stop_circle_rounded,
                    accentColor: AppColors.secondary,
                    time: _customEndTime,
                    onTap: () => _pickTime(context, isStart: false),
                    isStart: false,
                    isNextDay: isNextDay,
                  ),
                ),
              ],
            ),
          ),

          // Duration badge
          if (_rangeStart != null && _pricingError == null) ...[
            const SizedBox(height: AppSpacing.md),
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
                decoration: BoxDecoration(
                  gradient: AppColors.cyanLimeGradient,
                  borderRadius: BorderRadius.circular(AppRadius.full),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.3),
                      blurRadius: 12,
                    )
                  ],
                ),
                child: Builder(builder: (ctx) {
                  final dur = _rangeStart!.endTime
                      .difference(_rangeStart!.startTime);
                  final h = dur.inHours;
                  final m = dur.inMinutes % 60;
                  final s = h > 0
                      ? '${h}h${m > 0 ? ' ${m}p' : ''}'
                      : '$m phút';
                  return Text('⚡ Thời gian sạc: $s',
                      style: AppTypography.caption.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ));
                }),
              ),
            ),
          ],

          // Error banner
          if (_pricingError != null && _isCustomMode) ...[
            const SizedBox(height: AppSpacing.md),
            GlassContainer(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber_rounded,
                      color: AppColors.error, size: 18),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      _pricingError!,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.error,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          // Availability timeline
          if (slots.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),
            BookingTimeline(
              selectedDate: _selectedDate,
              slots: slots,
              rangeStart: _rangeStart,
            ),
          ],
        ],
      ),
    );
  }
}
