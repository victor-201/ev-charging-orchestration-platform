import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/notification_entity.dart';
import '../../domain/repositories/i_notification_repository.dart';

/// Notification Management Business Logic Component (BLoC)
///
/// Coordinates all states and operations related to customer push notifications, unread counts,
/// push token device registration, and fine-grained communication preferences.
abstract class NotificationEvent extends Equatable {
  const NotificationEvent();
  @override
  List<Object?> get props => [];
}

class NotificationLoad extends NotificationEvent { const NotificationLoad(); }
class NotificationMarkRead extends NotificationEvent {
  final String id;
  const NotificationMarkRead({required this.id});
  @override List<Object?> get props => [id];
}
class NotificationMarkAllRead extends NotificationEvent { const NotificationMarkAllRead(); }
class NotificationRegisterDevice extends NotificationEvent {
  final String pushToken;
  const NotificationRegisterDevice({required this.pushToken});
  @override List<Object?> get props => [pushToken];
}
class NotificationUnregisterDevice extends NotificationEvent {
  final String deviceId;
  const NotificationUnregisterDevice({required this.deviceId});
  @override List<Object?> get props => [deviceId];
}
class NotificationPreferencesLoad extends NotificationEvent { const NotificationPreferencesLoad(); }
class NotificationPreferencesUpdate extends NotificationEvent {
  final NotificationPreferencesEntity prefs;
  const NotificationPreferencesUpdate({required this.prefs});
  @override List<Object?> get props => [prefs];
}
class NotificationReceived extends NotificationEvent {
  final NotificationEntity notification;
  const NotificationReceived({required this.notification});
  @override List<Object?> get props => [notification];
}

abstract class NotificationState extends Equatable {
  const NotificationState();
  @override List<Object?> get props => [];
}

class NotificationInitial extends NotificationState { const NotificationInitial(); }
class NotificationLoading extends NotificationState { const NotificationLoading(); }

class NotificationLoaded extends NotificationState {
  final List<NotificationEntity> notifications;
  final int unreadCount;
  final NotificationPreferencesEntity? preferences;
  const NotificationLoaded({required this.notifications, required this.unreadCount, this.preferences});
  @override List<Object?> get props => [notifications, unreadCount];
}

class NotificationError extends NotificationState {
  final String message;
  const NotificationError({required this.message});
  @override List<Object?> get props => [message];
}

class NotificationBloc extends Bloc<NotificationEvent, NotificationState> {
  final INotificationRepository _repository;

  NotificationBloc({required INotificationRepository repository})
      : _repository = repository,
        super(const NotificationInitial()) {
    on<NotificationLoad>(_onLoad);
    on<NotificationMarkRead>(_onMarkRead);
    on<NotificationMarkAllRead>(_onMarkAllRead);
    on<NotificationRegisterDevice>(_onRegisterDevice);
    on<NotificationUnregisterDevice>(_onUnregisterDevice);
    on<NotificationPreferencesLoad>(_onPrefsLoad);
    on<NotificationPreferencesUpdate>(_onPrefsUpdate);
    on<NotificationReceived>(_onReceived);
  }

  Future<void> _onLoad(NotificationLoad e, Emitter<NotificationState> emit) async {
    emit(const NotificationLoading());
    final notifResult = await _repository.getNotifications();
    final countResult = await _repository.getUnreadCount();
    notifResult.fold(
      (f) => emit(NotificationError(message: f.message)),
      (notifs) => countResult.fold(
        (f) => emit(NotificationLoaded(notifications: notifs, unreadCount: 0)),
        (count) => emit(NotificationLoaded(notifications: notifs, unreadCount: count)),
      ),
    );
  }

  Future<void> _onMarkRead(NotificationMarkRead e, Emitter<NotificationState> emit) async {
    await _repository.markRead(e.id);
    final current = state;
    if (current is NotificationLoaded) {
      final updated = current.notifications.map((n) =>
          n.id == e.id ? NotificationEntity(id: n.id, title: n.title, body: n.body, type: n.type, isRead: true, createdAt: n.createdAt, data: n.data) : n
      ).toList();
      emit(NotificationLoaded(
        notifications: updated,
        unreadCount: (current.unreadCount - 1).clamp(0, 9999),
        preferences: current.preferences,
      ));
    }
  }

  Future<void> _onMarkAllRead(NotificationMarkAllRead e, Emitter<NotificationState> emit) async {
    await _repository.markAllRead();
    final current = state;
    if (current is NotificationLoaded) {
      final updated = current.notifications.map((n) =>
          NotificationEntity(id: n.id, title: n.title, body: n.body, type: n.type, isRead: true, createdAt: n.createdAt, data: n.data)
      ).toList();
      emit(NotificationLoaded(notifications: updated, unreadCount: 0, preferences: current.preferences));
    }
  }

  Future<void> _onRegisterDevice(NotificationRegisterDevice e, Emitter<NotificationState> emit) async {
    await _repository.registerDevice(e.pushToken);
  }

  Future<void> _onUnregisterDevice(NotificationUnregisterDevice e, Emitter<NotificationState> emit) async {
    await _repository.unregisterDevice(e.deviceId);
  }

  Future<void> _onPrefsLoad(NotificationPreferencesLoad e, Emitter<NotificationState> emit) async {
    final result = await _repository.getPreferences();
    result.fold(
      (f) {},
      (prefs) {
        final current = state;
        if (current is NotificationLoaded) {
          emit(NotificationLoaded(notifications: current.notifications, unreadCount: current.unreadCount, preferences: prefs));
        }
      },
    );
  }

  Future<void> _onPrefsUpdate(NotificationPreferencesUpdate e, Emitter<NotificationState> emit) async {
    await _repository.updatePreferences(e.prefs);
    final current = state;
    if (current is NotificationLoaded) {
      emit(NotificationLoaded(notifications: current.notifications, unreadCount: current.unreadCount, preferences: e.prefs));
    }
  }

  void _onReceived(NotificationReceived e, Emitter<NotificationState> emit) {
    final current = state;
    if (current is NotificationLoaded) {
      emit(NotificationLoaded(
        notifications: [e.notification, ...current.notifications],
        unreadCount: current.unreadCount + 1,
        preferences: current.preferences,
      ));
    }
  }
}
