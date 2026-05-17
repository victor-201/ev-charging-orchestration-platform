import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/profile_entity.dart';
import '../../domain/repositories/i_profile_repository.dart';

/// User Profile and Fleet Management Business Logic Component (BLoC)
///
/// Coordinates all states and operations related to user profile information, password
/// updates, active device session terminations, and personal electric vehicle fleet registers.
abstract class ProfileEvent extends Equatable {
  const ProfileEvent();
  @override List<Object?> get props => [];
}
class ProfileLoad extends ProfileEvent { const ProfileLoad(); }
class ProfileUpdate extends ProfileEvent {
  final String? fullName; final String? phone; final DateTime? dateOfBirth;
  const ProfileUpdate({this.fullName, this.phone, this.dateOfBirth});
  @override List<Object?> get props => [fullName, phone, dateOfBirth];
}
class ProfileChangePassword extends ProfileEvent {
  final String currentPassword; final String newPassword;
  const ProfileChangePassword({required this.currentPassword, required this.newPassword});
  @override List<Object?> get props => [currentPassword];
}
class ProfileLoadSessions extends ProfileEvent { const ProfileLoadSessions(); }
class ProfileRevokeSession extends ProfileEvent {
  final String id; const ProfileRevokeSession({required this.id});
  @override List<Object?> get props => [id];
}
class ProfileRevokeAllSessions extends ProfileEvent { const ProfileRevokeAllSessions(); }
class VehicleLoad extends ProfileEvent { const VehicleLoad(); }
class VehicleAdd extends ProfileEvent {
  final String plateNumber, model, brand, connectorType;
  final double batteryCapacityKwh;
  const VehicleAdd({required this.plateNumber, required this.model, required this.brand, required this.connectorType, required this.batteryCapacityKwh});
  @override List<Object?> get props => [plateNumber];
}
class VehicleDelete extends ProfileEvent {
  final String id; const VehicleDelete({required this.id});
  @override List<Object?> get props => [id];
}
class VehicleSetPrimary extends ProfileEvent {
  final String id; const VehicleSetPrimary({required this.id});
  @override List<Object?> get props => [id];
}
class VehicleSetAutoCharge extends ProfileEvent {
  final String id, macAddress;
  const VehicleSetAutoCharge({required this.id, required this.macAddress});
  @override List<Object?> get props => [id, macAddress];
}

abstract class ProfileState extends Equatable {
  const ProfileState();
  @override List<Object?> get props => [];
}
class ProfileInitial extends ProfileState { const ProfileInitial(); }
class ProfileLoading extends ProfileState { const ProfileLoading(); }
class ProfileLoaded extends ProfileState {
  final UserProfileEntity profile;
  final List<VehicleEntity> vehicles;
  final List<SessionDeviceEntity> sessions;
  const ProfileLoaded({required this.profile, this.vehicles = const [], this.sessions = const []});
  ProfileLoaded copyWith({UserProfileEntity? profile, List<VehicleEntity>? vehicles, List<SessionDeviceEntity>? sessions}) =>
      ProfileLoaded(profile: profile ?? this.profile, vehicles: vehicles ?? this.vehicles, sessions: sessions ?? this.sessions);
  @override List<Object?> get props => [profile, vehicles, sessions];
}
class ProfileError extends ProfileState {
  final String message; const ProfileError({required this.message});
  @override List<Object?> get props => [message];
}
class ProfileSuccess extends ProfileState {
  final String message; const ProfileSuccess({required this.message});
  @override List<Object?> get props => [message];
}

class ProfileBloc extends Bloc<ProfileEvent, ProfileState> {
  final IProfileRepository _repository;

  ProfileBloc({required IProfileRepository repository})
      : _repository = repository, super(const ProfileInitial()) {
    on<ProfileLoad>(_onLoad);
    on<ProfileUpdate>(_onUpdate);
    on<ProfileChangePassword>(_onChangePassword);
    on<ProfileLoadSessions>(_onLoadSessions);
    on<ProfileRevokeSession>(_onRevokeSession);
    on<ProfileRevokeAllSessions>(_onRevokeAllSessions);
    on<VehicleLoad>(_onVehicleLoad);
    on<VehicleAdd>(_onVehicleAdd);
    on<VehicleDelete>(_onVehicleDelete);
    on<VehicleSetPrimary>(_onVehicleSetPrimary);
    on<VehicleSetAutoCharge>(_onVehicleSetAutoCharge);
  }

  Future<void> _onLoad(ProfileLoad e, Emitter<ProfileState> emit) async {
    emit(const ProfileLoading());
    final result = await _repository.getProfile();
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (p) => emit(ProfileLoaded(profile: p)),
    );
  }

  Future<void> _onUpdate(ProfileUpdate e, Emitter<ProfileState> emit) async {
    final current = state;
    emit(const ProfileLoading());
    final result = await _repository.updateProfile(fullName: e.fullName, phone: e.phone, dateOfBirth: e.dateOfBirth);
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (p) {
        if (current is ProfileLoaded) emit(current.copyWith(profile: p));
        else emit(ProfileLoaded(profile: p));
        emit(const ProfileSuccess(message: 'Cập nhật hồ sơ thành công'));
      },
    );
  }

  Future<void> _onChangePassword(ProfileChangePassword e, Emitter<ProfileState> emit) async {
    final result = await _repository.changePassword(currentPassword: e.currentPassword, newPassword: e.newPassword);
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (_) => emit(const ProfileSuccess(message: 'Đổi mật khẩu thành công')),
    );
  }

  Future<void> _onLoadSessions(ProfileLoadSessions e, Emitter<ProfileState> emit) async {
    final result = await _repository.getSessions();
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (sessions) {
        final current = state;
        if (current is ProfileLoaded) emit(current.copyWith(sessions: sessions));
      },
    );
  }

  Future<void> _onRevokeSession(ProfileRevokeSession e, Emitter<ProfileState> emit) async {
    await _repository.revokeSession(e.id);
    add(const ProfileLoadSessions());
  }

  Future<void> _onRevokeAllSessions(ProfileRevokeAllSessions e, Emitter<ProfileState> emit) async {
    await _repository.revokeAllSessions();
    emit(const ProfileSuccess(message: 'Đã đăng xuất tất cả thiết bị'));
  }

  Future<void> _onVehicleLoad(VehicleLoad e, Emitter<ProfileState> emit) async {
    final result = await _repository.getVehicles();
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (vehicles) {
        final current = state;
        if (current is ProfileLoaded) emit(current.copyWith(vehicles: vehicles));
      },
    );
  }

  Future<void> _onVehicleAdd(VehicleAdd e, Emitter<ProfileState> emit) async {
    final result = await _repository.addVehicle(plateNumber: e.plateNumber, model: e.model, brand: e.brand, connectorType: e.connectorType, batteryCapacityKwh: e.batteryCapacityKwh);
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (_) { add(const VehicleLoad()); emit(const ProfileSuccess(message: 'Đã thêm phương tiện')); },
    );
  }

  Future<void> _onVehicleDelete(VehicleDelete e, Emitter<ProfileState> emit) async {
    await _repository.deleteVehicle(e.id);
    add(const VehicleLoad());
  }

  Future<void> _onVehicleSetPrimary(VehicleSetPrimary e, Emitter<ProfileState> emit) async {
    await _repository.setPrimaryVehicle(e.id);
    add(const VehicleLoad());
  }

  Future<void> _onVehicleSetAutoCharge(VehicleSetAutoCharge e, Emitter<ProfileState> emit) async {
    await _repository.setAutoCharge(e.id, e.macAddress);
    emit(const ProfileSuccess(message: 'Đã cấu hình AutoCharge'));
  }
}
