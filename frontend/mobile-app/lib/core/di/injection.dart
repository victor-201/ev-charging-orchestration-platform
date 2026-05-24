import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../network/dio_client.dart';
import '../data/local/secure_storage_service.dart';
import '../data/local/shared_prefs_service.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/i_auth_repository.dart';
import '../../features/booking/data/repositories/booking_repository_impl.dart';
import '../../features/booking/domain/repositories/i_booking_repository.dart';
import '../../features/charging/data/repositories/charging_session_repository_impl.dart';
import '../../features/charging/domain/repositories/i_charging_session_repository.dart';
import '../../features/map/data/repositories/station_repository_impl.dart';
import '../../features/map/domain/repositories/i_station_repository.dart';
import '../../features/wallet/data/repositories/wallet_repository_impl.dart';
import '../../features/wallet/domain/repositories/i_wallet_repository.dart';
import '../../features/notification/data/repositories/notification_repository_impl.dart';
import '../../features/notification/domain/repositories/i_notification_repository.dart';
import '../../features/profile/data/repositories/profile_repository_impl.dart';
import '../../features/profile/domain/repositories/i_profile_repository.dart';

import '../../features/map/domain/usecases/get_stations_usecase.dart';
import '../../features/map/domain/usecases/search_stations_usecase.dart';
import '../../features/map/domain/usecases/get_station_by_id_usecase.dart';
import '../../features/map/domain/usecases/get_charger_pricing_usecase.dart';
import '../../features/map/domain/usecases/suggest_optimal_station_usecase.dart';
import '../../features/map/presentation/bloc/map_bloc.dart';
import '../../features/profile/presentation/bloc/profile_bloc.dart';
import '../../features/wallet/presentation/bloc/wallet_bloc.dart';
import '../../features/notification/presentation/bloc/notification_bloc.dart';
import '../../features/charging/presentation/bloc/charging_session_bloc.dart';
import '../../features/booking/presentation/bloc/booking_bloc.dart';

/// Central dependency injection registry
final getIt = GetIt.instance;

/// Boots and registers all platform service locators
Future<void> configureDependencies() async {
  // ── Local Storage Registries ───────────────────────────────────────
  const secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );
  getIt.registerSingleton<FlutterSecureStorage>(secureStorage);
  getIt.registerSingleton<SecureStorageService>(SecureStorageService(secureStorage));

  final prefs = await SharedPreferences.getInstance();
  getIt.registerSingleton<SharedPrefsService>(SharedPrefsService(prefs));

  // ── HTTP & Web Socket Client Registries ────────────────────────────
  getIt.registerSingleton<DioClient>(
    DioClient(secureStorage: secureStorage),
    // onLogout is wired in _EVoltAppState.initState() to avoid circular deps
  );

  // ── Repositories ─────────────────────────────────────────────────────
  getIt.registerLazySingleton<IAuthRepository>(() =>
      AuthRepositoryImpl(client: getIt<DioClient>(), storage: getIt<SecureStorageService>()));

  getIt.registerLazySingleton<IStationRepository>(() =>
      StationRepositoryImpl(client: getIt<DioClient>()));

  getIt.registerLazySingleton<IBookingRepository>(() =>
      BookingRepositoryImpl(client: getIt<DioClient>()));

  getIt.registerLazySingleton<IChargingSessionRepository>(() =>
      ChargingSessionRepositoryImpl(client: getIt<DioClient>()));

  getIt.registerLazySingleton<IWalletRepository>(() =>
      WalletRepositoryImpl(client: getIt<DioClient>()));

  getIt.registerLazySingleton<INotificationRepository>(() =>
      NotificationRepositoryImpl(client: getIt<DioClient>()));

  getIt.registerLazySingleton<IProfileRepository>(() =>
      ProfileRepositoryImpl(client: getIt<DioClient>()));

  // ── UseCases ─────────────────────────────────────────────────────────
  getIt.registerLazySingleton<GetStationsUseCase>(() => GetStationsUseCase(getIt<IStationRepository>()));
  getIt.registerLazySingleton<SearchStationsUseCase>(() => SearchStationsUseCase(getIt<IStationRepository>()));
  getIt.registerLazySingleton<GetStationByIdUseCase>(() => GetStationByIdUseCase(getIt<IStationRepository>()));
  getIt.registerLazySingleton<GetChargerPricingUseCase>(() => GetChargerPricingUseCase(getIt<IStationRepository>()));
  getIt.registerLazySingleton<SuggestOptimalStationUseCase>(() => SuggestOptimalStationUseCase(getIt<IStationRepository>()));

  // ── Blocs ────────────────────────────────────────────────────────────
  getIt.registerFactory<MapBloc>(() => MapBloc(
        getStationsUseCase: getIt<GetStationsUseCase>(),
        getStationByIdUseCase: getIt<GetStationByIdUseCase>(),
      ));
  getIt.registerFactory<ProfileBloc>(() => ProfileBloc(repository: getIt<IProfileRepository>()));
  getIt.registerFactory<WalletBloc>(() => WalletBloc(repository: getIt<IWalletRepository>()));
  getIt.registerFactory<NotificationBloc>(() => NotificationBloc(repository: getIt<INotificationRepository>()));
  getIt.registerFactory<ChargingSessionBloc>(() => ChargingSessionBloc(repository: getIt<IChargingSessionRepository>()));
  getIt.registerFactory<BookingBloc>(() => BookingBloc(repository: getIt<IBookingRepository>()));
}
