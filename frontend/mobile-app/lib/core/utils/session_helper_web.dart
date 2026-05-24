// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:html' as html;

/// Web-specific implementation of session helper using sessionStorage to detect reloads/F5.
bool getIsReload() {
  try {
    final active = html.window.sessionStorage['app_session_active'];
    return active == 'true';
  } catch (_) {
    return false;
  }
}

void markSessionActive() {
  try {
    html.window.sessionStorage['app_session_active'] = 'true';
  } catch (_) {}
}
