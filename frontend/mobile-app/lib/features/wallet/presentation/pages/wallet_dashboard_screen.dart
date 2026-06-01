import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../bloc/wallet_bloc.dart';
import '../../domain/entities/wallet_entity.dart';
import '../widgets/transaction_detail_sheet.dart';
import '../../../../core/design_system/theme/app_colors.dart';
import '../../../../core/design_system/theme/app_layout.dart';
import '../../../../core/design_system/theme/app_typography.dart';
import '../../../../core/design_system/widgets/ev_button.dart';
import '../../../../core/design_system/widgets/glass_pill.dart';
import '../../../../core/design_system/widgets/glass_square.dart';
import '../../../../core/design_system/widgets/glass_container.dart';
import '../../../../core/design_system/widgets/liquid_glass_card.dart';
import '../../../../core/design_system/widgets/liquid_glass_scaffold.dart';
import '../../../../core/design_system/widgets/ev_header.dart';
import '../../../../core/design_system/widgets/ev_toast.dart';
import '../../../../core/utils/vnd_formatter.dart';
import '../../../../core/utils/date_utils.dart' as ev_date;

/// Wallet Dashboard Screen — High-Fidelity Futuristic Design
class WalletDashboardScreen extends StatefulWidget {
  const WalletDashboardScreen({super.key});

  @override
  State<WalletDashboardScreen> createState() => _WalletDashboardScreenState();
}

class _WalletDashboardScreenState extends State<WalletDashboardScreen>
    with WidgetsBindingObserver {
  String _txFilter = 'ALL';
  final ScrollController _scrollController = ScrollController();
  int _currentPage = 1;
  bool _isLoadingMore = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _scrollController.addListener(_onScroll);
    context.read<WalletBloc>().add(const WalletLoad());
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      final bloc = context.read<WalletBloc>();
      final state = bloc.state;
      if (state is WalletLoaded && state.hasMorePages && !_isLoadingMore) {
        setState(() {
          _isLoadingMore = true;
        });
        _currentPage++;
        bloc.add(WalletLoadTransactions(
          page: _currentPage,
          type: _txFilter == 'ALL' ? null : _txFilter,
        ));
      }
    }
  }

  /// Reload wallet data whenever app comes back to foreground.
  /// This handles the case where user returns from Chrome after VNPay payment
  /// (either via back button or when the deep link didn't fire).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      setState(() {
        _currentPage = 1;
        _isLoadingMore = false;
      });
      context.read<WalletBloc>().add(const WalletLoad());
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LiquidGlassScaffold(
      child: SafeArea(
        bottom: false,
        child: BlocConsumer<WalletBloc, WalletState>(
          listener: (context, state) {
            if (state is WalletTopUpInitiated) {
              _openVNPayUrl(state.vnpayUrl);
            } else if (state is WalletError) {
              EVToast.show(context, message: state.message, isError: true);
            } else if (state is WalletLoaded || state is WalletTransactionsLoading) {
              setState(() {
                _isLoadingMore = false;
              });
            }
          },
          builder: (context, state) {
            // Full-screen loading only on first open or hard refresh
            if (state is WalletLoading || state is WalletInitial) {
              return const Center(child: CircularProgressIndicator());
            }
            // VNPay was initiated — user is in Chrome completing payment.
            if (state is WalletTopUpInitiated) {
              return Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    Text('Đang chờ xác nhận thanh toán...',
                        style: AppTypography.bodyMd),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () =>
                          context.read<WalletBloc>().add(const WalletLoad()),
                      child: const Text('Làm mới'),
                    ),
                  ],
                ),
              );
            }
            // WalletTransactionsLoading: balance/stats stay visible,
            // only the list section shows a partial loader
            if (state is WalletTransactionsLoading) {
              return _buildContent(
                context,
                WalletLoaded(
                  wallet: state.wallet,
                  transactions: state.transactions,
                  hasMorePages: false,
                ),
                isFilterLoading: true,
              );
            }
            if (state is! WalletLoaded) {
              return const Center(child: Text('Đang tải dữ liệu ví...'));
            }
            return _buildContent(context, state);
          },
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, WalletLoaded state, {bool isFilterLoading = false}) {
    final txList = state.transactions.where((tx) {
      if (tx.status != 'COMPLETED') return false;
      return true;
    }).toList();

    return RefreshIndicator(
      onRefresh: () async {
        setState(() {
          _currentPage = 1;
          _isLoadingMore = false;
        });
        context.read<WalletBloc>().add(const WalletLoad());
      },
      child: CustomScrollView(
        controller: _scrollController,
        slivers: [
          // ── Premium Header ──────────────────────────────────────
          SliverToBoxAdapter(
            child: EVHeader(
              title: 'Ví điện tử',
              action: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: () => context.push('/profile/arrears'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: state.wallet.hasArrears
                            ? AppColors.error.withValues(alpha: 0.15)
                            : Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: state.wallet.hasArrears
                              ? AppColors.error.withValues(alpha: 0.3)
                              : Colors.white.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Stack(
                            clipBehavior: Clip.none,
                            children: [
                              Icon(
                                Icons.receipt_long_outlined,
                                size: 16,
                                color: state.wallet.hasArrears ? AppColors.error : Colors.white,
                              ),
                              if (state.wallet.hasArrears)
                                Positioned(
                                  right: -2,
                                  top: -2,
                                  child: Container(
                                    width: 6,
                                    height: 6,
                                    decoration: const BoxDecoration(
                                      color: AppColors.error,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Công nợ',
                            style: AppTypography.labelMd.copyWith(
                              color: state.wallet.hasArrears ? AppColors.error : Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  GestureDetector(
                    onTap: () => context.read<WalletBloc>().add(const WalletLoad()),
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                      ),
                      child: const Icon(Icons.refresh_outlined, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Cyberpunk EVolt Credit Card & Arrears ───────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: AppLayout.paddingWithNavbar(context).copyWith(bottom: 0),
              child: Column(
                children: [
                  // Futuristic EVolt Credit Card layout
                  Container(
                    width: double.infinity,
                    height: 200,
                    decoration: BoxDecoration(
                      gradient: AppColors.cyanLimeGradient,
                      borderRadius: BorderRadius.circular(24),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.cyan.withValues(alpha: 0.35),
                          blurRadius: 32,
                          offset: const Offset(0, 16),
                        ),
                      ],
                    ),
                    child: Stack(
                      children: [
                        // Card lines overlay
                        Positioned.fill(
                          child: Opacity(
                            opacity: 0.15,
                            child: CustomPaint(
                              painter: _CardLinesPainter(),
                            ),
                          ),
                        ),
                        // Shiny gradient overlay
                        Positioned.fill(
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(24),
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  Colors.white.withValues(alpha: 0.25),
                                  Colors.transparent,
                                ],
                                stops: const [0.0, 0.4],
                              ),
                            ),
                          ),
                        ),
                        // Card details
                        Padding(
                          padding: const EdgeInsets.all(24.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  // Golden simulated credit card chip
                                  Container(
                                    width: 42,
                                    height: 32,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFFE2E8F0),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(color: const Color(0xFFCBD5E1), width: 1.5),
                                    ),
                                    child: GridView.count(
                                      crossAxisCount: 3,
                                      padding: const EdgeInsets.all(2),
                                      children: List.generate(
                                        9,
                                        (index) => Container(
                                          margin: const EdgeInsets.all(1),
                                          decoration: BoxDecoration(
                                            border: Border.all(color: const Color(0xFF94A3B8), width: 0.5),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  // Glowing bolt branding
                                  Row(
                                    children: [
                                      const Icon(Icons.electric_bolt, color: Colors.white, size: 18),
                                      const SizedBox(width: 4),
                                      Text(
                                        'EVOLTSYNC',
                                        style: AppTypography.labelMd.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 1.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        'SỐ DƯ KHẢ DỤNG',
                                        style: AppTypography.caption.copyWith(
                                          color: Colors.white.withValues(alpha: 0.75),
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: 1.0,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        VndFormatter.format(state.wallet.balance),
                                        style: AppTypography.displayLg.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 28,
                                        ),
                                      ),
                                    ],
                                  ),
                                  ElevatedButton.icon(
                                    onPressed: () => _showTopUpDialog(context),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white,
                                      foregroundColor: AppColors.cyan,
                                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(16),
                                      ),
                                      elevation: 0,
                                    ),
                                    icon: const Icon(Icons.add_circle_outline, size: 16),
                                    label: Text(
                                      'Nạp tiền',
                                      style: AppTypography.labelMd.copyWith(
                                        color: AppColors.cyan,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: AppSpacing.lg),

                  // Arrears warning card & management options
                  if (state.wallet.hasArrears) ...[
                    LiquidGlassCard(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 22),
                              const SizedBox(width: 8),
                              Text(
                                'Cảnh báo nợ quá hạn',
                                style: AppTypography.bodyMd.copyWith(
                                  color: AppColors.error,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            'Tài khoản đang phát sinh nợ tồn đọng trị giá ${VndFormatter.format(state.wallet.arrearsAmount ?? 0)}. Đặt lịch và sạc pin bị tạm khoá.',
                            style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Row(
                            children: [
                              Expanded(
                                child: EVButton(
                                  label: 'Thanh toán ngay',
                                  variant: EVButtonVariant.danger,
                                  onPressed: () => _showArrearsPaymentDialog(
                                    context,
                                    state.wallet.arrearsAmount ?? 0,
                                    state.wallet.balance,
                                  ),
                                ),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: EVButton(
                                  label: 'Chi tiết công nợ',
                                  variant: EVButtonVariant.secondary,
                                  onPressed: () => context.push('/profile/arrears'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],

                  // Quick stat tiles
                  Wrap(
                    spacing: AppSpacing.md,
                    runSpacing: AppSpacing.md,
                    alignment: WrapAlignment.center,
                    children: [
                      GlassSquare(
                        size: 130,
                        gradient: AppColors.blueCyanGradient,
                        shadowColor: AppColors.blue.withValues(alpha: 0.3),
                        children: [
                          Text(
                            state.wallet.totalTransactionsCount.toString(),
                            style: const TextStyle(
                                fontSize: 26, fontWeight: FontWeight.w800, color: Colors.white),
                          ),
                          const SizedBox(height: 4),
                          const Text('Giao dịch',
                              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)),
                        ],
                      ),
                      GlassSquare(
                        size: 130,
                        gradient: AppColors.yellowOrangeGradient,
                        shadowColor: AppColors.yellow.withValues(alpha: 0.3),
                        children: [
                          Text(
                            VndFormatter.compact(
                              state.wallet.totalTopUpAmount,
                            ),
                            style: const TextStyle(
                                fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
                          ),
                          const SizedBox(height: 4),
                          const Text('Đã nạp ví',
                              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          // ── Transaction Filter Pills ─────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: AppLayout.paddingWithNavbar(context).copyWith(bottom: 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Lịch sử giao dịch', style: AppTypography.headingMd),
                  const SizedBox(height: AppSpacing.md),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _FilterPill(
                          label: 'Tất cả',
                          value: 'ALL',
                          current: _txFilter,
                          onTap: (v) {
                            setState(() {
                              _txFilter = v;
                              _currentPage = 1;
                              _isLoadingMore = false;
                            });
                            // Dispatch only transactions load — balance/stats stay unchanged
                            context.read<WalletBloc>().add(
                              WalletLoadTransactions(page: 1, type: v == 'ALL' ? null : v),
                            );
                          },
                        ),
                        const SizedBox(width: 8),
                        _FilterPill(
                          label: 'Nạp tiền',
                          value: 'TOPUP',
                          current: _txFilter,
                          onTap: (v) {
                            setState(() {
                              _txFilter = v;
                              _currentPage = 1;
                              _isLoadingMore = false;
                            });
                            context.read<WalletBloc>().add(
                              WalletLoadTransactions(page: 1, type: v),
                            );
                          },
                        ),
                        const SizedBox(width: 8),
                        _FilterPill(
                          label: 'Thanh toán',
                          value: 'PAYMENT',
                          current: _txFilter,
                          onTap: (v) {
                            setState(() {
                              _txFilter = v;
                              _currentPage = 1;
                              _isLoadingMore = false;
                            });
                            context.read<WalletBloc>().add(
                              WalletLoadTransactions(page: 1, type: v),
                            );
                          },
                        ),
                        const SizedBox(width: 8),
                        _FilterPill(
                          label: 'Hoàn tiền',
                          value: 'REFUND',
                          current: _txFilter,
                          onTap: (v) {
                            setState(() {
                              _txFilter = v;
                              _currentPage = 1;
                              _isLoadingMore = false;
                            });
                            context.read<WalletBloc>().add(
                              WalletLoadTransactions(page: 1, type: v),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
              ),
            ),
          ),

          // ── Transaction List ─────────────────────────────────────
          // Show inline spinner ONLY in the list section when filter changes (page 1),
          // preserving the wallet card, stats, and filter pills on screen.
          if (isFilterLoading && txList.isEmpty)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 40.0),
                child: Center(child: CircularProgressIndicator()),
              ),
            )
          else if (txList.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: AppLayout.paddingWithNavbar(context),
                child: Column(
                  children: [
                    LiquidGlassCard(
                      padding: const EdgeInsets.all(AppSpacing.xxl),
                      child: Column(
                        children: [
                          const Icon(Icons.receipt_long_outlined, size: 56, color: AppColors.textMuted),
                          const SizedBox(height: AppSpacing.lg),
                          Text('Chưa có giao dịch nào',
                              style: AppTypography.bodyMd.copyWith(color: AppColors.textMuted)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            )
          else ...[
            SliverPadding(
              padding: AppLayout.paddingWithNavbar(context).copyWith(top: 0, bottom: 0),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (_, i) => Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: _TransactionTile(tx: txList[i]),
                  ),
                  childCount: txList.length,
                ),
              ),
            ),
            if (_isLoadingMore || isFilterLoading)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 16.0),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
            // Substantial bottom padding to prevent items from being covered by translucent bottom navigation bar
            SliverToBoxAdapter(
              child: SizedBox(height: AppLayout.paddingWithNavbar(context).bottom),
            ),
          ],
        ],
      ),
    );
  }

  void _showArrearsPaymentDialog(BuildContext context, double arrearsAmount, double walletBalance) {
    final canPayFromWallet = walletBalance >= arrearsAmount;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final mutedTextColor = isDark ? AppColors.textMuted : const Color(0xFF475569);
    final descTextColor = isDark ? Colors.white70 : Colors.black87;

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
              // Header Row
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.error.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Thanh toán công nợ',
                      style: AppTypography.headingMd.copyWith(
                        fontWeight: FontWeight.w800,
                        color: isDark ? Colors.white : AppColors.black,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              
              // Arrears & Wallet details
              Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.03),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: isDark ? Colors.white12 : Colors.black12,
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Tổng nợ quá hạn:', style: AppTypography.bodyMd.copyWith(color: mutedTextColor)),
                        Text(
                          VndFormatter.format(arrearsAmount),
                          style: AppTypography.bodyMd.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppColors.error,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Số dư ví hiện tại:', style: AppTypography.bodyMd.copyWith(color: mutedTextColor)),
                        Text(
                          VndFormatter.format(walletBalance),
                          style: AppTypography.bodyMd.copyWith(
                            fontWeight: FontWeight.w700,
                            color: canPayFromWallet ? AppColors.chargerAvailable : AppColors.error,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              
              // Description
              Text(
                'Vui lòng chọn phương thức thanh toán để gạch nợ và mở khóa tài khoản sạc của bạn:',
                style: AppTypography.caption.copyWith(color: descTextColor),
              ),
              const SizedBox(height: AppSpacing.xl),

              // Actions
              EVButton(
                label: canPayFromWallet ? 'Thanh toán bằng số dư ví' : 'Số dư ví không đủ thanh toán',
                variant: canPayFromWallet ? EVButtonVariant.primary : EVButtonVariant.secondary,
                icon: Icons.account_balance_wallet_outlined,
                onPressed: canPayFromWallet
                    ? () {
                        Navigator.pop(dialogContext);
                        context.read<WalletBloc>().add(const WalletPayArrears());
                      }
                    : null,
              ),
              const SizedBox(height: AppSpacing.md),
              EVButton(
                label: 'Thanh toán trực tiếp qua VNPay',
                variant: EVButtonVariant.primary,
                icon: Icons.payment_outlined,
                onPressed: () {
                  Navigator.pop(dialogContext);
                  context.read<WalletBloc>().add(const WalletPayArrearsVNPayInitiate());
                },
              ),
              const SizedBox(height: AppSpacing.md),
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
  }

  void _showTopUpDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => BlocProvider.value(
        value: context.read<WalletBloc>(),
        child: const _TopUpDialog(),
      ),
    );
  }

  Future<void> _openVNPayUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

/// ─── Top-Up Dialog ────────────────────────────────────────────────────────
class _TopUpDialog extends StatefulWidget {
  const _TopUpDialog();

  @override
  State<_TopUpDialog> createState() => _TopUpDialogState();
}

class _TopUpDialogState extends State<_TopUpDialog> {
  // 6 preset amounts exactly as requested
  static const _presets = [
    50000,
    100000,
    200000,
    500000,
    1000000,
    5000000,
  ];

  int? _selected;
  final _customController = TextEditingController();
  final _customFocus = FocusNode();
  bool _isCustomMode = false;

  @override
  void dispose() {
    _customController.dispose();
    _customFocus.dispose();
    super.dispose();
  }

  /// Returns the effective amount: preset or parsed custom value.
  double? get _amount {
    if (_isCustomMode) {
      final digits = _customController.text.replaceAll(RegExp(r'[^\d]'), '');
      if (digits.isEmpty) return null;
      return double.tryParse(digits);
    }
    return _selected?.toDouble();
  }

  void _selectPreset(int amt) {
    setState(() {
      _selected = amt;
      _isCustomMode = false;
      _customFocus.unfocus();
    });
  }

  void _activateCustom() {
    setState(() {
      _isCustomMode = true;
      _selected = null;
    });
    Future.delayed(const Duration(milliseconds: 80), () {
      _customFocus.requestFocus();
    });
  }

  void _confirm(BuildContext context) {
    final amt = _amount;
    if (amt == null || amt < 10000) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Số tiền nạp tối thiểu là 10.000 ₫'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if (amt > 50000000) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Số tiền nạp tối đa là 50.000.000 ₫'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    Navigator.pop(context);
    context.read<WalletBloc>().add(WalletTopUpInitiate(amount: amt));
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : AppColors.black;
    final mutedColor = isDark ? Colors.white60 : Colors.black45;
    final cardBg = isDark
        ? Colors.white.withValues(alpha: 0.06)
        : Colors.white.withValues(alpha: 0.85);
    final hasAmount = _amount != null;

    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      // Constrain width — prevents stretch on tablets & avoids overflow
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: GlassContainer(
          borderRadius: BorderRadius.circular(28),
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── Header ────────────────────────────────────────────
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.account_balance_wallet_outlined,
                          color: AppColors.primary, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Nạp tiền vào ví',
                            style: AppTypography.headingMd.copyWith(
                              fontWeight: FontWeight.w800,
                              color: textColor,
                            ),
                          ),
                          Text(
                            'Thanh toán qua VNPay',
                            style: AppTypography.caption.copyWith(color: mutedColor),
                          ),
                        ],
                      ),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.pop(context),
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        child: Icon(Icons.close_rounded, color: mutedColor, size: 20),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 20),

                // ── Section label ─────────────────────────────────────
                Text(
                  'Chọn mức nạp',
                  style: AppTypography.caption.copyWith(
                    color: mutedColor,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 10),

                // ── Preset grid: 2 columns × 3 rows ──────────────────
                // Using LayoutBuilder to avoid intrinsic width overflow.
                LayoutBuilder(
                  builder: (ctx, constraints) {
                    final itemW = (constraints.maxWidth - 10) / 2; // 10 = 1 gap
                    return Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: _presets.map((amt) {
                        final isSelected = !_isCustomMode && _selected == amt;
                        return GestureDetector(
                          onTap: () => _selectPreset(amt),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 160),
                            width: itemW,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppColors.primary.withValues(alpha: 0.15)
                                  : cardBg,
                              borderRadius: BorderRadius.circular(16),
                              border: isSelected
                                  ? Border.all(
                                      color: AppColors.primary,
                                      width: 2.0,
                                    )
                                  : null,
                            ),
                            child: Center(
                              child: Text(
                                VndFormatter.format(amt.toDouble()),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w800,
                                  color: isSelected
                                      ? AppColors.primary
                                      : textColor,
                                  letterSpacing: -0.3,
                                ),
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    );
                  },
                ),

                const SizedBox(height: 16),

                // ── Custom amount section ─────────────────────────────
                Text(
                  'Hoặc nhập số tiền',
                  style: AppTypography.caption.copyWith(
                    color: mutedColor,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 8),

                AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  decoration: BoxDecoration(
                    color: cardBg,
                    borderRadius: BorderRadius.circular(16),
                    border: _isCustomMode
                        ? Border.all(
                            color: AppColors.primary,
                            width: 2.0,
                          )
                        : null,
                  ),
                  child: Row(
                    children: [
                      const SizedBox(width: 14),
                      Icon(
                        Icons.edit_rounded,
                        size: 15,
                        color: _isCustomMode ? AppColors.primary : mutedColor,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _customController,
                          focusNode: _customFocus,
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            _ThousandsSeparatorFormatter(),
                          ],
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: _isCustomMode ? AppColors.primary : textColor,
                          ),
                          decoration: InputDecoration(
                            hintText: 'Nhập số tiền tùy chỉnh...',
                            hintStyle: TextStyle(
                              fontSize: 13.5,
                              fontWeight: FontWeight.w400,
                              color: mutedColor,
                            ),
                            border: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            errorBorder: InputBorder.none,
                            disabledBorder: InputBorder.none,
                            isDense: true,
                            contentPadding:
                                const EdgeInsets.symmetric(vertical: 15),
                          ),
                          onTap: _activateCustom,
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                      // Currency badge
                      Container(
                        margin: const EdgeInsets.only(right: 10),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Text(
                          '₫',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                if (_isCustomMode) ...[
                  const SizedBox(height: 4),
                  Text('Tối thiểu 10.000 ₫ — Tối đa 50.000.000 ₫',
                      style: AppTypography.caption
                          .copyWith(color: mutedColor, fontSize: 11)),
                ],

                const SizedBox(height: 20),

                // ── Confirm button ─────────────────────────────────────
                AnimatedOpacity(
                  opacity: hasAmount ? 1.0 : 0.5,
                  duration: const Duration(milliseconds: 200),
                  child: EVButton(
                    label: hasAmount
                        ? 'Nạp  ${VndFormatter.format(_amount!)}  qua VNPay'
                        : 'Vui lòng chọn hoặc nhập số tiền',
                    variant: EVButtonVariant.primary,
                    icon: Icons.payment_outlined,
                    onPressed: hasAmount ? () => _confirm(context) : null,
                  ),
                ),

                const SizedBox(height: 10),

                EVButton(
                  label: 'Huỷ bỏ',
                  variant: EVButtonVariant.secondary,
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A custom formatter that adds a dot separator every thousand digits in real-time
class _ThousandsSeparatorFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (newValue.text.isEmpty) {
      return newValue.copyWith(text: '');
    }

    // Strip out all non-digits
    final numString = newValue.text.replaceAll(RegExp(r'[^\d]'), '');
    if (numString.isEmpty) {
      return newValue.copyWith(text: '');
    }

    // Format digits with dot separator (e.g., 1.000.000)
    final formatted = numString.replaceAllMapped(
      RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
      (Match m) => '${m[1]}.',
    );

    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
class _FilterPill extends StatelessWidget {
  final String label;
  final String value;
  final String current;
  final ValueChanged<String> onTap;

  const _FilterPill({
    required this.label,
    required this.value,
    required this.current,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isActive = value == current;
    return GlassPill(
      label: label,
      isActive: isActive,
      onTap: () => onTap(value),
    );
  }
}

class _TransactionTile extends StatelessWidget {
  final TransactionEntity tx;
  const _TransactionTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isCredit = tx.isCredit;
    final color = isCredit ? AppColors.chargerAvailable : AppColors.error;
    final sign = isCredit ? '+' : '-';

    return GestureDetector(
      onTap: () => TransactionDetailSheet.show(context, tx: tx),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: isDark
              ? Colors.white.withValues(alpha: 0.05)
              : Colors.white.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(AppRadius.md),
          border: Border.all(
            color: Colors.white.withValues(alpha: isDark ? 0.1 : 0.5),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                isCredit ? Icons.arrow_downward_outlined : Icons.arrow_upward_outlined,
                color: color,
                size: 20,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tx.description ?? _translateType(tx.type),
                    style: AppTypography.bodyMd.copyWith(fontWeight: FontWeight.w600),
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    ev_date.DateUtils.formatDateTime(tx.createdAt),
                    style: AppTypography.caption.copyWith(color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
            Text(
              '$sign${VndFormatter.format(tx.amount)}',
              style: AppTypography.bodyMd.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(width: 6),
            Icon(
              Icons.chevron_right_rounded,
              color: isDark ? Colors.white38 : Colors.black26,
              size: 20,
            ),
          ],
        ),
      ),
    );
  }

  String _translateType(String type) {
    switch (type) {
      case 'TOPUP':   return 'Nạp tiền';
      case 'PAYMENT': return 'Thanh toán';
      case 'REFUND':  return 'Hoàn tiền';
      case 'PENALTY': return 'Phạt';
      default:        return type;
    }
  }
}

/// Simulated circuit lines to give a cyberpunk cyber-credit-card feel
class _CardLinesPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..strokeWidth = 1.0
      ..style = PaintingStyle.stroke;

    final path = Path()
      ..moveTo(size.width * 0.1, 0)
      ..lineTo(size.width * 0.3, size.height * 0.5)
      ..lineTo(size.width * 0.7, size.height * 0.5)
      ..lineTo(size.width * 0.9, size.height)
      ..moveTo(size.width * 0.2, 0)
      ..lineTo(size.width * 0.35, size.height * 0.3)
      ..lineTo(size.width * 0.65, size.height * 0.3)
      ..lineTo(size.width * 0.8, size.height);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
