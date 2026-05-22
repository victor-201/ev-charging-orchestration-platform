part of 'notification_bloc.dart';

abstract class NotificationEvent extends Equatable {
  const NotificationEvent();
  @override
  List<Object?> get props => [];
}

class NotificationLoad extends NotificationEvent {
  const NotificationLoad();
}

class NotificationMarkRead extends NotificationEvent {
  final String id;
  const NotificationMarkRead({required this.id});
  @override
  List<Object?> get props => [id];
}

class NotificationMarkAllRead extends NotificationEvent {
  const NotificationMarkAllRead();
}

class NotificationRegisterDevice extends NotificationEvent {
  final String pushToken;
  const NotificationRegisterDevice({required this.pushToken});
  @override
  List<Object?> get props => [pushToken];
}

class NotificationUnregisterDevice extends NotificationEvent {
  final String deviceId;
  const NotificationUnregisterDevice({required this.deviceId});
  @override
  List<Object?> get props => [deviceId];
}

class NotificationPreferencesLoad extends NotificationEvent {
  const NotificationPreferencesLoad();
}

class NotificationPreferencesUpdate extends NotificationEvent {
  final NotificationPreferencesEntity prefs;
  const NotificationPreferencesUpdate({required this.prefs});
  @override
  List<Object?> get props => [prefs];
}

class NotificationReceived extends NotificationEvent {
  final NotificationEntity notification;
  const NotificationReceived({required this.notification});
  @override
  List<Object?> get props => [notification];
}
