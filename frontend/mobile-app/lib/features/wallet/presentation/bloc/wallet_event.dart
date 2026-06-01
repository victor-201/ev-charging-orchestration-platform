part of 'wallet_bloc.dart';

sealed class WalletEvent extends Equatable {
  const WalletEvent();
  @override
  List<Object?> get props => [];
}

final class WalletLoad extends WalletEvent {
  final String? type;
  const WalletLoad({this.type});
  @override
  List<Object?> get props => [type];
}

final class WalletTopUpInitiate extends WalletEvent {
  final double amount;
  const WalletTopUpInitiate({required this.amount});
  @override
  List<Object?> get props => [amount];
}

final class WalletLoadTransactions extends WalletEvent {
  final int page;
  final String? type;
  const WalletLoadTransactions({this.page = 1, this.type});
  @override
  List<Object?> get props => [page, type];
}

final class WalletPayArrears extends WalletEvent {
  const WalletPayArrears();
}

final class WalletPayArrearsVNPayInitiate extends WalletEvent {
  const WalletPayArrearsVNPayInitiate();
}
