import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  final String flavor;
  final String baseUrl;
  final String wsBaseUrl;
  final bool enableLogging;

  const AppConfig._({
    required this.flavor,
    required this.baseUrl,
    required this.wsBaseUrl,
    required this.enableLogging,
  });

  static AppConfig get current {
    final flavor = dotenv.env['FLAVOR'] ?? 'dev';
    final apiOverride = dotenv.env['API_BASE_URL'] ?? '';
    final wsOverride = dotenv.env['WEBSOCKET_URL'] ?? '';

    String resolveBase() {
      if (apiOverride.isNotEmpty) return apiOverride;
      switch (flavor) {
        case 'prod': return 'https://api.ev-charging.vn';
        case 'staging': return 'https://api-staging.ev-charging.vn';
        default: return 'http://localhost:8000';
      }
    }

    String resolveWs(String base) {
      if (wsOverride.isNotEmpty) return wsOverride;
      // Fallback: derive from API_BASE_URL (replace scheme)
      return base
          .replaceFirst('https://', 'wss://')
          .replaceFirst('http://', 'ws://');
    }

    final base = resolveBase();
    return AppConfig._(
      flavor: flavor,
      baseUrl: base,
      wsBaseUrl: resolveWs(base),
      enableLogging: flavor != 'prod',
    );
  }

  bool get isDev => flavor == 'dev';
  bool get isStaging => flavor == 'staging';
  bool get isProd => flavor == 'prod';
}
