import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import '../../features/auth/presentation/bloc/auth_bloc.dart';
import '../../features/auth/presentation/pages/splash_screen.dart';
import '../../features/auth/presentation/pages/welcome_screen.dart';
import '../../features/auth/presentation/pages/forgot_password_screen.dart';
import '../../features/auth/presentation/pages/login_screen.dart';
import '../../features/auth/presentation/pages/register_screen.dart';
import '../../features/auth/presentation/pages/mfa_verify_screen.dart';
import '../../features/auth/presentation/pages/verify_email_pending_screen.dart';
import '../../features/auth/presentation/pages/magic_link_verify_screen.dart';
import '../../features/map/presentation/pages/map_home_screen.dart';
import '../../features/map/presentation/pages/route_navigation_screen.dart';
import '../../features/booking/presentation/pages/booking_history_screen.dart';
import '../../features/booking/presentation/pages/booking_new_screen.dart';
import '../../features/booking/presentation/pages/booking_detail_screen.dart';
import '../../features/booking/presentation/pages/queue_status_screen.dart';
import '../../features/charging/presentation/pages/charging_hub_screen.dart';
import '../../features/charging/presentation/pages/qr_scan_screen.dart';
import '../../features/charging/presentation/pages/active_session_screen.dart';
import '../../features/charging/presentation/pages/session_summary_screen.dart';
import '../../features/charging/domain/entities/charging_session_entity.dart';
import '../../features/wallet/presentation/pages/wallet_dashboard_screen.dart';
import '../../features/wallet/presentation/pages/vnpay_processing_screen.dart';
import '../../features/wallet/presentation/pages/arrears_screen.dart';
import '../../features/profile/presentation/pages/profile_screen.dart';
import '../../features/profile/presentation/pages/vehicles_screen.dart';
import '../../features/profile/presentation/pages/security_settings_screen.dart';
import '../../features/notification/presentation/pages/notifications_screen.dart';
import '../design_system/theme/app_colors.dart';

/// Central app routing topology with persistent bottom navigation tabs
class AppRouter {
  final AuthBloc authBloc;
  AppRouter({required this.authBloc});

  late final GoRouter router = GoRouter(
    initialLocation: '/splash',
    debugLogDiagnostics: false,
    refreshListenable: GoRouterRefreshStream(authBloc.stream),
    redirect: (context, state) {
      final authState = authBloc.state;
      final isAuth      = authState is AuthAuthenticated;
      final isAuthRoute = state.matchedLocation.startsWith('/auth');
      final isPublic = state.matchedLocation == '/splash'
          || state.matchedLocation == '/welcome'
          || state.matchedLocation.startsWith('/map');

      // Save last visited route to storage
      final routeStr = state.uri.toString();
      if (!state.matchedLocation.startsWith('/auth') &&
          state.matchedLocation != '/splash' &&
          state.matchedLocation != '/welcome') {
        HydratedBloc.storage.write('last_visited_route', routeStr);
      }

      if (isAuth && (isAuthRoute || state.matchedLocation == '/welcome')) {
        final savedRoute = HydratedBloc.storage.read('last_visited_route') as String?;
        if (savedRoute != null && savedRoute.isNotEmpty && savedRoute != '/welcome') {
          return savedRoute;
        }
        return '/map';
      }
      if (!isAuth && !isAuthRoute && !isPublic) return '/welcome?redirect=${Uri.encodeComponent(state.uri.toString())}';
      return null;
    },
    routes: [
      // ── Public ─────────────────────────────────────────────────────
      GoRoute(path: '/splash', name: 'splash', builder: (_, __) => const SplashScreen()),
      GoRoute(
        path: '/welcome',
        name: 'welcome',
        pageBuilder: (context, state) {
          final redirect = state.uri.queryParameters['redirect'];
          return CustomTransitionPage(
            key: state.pageKey,
            child: WelcomeScreen(redirectUrl: redirect),
            transitionDuration: Duration.zero,
            transitionsBuilder: (context, animation, secondaryAnimation, child) => child,
          );
        },
      ),

      // ── Auth ───────────────────────────────────────────────────────
      GoRoute(
        path: '/auth/login',
        name: 'login',
        pageBuilder: (context, state) {
          final redirect = state.uri.queryParameters['redirect'];
          return CustomTransitionPage(
            key: state.pageKey,
            child: LoginScreen(redirectUrl: redirect),
            transitionDuration: Duration.zero,
            transitionsBuilder: (context, animation, secondaryAnimation, child) => child,
          );
        },
      ),
      GoRoute(
        path: '/auth/register',
        name: 'register',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const RegisterScreen(),
          transitionDuration: Duration.zero,
          transitionsBuilder: (context, animation, secondaryAnimation, child) => child,
        ),
      ),
      GoRoute(
        path: '/auth/forgot-password',
        name: 'forgot-password',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: const ForgotPasswordScreen(),
          transitionDuration: Duration.zero,
          transitionsBuilder: (context, animation, secondaryAnimation, child) => child,
        ),
      ),
      GoRoute(path: '/auth/mfa',       name: 'mfa-verify',builder: (_, __) => const MFAVerifyScreen()),
      GoRoute(
        path: '/auth/verify-email',
        name: 'verify-email',
        builder: (_, state) {
          final email = state.uri.queryParameters['email'] ?? '';
          return VerifyEmailPendingScreen(email: email);
        },
      ),
      GoRoute(
        path: '/auth/verify',
        name: 'verify-magic-link',
        builder: (_, state) {
          final token = state.uri.queryParameters['token'] ?? '';
          return MagicLinkVerifyScreen(token: token);
        },
      ),

      // ── Shell — 5 tab ──────────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (context, state, nav) => _AppScaffold(navigationShell: nav),
        branches: [

          // Tab 0: Map navigation
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/map', name: 'map',
              builder: (_, __) => const MapHomeScreen(),
              routes: [
                GoRoute(
                  path: 'station/:id/route', name: 'route-navigation',
                  builder: (_, state) {
                    final extra = state.extra as Map<String, dynamic>? ?? {};
                    return RouteNavigationScreen(
                      stationId:   state.pathParameters['id']!,
                      stationLat:  (extra['stationLat']  as num?)?.toDouble() ?? 0.0,
                      stationLng:  (extra['stationLng']  as num?)?.toDouble() ?? 0.0,
                      stationName: extra['stationName']?.toString() ?? 'Trạm sạc',
                      userLat:     (extra['userLat']     as num?)?.toDouble() ?? 0.0,
                      userLng:     (extra['userLng']     as num?)?.toDouble() ?? 0.0,
                    );
                  },
                ),

              ],
            ),
          ]),

          // Tab 1: Charger slot scheduler
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/bookings', name: 'booking-history',
              builder: (_, __) => const BookingHistoryScreen(),
              routes: [
                 GoRoute(
                  path: 'new', name: 'booking-new',
                  builder: (_, state) {
                    final extra = state.extra as Map<String, dynamic>? ?? {};
                    final query = state.uri.queryParameters;
                    
                    String getParam(String key, String defaultValue) {
                      final val = extra[key]?.toString() ?? query[key]?.toString() ?? defaultValue;
                      if (val == 'null' || val == 'undefined' || val.trim().isEmpty) {
                        return defaultValue;
                      }
                      return val;
                    }

                    return BookingNewScreen(
                      chargerId:          getParam('chargerId', ''),
                      stationId:          getParam('stationId', ''),
                      connectorType:      getParam('connectorType', 'CCS'),
                      physicalChargerId:  getParam('physicalChargerId', ''),
                    );
                  },
                ),
                GoRoute(
                  path: ':id', name: 'booking-detail',
                  builder: (_, state) => BookingDetailScreen(bookingId: state.pathParameters['id']!),
                ),
                GoRoute(
                  path: 'queue/:chargerId', name: 'queue-status',
                  builder: (_, state) => QueueStatusScreen(chargerId: state.pathParameters['chargerId']!),
                ),
              ],
            ),
          ]),

          // Tab 2: Active charging hub
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/charging', name: 'charging-hub',
              builder: (_, __) => const ChargingHubScreen(),
              routes: [
                GoRoute(path: 'scan', name: 'qr-scan', builder: (_, __) => const QRScanScreen()),
                GoRoute(
                  path: 'session/new', name: 'charging-new',
                  builder: (_, state) {
                    final extra = state.extra as Map<String, String>? ?? {};
                    return ActiveSessionScreen(sessionId: 'new',
                        bookingId: extra['bookingId'], qrToken: extra['qrToken']);
                  },
                ),
                GoRoute(
                  path: 'session/:id', name: 'active-session',
                  builder: (_, state) => ActiveSessionScreen(sessionId: state.pathParameters['id']!),
                  routes: [
                    GoRoute(
                      path: 'summary', name: 'session-summary',
                      builder: (_, state) {
                        final session = state.extra as ChargingSessionEntity?;
                        if (session != null) return SessionSummaryScreen(session: session);
                        return const _LoadingScreen(label: 'Tóm tắt phiên sạc');
                      },
                    ),
                  ],
                ),
              ],
            ),
          ]),

          // Tab 3: Digital payment wallet
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/wallet', name: 'wallet-dashboard',
              builder: (_, __) => const WalletDashboardScreen(),
              routes: [
                GoRoute(
                  path: 'topup/processing', name: 'vnpay-processing',
                  builder: (_, state) => VNPayProcessingScreen(
                    txnRef:       state.uri.queryParameters['vnp_TxnRef'],
                    responseCode: state.uri.queryParameters['vnp_ResponseCode'],
                  ),
                ),
              ],
            ),
          ]),

          // Tab 4: User settings profile
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/profile', name: 'profile',
              builder: (_, __) => const ProfileScreen(),
              routes: [
                GoRoute(path: 'vehicles', name: 'vehicles', builder: (_, __) => const VehiclesScreen()),
                GoRoute(path: 'security', name: 'security-settings', builder: (_, state) => SecuritySettingsScreen(initialIndex: state.extra as int? ?? 0)),
                GoRoute(path: 'arrears', name: 'arrears', builder: (_, __) => const ArrearsScreen()),
              ],
            ),
            GoRoute(path: '/notifications', name: 'notifications', builder: (_, __) => const NotificationsScreen()),
          ]),
        ],
      ),
    ],
  );
}

/// Shell Scaffold — Glass BottomNavigationBar 5-tab
class _AppScaffold extends StatelessWidget {
  final StatefulNavigationShell navigationShell;
  const _AppScaffold({required this.navigationShell});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final idx = navigationShell.currentIndex;

    return BlocListener<AuthBloc, AuthState>(
      listener: (context, state) {},
      child: Scaffold(
        extendBody: true,
        backgroundColor: Colors.transparent,
        body: navigationShell,
        bottomNavigationBar: _GlassNavBar(
          currentIndex: idx,
          isDark: isDark,
          onTap: (i) => navigationShell.goBranch(
            i,
            initialLocation: true,
          ),
        ),
      ),
    );
  }
}

/// Liquid Glass Bottom Navigation Bar
/// Matches demo Surface 01 Bar: translucent bg + blur + white border
/// Separates the glass background capsule and the items row into a Stack to allow
/// the active tab to float up as a bubble without being clipped at the top boundary.
class _GlassNavBar extends StatelessWidget {
  final int currentIndex;
  final bool isDark;
  final ValueChanged<int> onTap;

  const _GlassNavBar({
    required this.currentIndex,
    required this.isDark,
    required this.onTap,
  });

  static const _items = [
    (Icons.map_outlined,                   Icons.map,                   'Bản đồ'),
    (Icons.event_outlined,                 Icons.event,                 'Đặt lịch'),
    (Icons.bolt_outlined,                  Icons.bolt,                  'Sạc điện'),
    (Icons.account_balance_wallet_outlined,Icons.account_balance_wallet,'Ví'),
    (Icons.person_outlined,                Icons.person,                'Hồ sơ'),
  ];

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).padding.bottom;
    const barHeight = 72.0;
    final bottomPadding = bottom > 0 ? bottom + 6 : 16.0;
    // Provide 24px extra height at the top to perfectly accommodate the floating bubble overflow.
    final totalHeight = barHeight + bottomPadding + 24.0;

    return Container(
      height: totalHeight,
      color: Colors.transparent,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.bottomCenter,
        children: [
          // Layer 1: The Glass Bar Capsule (Background only)
          Positioned(
            left: 16,
            right: 16,
            bottom: bottomPadding,
            height: barHeight,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(36),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                child: Container(
                  decoration: BoxDecoration(
                    color: isDark
                        ? AppColors.barBgDark // ultra-premium deep navy obsidian glass from Design System
                        : AppColors.barBgLight, // crystal white light glass from Design System
                    borderRadius: BorderRadius.circular(36),
                    border: Border.all(
                      color: isDark
                          ? AppColors.barBorderDark
                          : AppColors.barBorderLight,
                      width: 1.2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.08),
                        blurRadius: 24,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Layer 2: The Interactive Items Row (which overflows freely at the top)
          Positioned(
            left: 16,
            right: 16,
            bottom: bottomPadding,
            height: barHeight,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: List.generate(_items.length, (i) {
                final (outlinedIcon, filledIcon, label) = _items[i];
                final isActive = i == currentIndex;
                return Expanded(
                  child: _NavItem(
                    icon: isActive ? filledIcon : outlinedIcon,
                    label: label,
                    isActive: isActive,
                    isDark: isDark,
                    onTap: () => onTap(i),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final bool isDark;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    const activeColor = Colors.white;
    final inactiveColor = isDark
        ? AppColors.textMuted
        : AppColors.textFaded;

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      behavior: HitTestBehavior.opaque,
      child: SizedBox.expand(
        child: Stack(
          alignment: Alignment.topCenter,
          clipBehavior: Clip.none,
          children: [
          // 1. The Floating Bubble Icon (Rises up beautifully with translation and elasticity)
          AnimatedContainer(
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeOutCubic, // Safe and fluid easeOut curve
            transform: Matrix4.translationValues(0, isActive ? -28 : 5, 0),
            width: isActive ? 56 : 42,
            height: isActive ? 56 : 42,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: isActive
                  ? AppColors.primaryGradient // App's main color gradient
                  : null,
              boxShadow: isActive
                  ? [
                      BoxShadow(
                        color: AppColors.primaryGradient.colors.first.withValues(alpha: 0.45),
                        blurRadius: 16,
                        offset: const Offset(0, 8),
                      ),
                      BoxShadow(
                        color: AppColors.primaryGradient.colors.last.withValues(alpha: 0.3),
                        blurRadius: 24,
                        offset: const Offset(0, 12),
                      ),
                    ]
                  : null,
            ),
            child: Center(
              child: AnimatedScale(
                scale: isActive ? 1.2 : 1.0,
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutBack,
                child: Icon(
                  icon,
                  size: 26,
                  color: isActive ? activeColor : inactiveColor,
                ),
              ),
            ),
          ),

          // 2. The Anchor Dot at the bottom of the active tab slot
          Positioned(
            bottom: 8,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeInOut,
              width: isActive ? 6 : 0,
              height: isActive ? 6 : 0,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: isActive
                    ? AppColors.primaryGradient
                    : null,
              ),
            ),
          ),

          // 3. The Tab Label (fades out when active for a premium, minimalist UI)
          Positioned(
            bottom: 10,
            child: AnimatedOpacity(
              opacity: isActive ? 0.0 : 1.0,
              duration: const Duration(milliseconds: 200),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontFamily: 'Outfit',
                  fontWeight: FontWeight.w600,
                  color: inactiveColor,
                  letterSpacing: 0.2,
                ),
              ),
            ),
          ),
        ],
        ),
      ),
    );
  }
}


/// Custom ChangeNotifier notifier acting as a route redirection guard
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    notifyListeners();
    _subscription = stream.listen((_) => notifyListeners());
  }
  late final dynamic _subscription;
  @override
  void dispose() { (_subscription as dynamic).cancel(); super.dispose(); }
}

class _LoadingScreen extends StatelessWidget {
  final String label;
  const _LoadingScreen({required this.label});
  @override
  Widget build(BuildContext context) =>
      Scaffold(appBar: AppBar(title: Text(label)), body: const Center(child: CircularProgressIndicator()));
}
