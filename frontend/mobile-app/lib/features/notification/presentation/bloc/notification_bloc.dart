import 'dart:async';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/notification_entity.dart';
import '../../domain/repositories/i_notification_repository.dart';

part 'notification_event.dart';
part 'notification_state.dart';

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
