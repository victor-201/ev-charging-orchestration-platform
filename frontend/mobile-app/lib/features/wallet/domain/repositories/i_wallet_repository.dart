import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/wallet_entity.dart';

/// Wallet Operations Repository Interface
///
/// Defines the data-layer contract for retrieving balances, executing payment checkouts,
/// processing top-up flows, and pulling paginated transaction logs.
abstract class IWalletRepository {
  /// Retrieves the current wallet balance and dynamic arrears status indicators.
  Future<Either<Failure, WalletEntity>> getBalance();

  /// Initiates a payment gateway top-up session for a specific monetary amount.
  Future<Either<Failure, TopUpResultEntity>> topUp(double amount);

  /// Settles an outstanding charging session invoice using the wallet balance.
  Future<Either<Failure, TransactionEntity>> walletPay(String transactionId);

  /// Queries a paginated list of chronological wallet transaction records.
  Future<Either<Failure, List<TransactionEntity>>> getTransactions({
    int page = 1,
    int limit = 20,
    String? type,
  });

  /// Settles accumulated platform arrears using the current wallet balance.
  Future<Either<Failure, void>> payArrears();

  /// Initiates a direct VNPay payment to settle outstanding arrears.
  /// The user's EVolt wallet balance remains unchanged.
  Future<Either<Failure, TopUpResultEntity>> payArrearsVNPay();

  /// Wallet-first payment for a completed charging session.
  /// POST /payments/pay — tries wallet balance first, falls back to VNPay.
  Future<Either<Failure, SessionPaymentResultEntity>> sessionPay({
    required double amount,
    required String sessionId,
  });
}
