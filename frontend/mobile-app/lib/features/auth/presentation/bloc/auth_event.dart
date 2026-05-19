part of 'auth_bloc.dart';

/// Base auth bloc events
sealed class AuthEvent extends Equatable {
  const AuthEvent();
  @override
  List<Object?> get props => [];
}

final class AuthCheckRequested extends AuthEvent {
  const AuthCheckRequested();
}

final class AuthLoginRequested extends AuthEvent {
  final String email;
  final String password;
  const AuthLoginRequested({required this.email, required this.password});
  @override
  List<Object?> get props => [email, password];
}

final class AuthRegisterRequested extends AuthEvent {
  final String email;
  final String password;
  final String fullName;
  final String? phone;
  final DateTime dateOfBirth;

  const AuthRegisterRequested({
    required this.email,
    required this.password,
    required this.fullName,
    this.phone,
    required this.dateOfBirth,
  });

  @override
  List<Object?> get props => [email, password, fullName, phone, dateOfBirth];
}

final class AuthMfaVerifyRequested extends AuthEvent {
  final String otpCode;
  const AuthMfaVerifyRequested({required this.otpCode});
  @override
  List<Object?> get props => [otpCode];
}

final class AuthLogoutRequested extends AuthEvent {
  const AuthLogoutRequested();
}

final class AuthTokensLoaded extends AuthEvent {
  final UserEntity user;
  final bool hasArrears;
  const AuthTokensLoaded({required this.user, required this.hasArrears});
  @override
  List<Object?> get props => [user, hasArrears];
}

final class AuthVerifyEmailCodeRequested extends AuthEvent {
  final String code;
  const AuthVerifyEmailCodeRequested({required this.code});
  @override
  List<Object?> get props => [code];
}

final class AuthVerifyMagicLinkRequested extends AuthEvent {
  final String token;
  const AuthVerifyMagicLinkRequested({required this.token});
  @override
  List<Object?> get props => [token];
}

final class AuthResendVerificationRequested extends AuthEvent {
  final String email;
  const AuthResendVerificationRequested({required this.email});
  @override
  List<Object?> get props => [email];
}
