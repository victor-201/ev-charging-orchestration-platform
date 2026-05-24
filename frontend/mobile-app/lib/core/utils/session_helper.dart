import 'session_helper_stub.dart'
    if (dart.library.html) 'session_helper_web.dart';

/// Checks whether the current app session is a reload/F5.
/// Returns true if the session is active (e.g. reload or hot restart).
bool isAppReload() {
  return getIsReload();
}

/// Marks the current session as active, meaning subsequent starts are treated as reloads/F5.
void setSessionActive() {
  markSessionActive();
}
