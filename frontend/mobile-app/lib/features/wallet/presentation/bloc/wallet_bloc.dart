import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/entities/wallet_entity.dart';
import '../../domain/repositories/i_wallet_repository.dart';

/// Wallet Management Business Logic Component (BLoC)
///
/// Coordinates all states and operations related to user wallets, including balance checks,
/// top-up gateway redirections, transaction log paginations, and arrears payments.
part 'wallet_event.dart';
part 'wallet_state.dart';

class WalletBloc extends Bloc<WalletEvent, WalletState> {
  final IWalletRepository _repository;

  WalletBloc({required IWalletRepository repository})
      : _repository = repository,
        super(const WalletInitial()) {
    on<WalletLoad>(_onLoad);
    on<WalletTopUpInitiate>(_onTopUp);
    on<WalletLoadTransactions>(_onLoadTransactions);
    on<WalletPayArrears>(_onPayArrears);
  }

  Future<void> _onLoad(
      WalletLoad event, Emitter<WalletState> emit) async {
    emit(const WalletLoading());
    final balanceResult = await _repository.getBalance();
    final txResult =
        await _repository.getTransactions(page: 1, limit: 20);

    balanceResult.fold(
      (f) => emit(WalletError(message: f.message)),
      (wallet) {
        txResult.fold(
          (f) => emit(WalletLoaded(wallet: wallet, transactions: const [])),
          (txs) => emit(WalletLoaded(
            wallet: wallet,
            transactions: txs,
            hasMorePages: txs.length == 20,
          )),
        );
      },
    );
  }

  Future<void> _onTopUp(
      WalletTopUpInitiate event, Emitter<WalletState> emit) async {
    emit(const WalletLoading());
    final result = await _repository.topUp(event.amount);
    result.fold(
      (f) => emit(WalletError(message: f.message)),
      (topUp) => emit(WalletTopUpInitiated(
        vnpayUrl: topUp.vnpayUrl,
        transactionId: topUp.transactionId,
      )),
    );
  }

  Future<void> _onLoadTransactions(
      WalletLoadTransactions event, Emitter<WalletState> emit) async {
    final result = await _repository.getTransactions(
        page: event.page, limit: 20);
    result.fold(
      (f) {},
      (txs) {
        final current = state;
        if (current is WalletLoaded) {
          final merged = event.page == 1
              ? txs
              : [...current.transactions, ...txs];
          emit(WalletLoaded(
            wallet: current.wallet,
            transactions: merged,
            hasMorePages: txs.length == 20,
          ));
        }
      },
    );
  }

  Future<void> _onPayArrears(
      WalletPayArrears event, Emitter<WalletState> emit) async {
    emit(const WalletLoading());
    final result = await _repository.payArrears();
    result.fold(
      (f) => emit(WalletError(message: f.message)),
      (_) => add(const WalletLoad()),
    );
  }
}
