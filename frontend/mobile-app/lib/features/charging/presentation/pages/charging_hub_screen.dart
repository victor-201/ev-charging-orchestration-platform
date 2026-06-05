import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../bloc/charging_session_bloc.dart';
import '../../domain/entities/charging_session_entity.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_pill.dart';
import '../../../../core/design_system/widgets/glass_square.dart';
import '../../../../core/design_system/widgets/liquid_glass_card.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/ev_header.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;
import '../../../map/domain/entities/station_entity.dart';
import '../../../map/domain/repositories/i_station_repository.dart';
import '../../domain/repositories/i_charging_session_repository.dart';

/// Unified Charging Hub Main Dashboard Screen
class ChargingHubScreen extends StatefulWidget {
  const ChargingHubScreen({super.key});

  @override
  State<ChargingHubScreen> createState() => _ChargingHubScreenState();
}

class _ChargingHubScreenState extends State<ChargingHubScreen> {
  int _tab = 0; // 0 = QR Scan, 1 = History

  @override
  void initState() {
    super.initState();
    context.read<ChargingSessionBloc>().add(const ChargingSessionSyncRequested());
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
              title: 'Sạc điện',
              action: GestureDetector(
                onTap: () => context.push('/charging/scan'),
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
                      const Icon(Icons.qr_code_scanner, color: Colors.white, size: 18),
                      const SizedBox(width: 6),
                      Text(
                        'Quét QR',
                        style: AppTypography.labelMd.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // ── Tab Pills ────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppLayout.sidePadding),
              child: Row(
                children: [
                  Expanded(
                    child: GlassPill(
                      label: 'Quét mã QR',
                      isActive: _tab == 0,
                      onTap: () => setState(() => _tab = 0),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: GlassPill(
                      label: 'Lịch sử',
                      isActive: _tab == 1,
                      onTap: () => setState(() => _tab = 1),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            // ── Content ──────────────────────────────────────────
            Expanded(
              child: _tab == 0
                  ? const _QuickChargeTab(key: ValueKey('qr'))
                  : const _ChargingHistoryTab(key: ValueKey('history')),
            ),
          ],
        ),
      ),
    );
  }
}

/// QR Quick Charge activation state panel.
class _QuickChargeTab extends StatelessWidget {
  const _QuickChargeTab({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ChargingSessionBloc, ChargingState>(
      builder: (context, state) {
        if (state is ChargingActive) {
          return _ActiveSessionCard(session: state.session);
        }

        // Idle state — show stat tiles + CTA
        return SingleChildScrollView(
          padding: AppLayout.paddingWithNavbar(context),
          child: Column(
            children: [
              // ── 4 GlassSquare stat tiles ───────────────────
              Wrap(
                spacing: AppSpacing.md,
                runSpacing: AppSpacing.md,
                alignment: WrapAlignment.center,
                children: [
                  GlassSquare(
                    gradient: AppColors.cyanLimeGradient,
                    shadowColor: AppColors.cyan.withValues(alpha: 0.4),
                    children: const [
                      Icon(Icons.bolt, color: Colors.white, size: 32),
                      SizedBox(height: 4),
                      Text('Sẵn sàng', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                    ],
                  ),
                  GlassSquare(
                    gradient: AppColors.blueCyanGradient,
                    shadowColor: AppColors.blue.withValues(alpha: 0.4),
                    children: const [
                      Text('AC/DC', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Colors.white)),
                      SizedBox(height: 4),
                      Text('Hỗ trợ cả 2', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),

              // ── Main CTA Card ──────────────────────────────
              LiquidGlassCard(
                child: Column(
                  children: [
                    Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        gradient: AppColors.cyanLimeGradient,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.cyan.withValues(alpha: 0.4),
                            blurRadius: 24,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: const Icon(Icons.qr_code_scanner_outlined, color: Colors.white, size: 50),
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    Text('Bắt đầu sạc', style: AppTypography.headingLg),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'Quét mã QR tại cọc sạc\nđể bắt đầu phiên sạc tức thì',
                      style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.xl),
                    EVButton(
                      label: 'Quét mã QR',
                      icon: Icons.qr_code_scanner_outlined,
                      onPressed: () => context.push('/charging/scan'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ActiveSessionCard extends StatefulWidget {
  final ChargingSessionEntity session;
  const _ActiveSessionCard({required this.session});

  @override
  State<_ActiveSessionCard> createState() => _ActiveSessionCardState();
}

class _ActiveSessionCardState extends State<_ActiveSessionCard> {
  StationEntity? _resolvedStation;
  ChargerEntity? _resolvedCharger;
  bool _isLoadingStation = false;

  @override
  void initState() {
    super.initState();
    _loadStationInfo();
  }

  @override
  void didUpdateWidget(_ActiveSessionCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.session.chargerId != widget.session.chargerId) {
      _loadStationInfo();
    }
  }

  void _loadStationInfo() {
    if (!mounted || _isLoadingStation) return;
    setState(() {
      _isLoadingStation = true;
    });
    getIt<IStationRepository>()
        .getStationByChargerId(widget.session.chargerId)
        .then((result) {
      if (mounted) {
        setState(() {
          _isLoadingStation = false;
          result.fold(
            (_) {},
            (station) {
              _resolvedStation = station;
              _resolvedCharger = station.chargers.firstWhere(
                (c) => c.id == widget.session.chargerId || c.connectorId == widget.session.chargerId,
                orElse: () => station.chargers.isNotEmpty ? station.chargers.first : station.chargers.first,
              );
            },
          );
        });
      }
    }).catchError((_) {
      if (mounted) {
        setState(() => _isLoadingStation = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    return SingleChildScrollView(
      padding: AppLayout.paddingWithNavbar(context),
      child: Column(
        children: [
          // ── Active Charger Info Card ─────────────────────────
          LiquidGlassCard(
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.cyan.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.ev_station_rounded, color: AppColors.cyan, size: 28),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        session.stationName ?? _resolvedStation?.name ?? 'Đang tải trạm sạc...',
                        style: AppTypography.bodyLg.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        session.maxPowerKw != null
                            ? 'Trụ sạc • ${session.connectorType ?? "AC/DC"} (${session.maxPowerKw!.toStringAsFixed(0)} kW)'
                            : (_resolvedCharger != null
                                ? '${_resolvedCharger!.name} • ${_resolvedCharger!.connectorType} (${_resolvedCharger!.powerKw.toStringAsFixed(0)} kW)'
                                : 'Trụ sạc: ${session.chargerId.substring(0, 8)}...'),
                        style: AppTypography.caption.copyWith(
                          color: AppColors.textMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // ── 4 GlassSquare tiles ──────────────────────────────
          Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.md,
            alignment: WrapAlignment.center,
            children: [
              GlassSquare(
                gradient: AppColors.cyanLimeGradient,
                shadowColor: AppColors.cyan.withValues(alpha: 0.4),
                children: [
                  Text(
                    '${session.socPercent.toStringAsFixed(0)}%',
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('Pin', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                ],
              ),
              GlassSquare(
                gradient: AppColors.blueCyanGradient,
                shadowColor: AppColors.blue.withValues(alpha: 0.4),
                children: [
                  Text(
                    (session.powerW / 1000).toStringAsFixed(1),
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('kW', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                ],
              ),
              GlassSquare(
                gradient: AppColors.yellowOrangeGradient,
                shadowColor: AppColors.yellow.withValues(alpha: 0.4),
                children: [
                  Text(
                    session.energyKwh.toStringAsFixed(1),
                    style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('kWh', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                ],
              ),
              GlassSquare(
                gradient: AppColors.orangePinkGradient,
                shadowColor: AppColors.pink.withValues(alpha: 0.4),
                children: [
                  Text(
                    VndFormatter.compact(session.amountDue),
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
                  ),
                  const Text('VNĐ', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),

          // ── Status card ──────────────────────────────────────
          LiquidGlassCard(
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 8, height: 8,
                      decoration: const BoxDecoration(color: AppColors.lime, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'ĐANG SẠC',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.lime,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                EVButton(
                  label: 'Xem chi tiết phiên sạc',
                  icon: Icons.open_in_new_outlined,
                  onPressed: () => context.push('/charging/session/${session.id}'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChargingHistoryTab extends StatefulWidget {
  const _ChargingHistoryTab({super.key});

  @override
  State<_ChargingHistoryTab> createState() => _ChargingHistoryTabState();
}

class _ChargingHistoryTabState extends State<_ChargingHistoryTab> {
  final ScrollController _scrollController = ScrollController();
  final List<ChargingSessionEntity> _sessions = [];
  final Map<String, StationEntity> _stationCache = {};
  final Set<String> _loadingChargerIds = {};
  final Set<String> _failedChargerIds = {};

  String _filter = 'ALL'; // 'ALL', 'COMPLETED', 'ERROR'
  int _offset = 0;
  bool _isLoading = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _loadHistory(isRefresh: true);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      if (_hasMore && !_isLoadingMore && !_isLoading) {
        _loadHistory(isRefresh: false);
      }
    }
  }

  Future<void> _loadHistory({required bool isRefresh}) async {
    if (isRefresh) {
      setState(() {
        _isLoading = true;
        _sessions.clear();
        _offset = 0;
        _hasMore = true;
      });
    } else {
      setState(() {
        _isLoadingMore = true;
      });
    }

    final repository = getIt<IChargingSessionRepository>();
    final result = await repository.getSessionHistory(
      limit: 20,
      offset: _offset,
      status: _filter == 'ALL' ? null : _filter,
    );

    if (mounted) {
      result.fold(
        (failure) {
          setState(() {
            _isLoading = false;
            _isLoadingMore = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(failure.message)),
          );
        },
        (newSessions) {
          setState(() {
            _isLoading = false;
            _isLoadingMore = false;
            _sessions.addAll(newSessions);
            _offset = _sessions.length;
            if (newSessions.length < 20) {
              _hasMore = false;
            }
          });
          _loadStationsForSessions(newSessions);
        },
      );
    }
  }

  void _loadStationsForSessions(List<ChargingSessionEntity> sessions) {
    final repo = getIt<IStationRepository>();
    final uniqueChargerIds = sessions
        .map((s) => s.chargerId)
        .where((id) =>
            !_stationCache.containsKey(id) &&
            !_loadingChargerIds.contains(id) &&
            !_failedChargerIds.contains(id))
        .toList();

    if (uniqueChargerIds.isEmpty) return;

    _loadingChargerIds.addAll(uniqueChargerIds);

    repo.getStationsByChargerIds(uniqueChargerIds).then((result) {
      if (mounted) {
        setState(() {
          for (final id in uniqueChargerIds) {
            _loadingChargerIds.remove(id);
          }
          result.fold(
            (failure) {
              for (final id in uniqueChargerIds) {
                _failedChargerIds.add(id);
              }
            },
            (stations) {
              for (final station in stations) {
                for (final charger in station.chargers) {
                  _stationCache[charger.id] = station;
                }
              }
              // Fallback to avoid infinite retries
              for (final id in uniqueChargerIds) {
                if (!_stationCache.containsKey(id)) {
                  _failedChargerIds.add(id);
                }
              }
            },
          );
        });
      }
    });
  }

  void _onFilterChanged(String filter) {
    setState(() {
      _filter = filter;
    });
    _loadHistory(isRefresh: true);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Filter Pills ──────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppLayout.sidePadding),
          child: Row(
            children: [
              GlassPill(
                label: 'Tất cả',
                isActive: _filter == 'ALL',
                onTap: () => _onFilterChanged('ALL'),
              ),
              const SizedBox(width: 8),
              GlassPill(
                label: 'Hoàn thành',
                isActive: _filter == 'COMPLETED',
                onTap: () => _onFilterChanged('COMPLETED'),
              ),
              const SizedBox(width: 8),
              GlassPill(
                label: 'Lỗi',
                isActive: _filter == 'ERROR',
                onTap: () => _onFilterChanged('ERROR'),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),

        // ── List / View ───────────────────────────────────────────
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _loadHistory(isRefresh: true),
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _sessions.isEmpty
                    ? SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: AppLayout.paddingWithNavbar(context),
                        child: Center(
                          child: LiquidGlassCard(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.history_outlined, size: 56, color: AppColors.textMuted),
                                const SizedBox(height: AppSpacing.lg),
                                Text('Lịch sử sạc', style: AppTypography.headingMd),
                                const SizedBox(height: AppSpacing.sm),
                                Text(
                                  'Không có phiên sạc nào',
                                  style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted),
                                  textAlign: TextAlign.center,
                                ),
                              ],
                            ),
                          ),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: AppLayout.paddingWithNavbar(context),
                        itemCount: _sessions.length + (_isLoadingMore ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (index == _sessions.length) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16.0),
                              child: Center(child: CircularProgressIndicator()),
                            );
                          }

                          final session = _sessions[index];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                            child: _ChargingSessionCard(
                              session: session,
                              station: _stationCache[session.chargerId],
                              isDark: isDark,
                            ),
                          );
                        },
                      ),
          ),
        ),
      ],
    );
  }
}

class _ChargingSessionCard extends StatelessWidget {
  final ChargingSessionEntity session;
  final StationEntity? station;
  final bool isDark;

  const _ChargingSessionCard({
    required this.session,
    this.station,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    Color statusColor;
    String statusLabel;

    if (session.endedAt != null) {
      statusColor = AppColors.chargerAvailable;
      statusLabel = 'Hoàn thành';
    } else {
      switch (session.status.toLowerCase()) {
        case 'billed':
        case 'completed':
          statusColor = AppColors.chargerAvailable;
          statusLabel = 'Hoàn thành';
          break;
        case 'active':
        case 'charging':
          statusColor = AppColors.cyan;
          statusLabel = 'Đang sạc';
          break;
        case 'init':
        case 'initiated':
        case 'authorized':
          statusColor = AppColors.amber;
          statusLabel = 'Khởi tạo';
          break;
        case 'error':
        case 'interrupted':
          statusColor = AppColors.error;
          statusLabel = 'Lỗi';
          break;
        default:
          statusColor = AppColors.grey400;
          statusLabel = session.status;
      }
    }

    final stationName = session.stationName ?? station?.name ?? 'Trạm sạc EV';
    final ChargerEntity? charger = station?.chargers
        .where((c) => c.id == session.chargerId)
        .firstOrNull;
    final chargerInfo = session.maxPowerKw != null
        ? 'Trụ sạc • ${session.connectorType ?? "AC/DC"} (${session.maxPowerKw!.toStringAsFixed(0)} kW)'
        : (charger != null
            ? '${charger.name} • ${charger.connectorType} (${charger.powerKw.toStringAsFixed(0)} kW)'
            : 'Trụ sạc: ${session.chargerId.substring(0, 8)}...');

    return GestureDetector(
      onTap: () => context.push('/charging/session/${session.id}'),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: isDark
              ? Colors.white.withValues(alpha: 0.06)
              : Colors.white.withValues(alpha: 0.65),
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(
            color: Colors.white.withValues(alpha: isDark ? 0.1 : 0.6),
          ),
          boxShadow: [
            BoxShadow(
              color: statusColor.withValues(alpha: 0.08),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            // Status bar
            Container(
              width: 4,
              height: 64,
              decoration: BoxDecoration(
                color: statusColor,
                borderRadius: BorderRadius.circular(2),
                boxShadow: [
                  BoxShadow(
                    color: statusColor.withValues(alpha: 0.4),
                    blurRadius: 8,
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    stationName,
                    style: AppTypography.bodyMd.copyWith(
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white : AppColors.pillTextLight,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    chargerInfo,
                    style: AppTypography.caption.copyWith(
                      color: AppColors.textMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.bolt_outlined, size: 14, color: AppColors.textMuted),
                      const SizedBox(width: 4),
                      Text(
                        '${session.energyKwh.toStringAsFixed(1)} kWh',
                        style: AppTypography.caption.copyWith(
                          color: AppColors.textMuted,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          border: Border.all(color: statusColor.withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          statusLabel,
                          style: AppTypography.caption.copyWith(
                            color: statusColor,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${ev_date.DateUtils.formatDateTime(session.startedAt)}'
                    '${session.endedAt != null ? ' → ${ev_date.DateUtils.formatTimeHm(session.endedAt!)}' : ''}',
                    style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  VndFormatter.format(session.amountDue),
                  style: AppTypography.bodyMd.copyWith(
                    fontWeight: FontWeight.w800,
                    color: isDark ? Colors.white : AppColors.pillTextLight,
                  ),
                ),
                const SizedBox(height: 4),
                const Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
