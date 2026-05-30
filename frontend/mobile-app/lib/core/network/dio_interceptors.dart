import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../constants/storage_keys.dart';

/// JWT Authentication Interceptor — injects Bearer token, handles 401 refresh
/// Inherits from QueuedInterceptor to queue all concurrent 401 requests
class DioAuthInterceptor extends QueuedInterceptor {
  final FlutterSecureStorage _secureStorage;
  final Dio _dio;
  Future<void> Function()? onLogout;  // mutable — wired after AuthBloc is ready

  DioAuthInterceptor({
    required FlutterSecureStorage secureStorage,
    required Dio dio,
    this.onLogout,
  })  : _secureStorage = secureStorage,
        _dio = dio;

  @override
  void onRequest(
      RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _secureStorage.read(key: StorageKeys.accessToken);
    // Only attach if we have a real non-empty token
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(
      DioException err, ErrorInterceptorHandler handler) async {
    final authHeader = err.requestOptions.headers['Authorization']?.toString();
    final isAuthRequest = authHeader != null && authHeader.startsWith('Bearer ');
    final isUnauthenticatedPath = err.requestOptions.path.contains('/auth/login') ||
        err.requestOptions.path.contains('/auth/register') ||
        err.requestOptions.path.contains('/auth/verify-email') ||
        err.requestOptions.path.contains('/auth/resend-verification') ||
        err.requestOptions.path.contains('/auth/refresh');

    // Only handle 401 on authenticated requests and not the refresh/auth endpoints themselves
    if (err.response?.statusCode == 401 &&
        isAuthRequest &&
        !isUnauthenticatedPath) {
      // Skip refresh attempt when there is no (or empty) refresh token stored.
      // Avoids an extra round-trip on first app launch before login.
      final refreshToken =
          await _secureStorage.read(key: StorageKeys.refreshToken);
      if (refreshToken == null || refreshToken.isEmpty) {
        handler.next(err);
        return;
      }

      try {
        final newTokens = await _refresh();
        if (newTokens != null) {
          await _secureStorage.write(
            key: StorageKeys.accessToken,
            value: newTokens,
          );
          // Retry original request with new token
          err.requestOptions.headers['Authorization'] = 'Bearer $newTokens';
          final retry = await _dio.fetch(err.requestOptions);
          return handler.resolve(retry);
        }
      } catch (e) {
        // Refresh failed — distinguish definitive rejection from transient
        if (e is DioException && e.response?.statusCode == 401) {
          // Refresh token definitively rejected by server → clear & logout
          await _clearTokens();
          onLogout?.call();
        }
        // For connection errors, timeouts, 5xx, etc., keep tokens in storage.
        // The server may recover and the caller can retry.
      }
    }
    handler.next(err);
  }

  /// Retry-friendly refresh with exponential backoff for transient failures.
  /// Returns `null` if no refresh token exists or the response lacks an accessToken.
  /// Throws [DioException] on definitive 401 rejection.
  /// For transient errors (timeout, connection refused, 5xx) it retries up to 2×.
  Future<String?> _refresh() async {
    final refreshToken =
        await _secureStorage.read(key: StorageKeys.refreshToken);
    if (refreshToken == null || refreshToken.isEmpty) return null;

    // Use a separate Dio instance to avoid deadlocks in QueuedInterceptor
    final refreshDio = Dio(BaseOptions(
      baseUrl: _dio.options.baseUrl,
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

    const maxAttempts = 3;
    for (int attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        final response = await refreshDio.post(
          '/auth/refresh',
          data: {'refreshToken': refreshToken},
        );

        // Handle both flat { accessToken } and wrapped { data: { accessToken } }
        final body = response.data as Map<String, dynamic>? ?? {};
        final payload = (body['data'] is Map<String, dynamic>)
            ? body['data'] as Map<String, dynamic>
            : body;

        final accessToken = payload['accessToken'] as String?;
        final newRefresh = payload['refreshToken'] as String?;

        if (newRefresh != null && newRefresh.isNotEmpty) {
          await _secureStorage.write(
            key: StorageKeys.refreshToken,
            value: newRefresh,
          );
        }
        return (accessToken != null && accessToken.isNotEmpty) ? accessToken : null;
      } on DioException catch (e) {
        // Definitive 401 rejection — don't retry, rethrow immediately
        if (e.response?.statusCode == 401) rethrow;
        // Transient error — retry unless this was the last attempt
        if (attempt < maxAttempts - 1) {
          await Future.delayed(Duration(seconds: 1 << attempt));
          continue;
        }
        rethrow;
      }
    }
    return null;
  }

  Future<void> _clearTokens() async {
    await _secureStorage.delete(key: StorageKeys.accessToken);
    await _secureStorage.delete(key: StorageKeys.refreshToken);
  }
}

/// Logging Interceptor — active only in dev flavor
class DioLoggingInterceptor extends Interceptor {
  final bool enabled;

  DioLoggingInterceptor({required this.enabled});

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (enabled) {
      // ignore: avoid_print
      print(
          '[DIO] → ${options.method} ${options.baseUrl}${options.path}');
    }
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (enabled) {
      // ignore: avoid_print
      print('[DIO] ← ${response.statusCode} ${response.requestOptions.path}');
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (enabled) {
      // ignore: avoid_print
      print(
          '[DIO] ✗ ${err.response?.statusCode} ${err.requestOptions.path}: ${err.message}');
      if (err.response?.data != null) {
        // ignore: avoid_print
        print('[DIO] Error Body: ${err.response?.data}');
      }
    }
    handler.next(err);
  }
}
