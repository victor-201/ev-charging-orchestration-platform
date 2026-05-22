part of 'notification_bloc.dart';

abstract class NotificationState extends Equatable {
  const NotificationState();
  @override
  List<Object?> get props => [];
}

class NotificationInitial extends NotificationState {
  const NotificationInitial();
}

class NotificationLoading extends NotificationState {
  const NotificationLoading();
}

class NotificationLoaded extends NotificationState {
  final List<NotificationEntity> notifications;
  final int unreadCount;
  final NotificationPreferencesEntity? preferences;

  const NotificationLoaded({
    required this.notifications,
    required this.unreadCount,
    this.preferences,
  });

  @override
  List<Object?> get props => [notifications, unreadCount, preferences];
}

class NotificationError extends NotificationState {
  final String message;
  const NotificationError({required this.message});
  @override
  List<Object?> get props => [message];
}
