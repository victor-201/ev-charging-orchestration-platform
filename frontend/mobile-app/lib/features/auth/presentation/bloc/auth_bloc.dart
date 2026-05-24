import 'package:equatable/equatable.dart';
import 'package:hydrated_bloc/hydrated_bloc.dart';
import '../../domain/entities/user_entity.dart';
import '../../domain/repositories/i_auth_repository.dart';
import '../../../../core/errors/failures.dart';

part 'auth_event.dart';
part 'auth_state.dart';

/// AuthBloc — manages JWT lifecycle, MFA, and outstanding debt flags.
/// HydratedBloc — persists state across application restarts.
class AuthBloc extends HydratedBloc<AuthEvent, AuthState> {
  final IAuthRepository _repository;

  AuthBloc({required IAuthRepository repository})
      : _repository = repository,
        super(const AuthInitial()) {
    on<AuthCheckRequested>(_onCheckRequested);
    on<AuthLoginRequested>(_onLoginRequested);
    on<AuthRegisterRequested>(_onRegisterRequested);
    on<AuthMfaVerifyRequested>(_onMfaVerify);
    on<AuthLogoutRequested>(_onLogoutRequested);
    on<AuthTokensLoaded>(_onTokensLoaded);
    on<AuthVerifyEmailCodeRequested>(_onVerifyEmailCode);
    on<AuthVerifyMagicLinkRequested>(_onVerifyMagicLink);
    on<AuthResendVerificationRequested>(_onResendVerification);
  }

  Future<void> _onCheckRequested(
      AuthCheckRequested event, Emitter<AuthState> emit) async {
    // Always verify the token with the server — do not trust the HydratedBloc
    // cache blindly, as the access token may have expired since last session.
    emit(const AuthLoading());
    final cachedState = state; // preserve HydratedBloc snapshot before loading
    final result = await _repository.getMe();
    result.fold(
      (failure) {
        // Keep the user logged in if it's just a connectivity issue.
        // Log them out only when the server explicitly rejects the token (401).
        if (failure is NetworkFailure && cachedState is AuthAuthenticated) {
          emit(cachedState); // restore cached
        } else {
          emit(const AuthUnauthenticated());
        }
      },
      (user) => emit(AuthAuthenticated(user: user, hasArrears: user.hasArrears)),
    );
  }

  Future<void> _onLoginRequested(
      AuthLoginRequested event, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    final result = await _repository.login(
      email: event.email,
      password: event.password,
    );
    result.fold(
      (failure) {
        if (failure is AccountLockedFailure) {
          emit(AuthError(
            message: failure.message,
            lockedUntil: failure.lockedUntil,
          ));
        } else if (failure is EmailNotVerifiedFailure) {
          emit(AuthEmailVerificationRequired(email: event.email));
        } else {
          emit(AuthError(message: failure.message));
        }
      },
      (loginResult) {
        if (loginResult.mfaRequired) {
          emit(AuthMfaRequired(email: event.email));
        } else if (loginResult.user != null) {
          emit(AuthAuthenticated(
            user: loginResult.user!,
            hasArrears: loginResult.user!.hasArrears,
          ));
        } else {
          emit(const AuthError(message: 'Login failed'));
        }
      },
    );
  }

  Future<void> _onRegisterRequested(
      AuthRegisterRequested event, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    final result = await _repository.register(
      email: event.email,
      password: event.password,
      fullName: event.fullName,
      phone: event.phone,
      dateOfBirth: event.dateOfBirth,
    );
    result.fold(
      (failure) => emit(AuthError(message: failure.message)),
      (_) {
        // After registration → require email verification
        emit(AuthEmailVerificationRequired(email: event.email));
      },
    );
  }

  Future<void> _onVerifyEmailCode(
      AuthVerifyEmailCodeRequested event, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    final result = await _repository.verifyEmail(code: event.code);
    result.fold(
      (failure) => emit(AuthError(message: failure.message)),
      (loginResult) {
        if (loginResult.accessToken != null) {
          add(AuthCheckRequested()); // Load user info and go to Authenticated
        } else {
          emit(const AuthEmailVerified());
        }
      },
    );
  }

  Future<void> _onVerifyMagicLink(
      AuthVerifyMagicLinkRequested event, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    final result = await _repository.verifyEmail(token: event.token);
    result.fold(
      (failure) => emit(AuthError(message: failure.message)),
      (loginResult) {
        if (loginResult.accessToken != null) {
          add(AuthCheckRequested()); // Load user info and go to Authenticated
        } else {
          emit(const AuthEmailVerified());
        }
      },
    );
  }

  Future<void> _onResendVerification(
      AuthResendVerificationRequested event, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    final result = await _repository.resendVerification(email: event.email);
    result.fold(
      (failure) => emit(AuthError(message: failure.message)),
      (_) => emit(AuthEmailVerificationRequired(email: event.email)),
    );
  }

  Future<void> _onMfaVerify(
      AuthMfaVerifyRequested event, Emitter<AuthState> emit) async {
    emit(const AuthLoading());
    final result =
        await _repository.verifyMfa(otpCode: event.otpCode);
    result.fold(
      (failure) => emit(AuthError(message: failure.message)),
      (loginResult) {
        if (loginResult.user != null) {
          emit(AuthAuthenticated(
            user: loginResult.user!,
            hasArrears: loginResult.user!.hasArrears,
          ));
        } else {
          emit(const AuthError(message: 'MFA verification failed'));
        }
      },
    );
  }

  Future<void> _onLogoutRequested(
      AuthLogoutRequested event, Emitter<AuthState> emit) async {
    await _repository.logout();
    HydratedBloc.storage.delete('last_visited_route');
    emit(const AuthUnauthenticated());
  }

  void _onTokensLoaded(AuthTokensLoaded event, Emitter<AuthState> emit) {
    emit(AuthAuthenticated(
      user: event.user,
      hasArrears: event.hasArrears,
    ));
  }

  // ── HydratedBloc serialization ────────────────────────────
  @override
  AuthState? fromJson(Map<String, dynamic> json) {
    try {
      if (json['type'] == 'authenticated') {
        final userData = json['user'] as Map<String, dynamic>;
        final user = UserEntity(
          id: userData['id'],
          email: userData['email'],
          fullName: userData['fullName'],
          phone: userData['phone'],
          dateOfBirth: userData['dateOfBirth'] != null
              ? DateTime.tryParse(userData['dateOfBirth'])
              : null,
          role: userData['role'],
          mfaEnabled: userData['mfaEnabled'] == true,
          hasArrears: userData['hasArrears'] == true,
        );
        return AuthAuthenticated(
          user: user,
          hasArrears: json['hasArrears'] == true,
        );
      }
    } catch (_) {}
    return const AuthUnauthenticated();
  }

  @override
  Map<String, dynamic>? toJson(AuthState state) {
    if (state is AuthAuthenticated) {
      return {
        'type': 'authenticated',
        'hasArrears': state.hasArrears,
        'user': {
          'id': state.user.id,
          'email': state.user.email,
          'fullName': state.user.fullName,
          'phone': state.user.phone,
          'dateOfBirth': state.user.dateOfBirth?.toIso8601String(),
          'role': state.user.role,
          'mfaEnabled': state.user.mfaEnabled,
          'hasArrears': state.user.hasArrears,
        },
      };
    }
    return null;
  }
}
