import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

/// Handles navigation redirects upon receiving real-time FCM background signals
class FcmRouteHandler {
  static void setupForegroundHandler(GlobalKey<NavigatorState> navigatorKey) {
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint('[FCM] Foreground: ${message.notification?.title}');
      // TODO: Render customized in-app notification banner overlay
    });

    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      debugPrint('[FCM] Opened: ${message.data}');
      _handleNavigation(message.data, navigatorKey);
    });
  }

  static void _handleNavigation(
      Map<String, dynamic> data, GlobalKey<NavigatorState> navigatorKey) {
    final route = data['route'] as String?;
    if (route != null && navigatorKey.currentContext != null) {
      Navigator.of(navigatorKey.currentContext!).pushNamed(route);
    }
  }
}
