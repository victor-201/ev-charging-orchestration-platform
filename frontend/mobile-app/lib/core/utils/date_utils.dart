import 'package:intl/intl.dart';

/// Global DateTime utility extensions and formatting schemas
class DateUtils {
  DateUtils._();

  static Duration _serverOffset = Duration.zero;

  /// Synchronize app time with server time using an offset.
  /// offset = serverTime - phoneTime
  static void setServerOffset(Duration offset) {
    _serverOffset = offset;
    // ignore: avoid_print
    print('[DateUtils] Time sync updated. Offset: ${offset.inMilliseconds}ms');
  }

  /// Returns the current time synchronized with the server.
  static DateTime get now => DateTime.now().add(_serverOffset);

  static final _dateFormat     = DateFormat('dd/MM/yyyy', 'vi_VN');
  static final _timeFormat     = DateFormat('HH:mm', 'vi_VN');
  static final _dateTimeFormat = DateFormat('dd/MM/yyyy HH:mm', 'vi_VN');

  static String formatDate(DateTime dt)     => _dateFormat.format(dt);
  static String formatTime(DateTime dt)     => _timeFormat.format(dt);
  static String formatDateTime(DateTime dt) => _dateTimeFormat.format(dt);

  /// Short time hour-minute formatter (e.g. 14:30)
  static String formatTimeHm(DateTime dt) => _timeFormat.format(dt);

  /// Compares if two DateTime instances share the same calendar day
  static bool isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  /// Validates legal age requirement (minimum 18 years from birthdate)
  static bool isAtLeast18(DateTime dateOfBirth) {
    final sNow = now;
    final age = sNow.year - dateOfBirth.year;
    if (age > 18) return true;
    if (age == 18) {
      if (sNow.month > dateOfBirth.month) return true;
      if (sNow.month == dateOfBirth.month && sNow.day >= dateOfBirth.day) return true;
    }
    return false;
  }

  /// Formats dynamic durations into standard countdowns (HH:MM:SS)
  static String formatCountdown(Duration duration) {
    final hours   = duration.inHours.toString().padLeft(2, '0');
    final minutes = duration.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$hours:$minutes:$seconds';
  }

  /// Formats dynamic durations into compact countdowns (MM:SS)
  static String formatCountdownMinSec(Duration duration) {
    final minutes = duration.inMinutes.toString().padLeft(2, '0');
    final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  /// Computes relative human-friendly date indicators (e.g. "just now", "3m ago")
  static String formatRelative(DateTime dt) {
    final sNow = now;
    final diff = sNow.difference(dt);
    if (diff.inSeconds < 60) return 'Vừa xong';
    if (diff.inMinutes < 60) return '${diff.inMinutes} phút trước';
    if (diff.inHours < 24)   return '${diff.inHours} giờ trước';
    if (diff.inDays == 1)    return 'Hôm qua';
    if (diff.inDays < 7)     return '${diff.inDays} ngày trước';
    return formatDate(dt);
  }
}
