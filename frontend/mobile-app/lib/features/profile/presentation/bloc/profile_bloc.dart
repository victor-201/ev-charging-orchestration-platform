import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/profile_entity.dart';
import '../../domain/repositories/i_profile_repository.dart';

part 'profile_event.dart';
part 'profile_state.dart';

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
    on<ProfileLoadAuditLogs>(_onLoadAuditLogs);
    on<VehicleLoadAuditLogs>(_onVehicleLoadAuditLogs);
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
    // updateProfile only accepts avatarUrl and address
    final result = await _repository.updateProfile(avatarUrl: e.avatarUrl, address: e.address);
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (p) {
        if (current is ProfileLoaded) {
          emit(current.copyWith(profile: p));
        } else {
          emit(ProfileLoaded(profile: p));
        }
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
    // addVehicle uses modelName/year/color — matches POST /users/me/vehicles API
    final result = await _repository.addVehicle(
      plateNumber: e.plateNumber,
      modelName: e.modelName,
      brand: e.brand,
      year: e.year,
      color: e.color,
      batteryCapacityKwh: e.batteryCapacityKwh,
      macAddress: e.macAddress,
      vinNumber: e.vinNumber,
    );
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
    // setAutoCharge accepts macAddress, vinNumber, and autochargeEnabled
    final result = await _repository.setAutoCharge(
      e.vehicleId,
      macAddress: e.macAddress,
      vinNumber: e.vinNumber,
      autochargeEnabled: e.autochargeEnabled,
    );
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (_) { add(const VehicleLoad()); emit(const ProfileSuccess(message: 'Đã cấu hình AutoCharge')); },
    );
  }

  Future<void> _onLoadAuditLogs(ProfileLoadAuditLogs e, Emitter<ProfileState> emit) async {
    final result = await _repository.getAuditLogs();
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (logs) {
        final current = state;
        if (current is ProfileLoaded) emit(current.copyWith(auditLogs: logs));
      },
    );
  }

  Future<void> _onVehicleLoadAuditLogs(VehicleLoadAuditLogs e, Emitter<ProfileState> emit) async {
    final result = await _repository.getVehicleAuditLogs(e.vehicleId);
    result.fold(
      (f) => emit(ProfileError(message: f.message)),
      (logs) {
        final current = state;
        if (current is ProfileLoaded) emit(current.copyWith(vehicleAuditLogs: logs));
      },
    );
  }
}
