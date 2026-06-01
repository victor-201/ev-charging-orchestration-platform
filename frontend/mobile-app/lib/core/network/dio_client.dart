import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';
import '../config/app_config.dart';
import 'dio_interceptors.dart';

/// DioClient configured with flavor-based baseUrl, timeouts, and interceptors
class DioClient {
  late final Dio _dio;
  static const _uuid = Uuid();

  DioClient({
    required FlutterSecureStorage secureStorage,
    Future<void> Function()? onLogout,
  }) {
    final config = AppConfig.current;
    // ignore: avoid_print
    print('[DioClient] baseUrl = ${config.baseUrl} (flavor=${config.flavor})');

    _dio = Dio(BaseOptions(
      baseUrl: config.baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Ngrok free tier — bypass the interstitial warning page
        'ngrok-skip-browser-warning': 'true',
      },
    ));

    // Order is important: TimeSync → Logging → Auth
    _dio.interceptors.addAll([
      DioTimeSyncInterceptor(),
      DioLoggingInterceptor(enabled: config.enableLogging),
      DioAuthInterceptor(
        secureStorage: secureStorage,
        dio: _dio,
        onLogout: onLogout,
      ),
    ]);
  }

  Dio get dio => _dio;

  /// Wires the logout callback after [AuthBloc] is ready.
  /// Called from [_EVoltAppState.initState] to avoid a circular DI dependency.
  void setOnLogout(Future<void> Function() callback) {
    for (final interceptor in _dio.interceptors) {
      if (interceptor is DioAuthInterceptor) {
        interceptor.onLogout = callback;
        return;
      }
    }
  }

  /// Idempotency header for all payment-related POST requests
  Map<String, String> idempotencyHeader() =>
      {'Idempotency-Key': _uuid.v4()};

  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _dio.get<T>(path,
          queryParameters: queryParameters, options: options);

  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    bool withIdempotency = false,
  }) {
    final mergedOptions = withIdempotency
        ? Options(
            headers: {
              ...?options?.headers,
              ...idempotencyHeader(),
            },
          )
        : options;
    return _dio.post<T>(path,
        data: data,
        queryParameters: queryParameters,
        options: mergedOptions);
  }

  Future<Response<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _dio.patch<T>(path,
          data: data,
          queryParameters: queryParameters,
          options: options);

  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) =>
      _dio.delete<T>(path,
          data: data,
          queryParameters: queryParameters,
          options: options);
}
