/*
 * EVoltSync - EV Charging Orchestration Mobile Platform
 * 
 * Architecture: Clean Architecture / Feature-Driven Development
 * State Management: BLoC (Business Logic Component)
 * Dependency Injection: get_it & injectable
 * Routing: go_router
 * Networking: dio
 * 
 * Feature Modules:
 * - Auth: User authentication & session management
 * - Map: Real-time charging station discovery
 * - Booking: Charging point reservation system
 * - Charging: Real-time charging session control
 * - Wallet: Payments and transaction history
 * - Profile: User account and vehicle management
 */
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import 'package:path_provider/path_provider.dart';
import 'core/design_system/theme/app_theme.dart';
import 'core/routes/app_router.dart';
import 'core/di/injection.dart';
import 'features/auth/presentation/bloc/auth_bloc.dart';
import 'features/auth/presentation/bloc/auth_bloc.dart';
import 'features/auth/domain/repositories/i_auth_repository.dart';
import 'features/map/presentation/bloc/map_bloc.dart';
import 'features/profile/presentation/bloc/profile_bloc.dart';
import 'features/wallet/presentation/bloc/wallet_bloc.dart';
import 'features/notification/presentation/bloc/notification_bloc.dart';
import 'features/charging/presentation/bloc/charging_session_bloc.dart';
import 'features/booking/presentation/bloc/booking_bloc.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  await dotenv.load(fileName: ".env");

  // Configures the local storage engine for HydratedBloc state persistence across app sessions.
  final storage = await HydratedStorage.build(
    storageDirectory: kIsWeb
        ? HydratedStorage.webStorageDirectory
        : await getTemporaryDirectory(),
  );
  HydratedBloc.storage = storage;

  await configureDependencies();

  runApp(const EVoltApp());
}

class EVoltApp extends StatefulWidget {
  const EVoltApp({super.key});

  @override
  State<EVoltApp> createState() => _EVoltAppState();
}

class _EVoltAppState extends State<EVoltApp> {
  late final AuthBloc _authBloc;
  late final AppRouter _appRouter;

  @override
  void initState() {
    super.initState();
    _authBloc = AuthBloc(repository: getIt<IAuthRepository>());
    _appRouter = AppRouter(authBloc: _authBloc);
    _authBloc.add(AuthCheckRequested());
  }

  @override
  void dispose() {
    _authBloc.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider.value(value: _authBloc),
        BlocProvider(create: (_) => getIt<MapBloc>()),
        BlocProvider(create: (_) => getIt<ProfileBloc>()),
        BlocProvider(create: (_) => getIt<WalletBloc>()),
        BlocProvider(create: (_) => getIt<NotificationBloc>()),
        BlocProvider(create: (_) => getIt<ChargingSessionBloc>()),
        BlocProvider(create: (_) => getIt<BookingBloc>()),
      ],
      child: MaterialApp.router(
        title: 'EVoltSync',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.system,
        routerConfig: _appRouter.router,
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [
          Locale('vi', 'VN'),
          Locale('en', 'US'),
        ],
      ),
    );
  }
}
