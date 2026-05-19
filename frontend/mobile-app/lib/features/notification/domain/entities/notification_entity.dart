import 'package:equatable/equatable.dart';

/// Notification Alert and Preferences Domain Entity
///
/// Encapsulates notification payloads, dynamic deep-link routing generators,
/// and fine-grained communication mode preferences (Push, SMS, Email, Quiet Hours).
class NotificationEntity extends Equatable {
  final String id;
  final String title;
  final String body;
  final String type; // booking_confirmed | booking_no_show | charging_started | charging_completed | payment_success | arrears_created | idle_fee_started | queue_turn
  final bool isRead;
  final DateTime createdAt;
  final Map<String, String>? data; // deep link params: bookingId, sessionId etc.

  const NotificationEntity({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.isRead,
    required this.createdAt,
    this.data,
  });

  String? get deepLink {
    switch (type) {
      case 'booking_confirmed':
      case 'booking_no_show':
        return '/bookings/${data?['bookingId']}';
      case 'charging_started':
      case 'idle_fee_started':
        return '/charging/session/${data?['sessionId']}';
      case 'charging_completed':
        return '/charging/session/${data?['sessionId']}/summary';
      case 'payment_success':
      case 'arrears_created':
        return '/wallet';
      case 'queue_turn':
        // Redirect to slot scheduler upon receiving the virtual queue allocation turn.
        return data?['chargerId'] != null
            ? '/bookings/new?chargerId=${data!['chargerId']}'
            : '/bookings';
      default:
        return null;
    }
  }

  @override
  List<Object?> get props => [id, isRead, createdAt];
}

class NotificationPreferencesEntity extends Equatable {
  final bool enablePush;
  final bool enableRealtime;
  final bool enableEmail;
  final bool enableSms;
  final String? quietHoursStart; // "22:00"
  final String? quietHoursEnd;   // "07:00"

  const NotificationPreferencesEntity({
    this.enablePush = true,
    this.enableRealtime = true,
    this.enableEmail = true,
    this.enableSms = false,
    this.quietHoursStart,
    this.quietHoursEnd,
  });

  @override
  List<Object?> get props => [enablePush, enableRealtime, enableEmail, enableSms];
}
