part of 'auth_bloc.dart';

/// Base auth bloc states
sealed class AuthState extends Equatable {
  const AuthState();
  @override
  List<Object?> get props => [];
}

/// Initial authentication loading state
final class AuthInitial extends AuthState {
  const AuthInitial();
}

/// General async processing state
final class AuthLoading extends AuthState {
  const AuthLoading();
}

/// Authenticated session state storing identity models and arrears flags
final class AuthAuthenticated extends AuthState {
  final UserEntity user;
  final bool hasArrears;
  const AuthAuthenticated({required this.user, required this.hasArrears});
  @override
  List<Object?> get props => [user, hasArrears];
}

/// Anonymous state representing logged out profiles
final class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

/// Guard state indicating registration completed but verification is required
final class AuthEmailVerificationRequired extends AuthState {
  final String email;
  const AuthEmailVerificationRequired({required this.email});
  @override
  List<Object?> get props => [email];
}

/// Verified state signifying email registration complete
final class AuthEmailVerified extends AuthState {
  const AuthEmailVerified();
}

/// Guard state prompting for 6-digit MFA confirmation
final class AuthMfaRequired extends AuthState {
  final String email;
  final String password;
  const AuthMfaRequired({required this.email, required this.password});
  @override
  List<Object?> get props => [email, password];
}

/// Faulted auth state containing the mapped failure
final class AuthError extends AuthState {
  final String message;
  final DateTime? lockedUntil;
  const AuthError({required this.message, this.lockedUntil});
  @override
  List<Object?> get props => [message, lockedUntil];
}
