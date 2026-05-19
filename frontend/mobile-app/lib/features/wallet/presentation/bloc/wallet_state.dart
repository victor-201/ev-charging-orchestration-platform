part of 'wallet_bloc.dart';

sealed class WalletState extends Equatable {
  const WalletState();
  @override
  List<Object?> get props => [];
}

final class WalletInitial extends WalletState {
  const WalletInitial();
}

final class WalletLoading extends WalletState {
  const WalletLoading();
}

final class WalletLoaded extends WalletState {
  final WalletEntity wallet;
  final List<TransactionEntity> transactions;
  final bool hasMorePages;
  const WalletLoaded({
    required this.wallet,
    required this.transactions,
    this.hasMorePages = false,
  });
  @override
  List<Object?> get props => [wallet, transactions];
}

final class WalletTopUpInitiated extends WalletState {
  final String vnpayUrl;
  final String transactionId;
  const WalletTopUpInitiated({required this.vnpayUrl, required this.transactionId});
  @override
  List<Object?> get props => [vnpayUrl, transactionId];
}

final class WalletError extends WalletState {
  final String message;
  const WalletError({required this.message});
  @override
  List<Object?> get props => [message];
}
