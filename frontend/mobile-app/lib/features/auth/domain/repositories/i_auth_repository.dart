import 'package:dartz/dartz.dart';
import '../../domain/entities/user_entity.dart';
import '../../../../core/errors/failures.dart';

/// Login session execution result containing authentication tokens or an MFA status prompt.
class LoginResult {
  final String? accessToken;
  final String? refreshToken;
  final bool mfaRequired;
  final UserEntity? user;

  const LoginResult({
    this.accessToken,
    this.refreshToken,
    required this.mfaRequired,
    this.user,
  });
}

/// Authentication and Security Operations Repository Interface
///
/// Defines the data-layer contract for issuing credentials, verifying multi-factor
/// tokens, persisting refresh bounds, and completing registration validation flows.
abstract class IAuthRepository {
  /// Resolves user credentials against the authorization provider.
  Future<Either<Failure, LoginResult>> login({
    required String email,
    required String password,
  });

  /// Validates a multi-factor authentication (MFA) time-based one-time password (TOTP).
  Future<Either<Failure, LoginResult>> verifyMfa({
    required String email,
    required String password,
    required String otpCode,
  });

  /// Submits onboarding registration details to instantiate a new customer account.
  Future<Either<Failure, UserEntity>> register({
    required String email,
    required String password,
    required String fullName,
    String? phone,
    required DateTime dateOfBirth,
  });

  /// Renews an expired short-lived access token using a long-lived refresh token.
  Future<Either<Failure, String>> refreshToken();

  /// Destroys current active tokens and logs out the active customer device.
  Future<Either<Failure, void>> logout();

  /// Queries the currently active session profile context.
  Future<Either<Failure, UserEntity>> getMe();

  /// Validates onboarding validation tokens or verification pins.
  Future<Either<Failure, LoginResult>> verifyEmail({String? token, String? code});

  /// Triggers a resend request for account registration verification links.
  Future<Either<Failure, void>> resendVerification({required String email});
}
