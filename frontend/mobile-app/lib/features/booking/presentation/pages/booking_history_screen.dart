import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/booking_bloc.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../domain/entities/booking_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_pill.dart';
import '../../../../core/design_system/widgets/glass_square.dart';
import '../../../../core/design_system/widgets/liquid_glass_card.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/ev_header.dart';
import '../../../../core/di/injection.dart';
import '../../../../features/map/domain/entities/station_entity.dart';
import '../../../../features/map/domain/repositories/i_station_repository.dart';
import '../widgets/booking_card.dart';

/// Booking History Screen — Liquid Glass Design
class BookingHistoryScreen extends StatefulWidget {
  const BookingHistoryScreen({super.key});

  @override
  State<BookingHistoryScreen> createState() => _BookingHistoryScreenState();
}

class _BookingHistoryScreenState extends State<BookingHistoryScreen> {
  String _filter = 'ALL';
  List<BookingEntity> _bookings = [];
  final Map<String, StationEntity> _stationCache = {};
  final Set<String> _loadingChargerIds = {};
  final Set<String> _failedChargerIds = {}; // Track failed charger IDs to prevent infinite loop
  bool _isInitial = true;
  bool _wasCurrent = false;
  final ScrollController _scrollController = ScrollController();
  int _currentPage = 1;
  bool _isLoadingMore = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    context.read<BookingBloc>().add(BookingLoadHistory(page: 1, status: _filter));
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      final bloc = context.read<BookingBloc>();
      final state = bloc.state;
      if (state is BookingHistoryLoaded && state.hasMorePages && !_isLoadingMore) {
        setState(() {
          _isLoadingMore = true;
        });
        _currentPage++;
        bloc.add(BookingLoadHistory(page: _currentPage, status: _filter));
      }
    }
  }

  void _onFilterChanged(String v) {
    setState(() {
      _filter = v;
      _currentPage = 1;
      _isLoadingMore = false;
      _bookings = [];
    });
    context.read<BookingBloc>().add(BookingLoadHistory(page: 1, status: v));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final isCurrent = ModalRoute.of(context)?.isCurrent ?? false;
    if (isCurrent && !_wasCurrent) {
      if (_isInitial) {
        _isInitial = false;
      } else {
        setState(() {
          _currentPage = 1;
          _isLoadingMore = false;
          _bookings = [];
        });
        context.read<BookingBloc>().add(BookingLoadHistory(page: 1, status: _filter));
      }
    }
    _wasCurrent = isCurrent;
  }

  void _loadStationsForBookings(List<BookingEntity> bookings) {
    final repo = getIt<IStationRepository>();
    final uniqueChargerIds = bookings.map((b) => b.chargerId).toSet();
    for (final chargerId in uniqueChargerIds) {
      if (!_stationCache.containsKey(chargerId) &&
          !_loadingChargerIds.contains(chargerId) &&
          !_failedChargerIds.contains(chargerId)) {
        _loadingChargerIds.add(chargerId);
        repo.getStationByChargerId(chargerId).then((result) {
          if (mounted) {
            setState(() {
              _loadingChargerIds.remove(chargerId);
              result.fold(
                (failure) {
                  _failedChargerIds.add(chargerId);
                },
                (station) {
                  _stationCache[chargerId] = station;
                },
              );
            });
          }
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      child: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header ──────────────────────────────────────────
            EVHeader(
              title: 'Đặt lịch',
              action: GestureDetector(
                onTap: () async {
                  await context.push('/bookings/new');
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    gradient: AppColors.cyanLimeGradient,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.cyan.withValues(alpha: 0.4),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.add, color: Colors.white, size: 18),
                      const SizedBox(width: 4),
                      Text('Đặt mới',
                          style: AppTypography.labelMd.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          )),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // ── Status Filter Pills ──────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppLayout.sidePadding),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _Chip(label: 'Tất cả',    value: 'ALL',             current: _filter, onTap: _onFilterChanged),
                    const SizedBox(width: 8),
                    _Chip(label: 'Chờ TT',    value: 'PENDING_PAYMENT', current: _filter, onTap: _onFilterChanged),
                    const SizedBox(width: 8),
                    _Chip(label: 'Xác nhận',  value: 'CONFIRMED',       current: _filter, onTap: _onFilterChanged),
                    const SizedBox(width: 8),
                    _Chip(label: 'Hoàn thành',value: 'COMPLETED',       current: _filter, onTap: _onFilterChanged),
                    const SizedBox(width: 8),
                    _Chip(label: 'Đã hủy',    value: 'CANCELLED',       current: _filter, onTap: _onFilterChanged),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),

            // ── Content ──────────────────────────────────────────
            Expanded(
              child: BlocConsumer<BookingBloc, BookingState>(
                listener: (context, state) {
                  if (state is BookingCreated) {
                    final newBooking = state.booking;
                    final index = _bookings.indexWhere((b) => b.id == newBooking.id);
                    if (index == -1) {
                      setState(() {
                        _bookings.insert(0, newBooking);
                      });
                    }
                  } else if (state is BookingDetailLoaded) {
                    final updatedBooking = state.booking;
                    final index = _bookings.indexWhere((b) => b.id == updatedBooking.id);
                    if (index != -1) {
                      setState(() {
                        _bookings[index] = updatedBooking;
                      });
                    } else {
                      setState(() {
                        _bookings.insert(0, updatedBooking);
                      });
                    }
                  } else if (state is BookingCancelled) {
                    setState(() {
                      _currentPage = 1;
                      _isLoadingMore = false;
                      _bookings = [];
                    });
                    context.read<BookingBloc>().add(BookingLoadHistory(page: 1, status: _filter));
                  } else if (state is BookingHistoryLoaded) {
                    setState(() {
                      _isLoadingMore = false;
                    });
                  }
                },
                builder: (context, state) {
                  if (state is BookingHistoryLoaded) {
                    _bookings = state.bookings;
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      _loadStationsForBookings(_bookings);
                    });
                  }

                  if (state is BookingLoading && _bookings.isEmpty) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (state is BookingError && _bookings.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        child: LiquidGlassCard(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
                              const SizedBox(height: AppSpacing.md),
                              Text(state.message,
                                  style: AppTypography.bodyMd.copyWith(color: AppColors.error),
                                  textAlign: TextAlign.center),
                              const SizedBox(height: AppSpacing.lg),
                              EVButton(
                                label: 'Thử lại',
                                variant: EVButtonVariant.secondary,
                                onPressed: () {
                                  setState(() {
                                    _currentPage = 1;
                                    _isLoadingMore = false;
                                    _bookings = [];
                                  });
                                  context.read<BookingBloc>().add(BookingLoadHistory(page: 1, status: _filter));
                                },
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }

                  if (_bookings.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        child: LiquidGlassCard(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Stat tiles row
                              Wrap(
                                spacing: AppSpacing.md,
                                runSpacing: AppSpacing.md,
                                alignment: WrapAlignment.center,
                                children: [
                                  GlassSquare(
                                    size: 110,
                                    gradient: AppColors.cyanLimeGradient,
                                    shadowColor: AppColors.cyan.withValues(alpha: 0.4),
                                    children: [
                                      Text(_bookings.length.toString(),
                                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white)),
                                      const Text('Tổng', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                                    ],
                                  ),
                                  GlassSquare(
                                    size: 110,
                                    gradient: AppColors.blueCyanGradient,
                                    shadowColor: AppColors.blue.withValues(alpha: 0.4),
                                    children: [
                                      Text(
                                          _bookings.where((b) => b.status == 'COMPLETED').length.toString(),
                                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white)),
                                      const Text('Xong', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                                    ],
                                  ),
                                ],
                              ),
                              const SizedBox(height: AppSpacing.xl),
                              const Icon(Icons.event_busy_outlined, size: 56, color: AppColors.textMuted),
                              const SizedBox(height: AppSpacing.md),
                              Text('Không có lịch đặt', style: AppTypography.headingMd),
                              const SizedBox(height: AppSpacing.sm),
                              Text('Nhấn "+ Đặt mới" để tạo lịch sạc',
                                  style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
                              const SizedBox(height: AppSpacing.xl),
                              EVButton(
                                  label: 'Đặt lịch ngay',
                                  onPressed: () async {
                                    await context.push('/bookings/new');
                                  },
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }

                  return RefreshIndicator(
                    onRefresh: () async {
                      setState(() {
                        _currentPage = 1;
                        _isLoadingMore = false;
                        _bookings = [];
                        _stationCache.clear();
                        _loadingChargerIds.clear();
                        _failedChargerIds.clear();
                      });
                      context.read<BookingBloc>().add(BookingLoadHistory(page: 1, status: _filter));
                      context.read<AuthBloc>().add(const AuthCheckRequested());
                    },
                    child: ListView.builder(
                      controller: _scrollController,
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: AppLayout.paddingWithNavbar(context).copyWith(
                        top: AppSpacing.sm,
                        bottom: AppLayout.paddingWithNavbar(context).bottom,
                      ),
                      itemCount: _bookings.length + (_isLoadingMore ? 1 : 0),
                      itemBuilder: (_, i) {
                        if (i == _bookings.length) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16.0),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        final b = _bookings[i];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                          child: BookingCard(
                            booking: b,
                            station: _stationCache[b.chargerId],
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final String value;
  final String current;
  final ValueChanged<String> onTap;
  const _Chip({required this.label, required this.value, required this.current, required this.onTap});

  @override
  Widget build(BuildContext context) => GlassPill(
        label: label,
        isActive: value == current,
        onTap: () => onTap(value),
      );
}
