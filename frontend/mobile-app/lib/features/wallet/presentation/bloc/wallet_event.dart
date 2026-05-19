part of 'wallet_bloc.dart';

sealed class WalletEvent extends Equatable {
  const WalletEvent();
  @override
  List<Object?> get props => [];
}

final class WalletLoad extends WalletEvent {
  const WalletLoad();
}

final class WalletTopUpInitiate extends WalletEvent {
  final double amount;
  const WalletTopUpInitiate({required this.amount});
  @override
  List<Object?> get props => [amount];
}

final class WalletLoadTransactions extends WalletEvent {
  final int page;
  const WalletLoadTransactions({this.page = 1});
  @override
  List<Object?> get props => [page];
}

final class WalletPayArrears extends WalletEvent {
  const WalletPayArrears();
}
