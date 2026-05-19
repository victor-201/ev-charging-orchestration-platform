import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/notification_entity.dart';

/// Notification Services Repository Interface
///
/// Defines the data-layer contract for fetching notification logs, tracking unread counts,
/// managing push notification device tokens, and updating alert preferences.
abstract class INotificationRepository {
  /// Retrieves a list of chronological notification records for the user.
  Future<Either<Failure, List<NotificationEntity>>> getNotifications({int limit = 20});

  /// Counts the total number of unread notifications in the user's inbox.
  Future<Either<Failure, int>> getUnreadCount();

  /// Marks a specific notification as read.
  Future<Either<Failure, void>> markRead(String id);

  /// Marks all unread notifications in the user's inbox as read.
  Future<Either<Failure, void>> markAllRead();

  /// Registers a mobile push notification token (FCM/APNS) for the current device.
  Future<Either<Failure, void>> registerDevice(String pushToken);

  /// Unregisters a mobile push notification token, disabling notifications on this device.
  Future<Either<Failure, void>> unregisterDevice(String deviceId);

  /// Queries the user's notification event preference settings.
  Future<Either<Failure, NotificationPreferencesEntity>> getPreferences();

  /// Modifies the user's notification preference indicators.
  Future<Either<Failure, void>> updatePreferences(NotificationPreferencesEntity prefs);
}
